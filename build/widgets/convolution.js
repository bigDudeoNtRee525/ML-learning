/* convolution — the flagship CNN demo. A 3x3 kernel slides over a 9x9 grayscale
   image; at each valid position we compute the element-wise product sum (cross-
   correlation) and write it to the matching cell of a 7x7 output feature map.
   Presets: Identity, Box blur, Sharpen, Vertical edge (Sobel-x), Horizontal edge
   (Sobel-y). Play / Pause / Step / Reset + speed. Uses 'valid' convolution so the
   output is (9-2) x (9-2) = 7x7. Mathematically: Y[i,j] = sum_{a,b} X[i+a,j+b]*K[a,b]. */
MLViz.register('convolution', function(node, V){
  var P = V.panel(node, {
    title: 'Convolution: slide a filter, build a feature map',
    caption: 'A 3×3 filter (kernel) slides over the 9×9 image one cell at a time. At each spot we multiply the 9 overlapping pairs and add them up — that single number fills one cell of the output feature map. This is "valid" convolution, so the 9×9 image yields a 7×7 map (9−3+1=7). Pick a kernel preset to see different patterns appear: edge filters light up where brightness changes; blur smooths; sharpen exaggerates. Press Play, or Step one position at a time.'
  });
  var C = V.makeCanvas(P.body, 580, 348), ctx = C.ctx;

  // ---- dimensions ----
  var N = 9;            // image side
  var F = 3;            // filter side
  var OUT = N - F + 1;  // valid output side = 7

  // ---- deterministic seeded grayscale image with a clear shape/edge ----
  // Values in [0,1]. We build a scene with a bright diagonal-ish blob + a sharp
  // left/right edge + a small dark square, so every filter produces visible structure.
  function mulberry32(a){
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var IMG = [];
  (function buildImage(){
    var rng = mulberry32(20240612);
    for(var r = 0; r < N; r++){
      var row = [];
      for(var c = 0; c < N; c++){
        var v;
        // base: dark left half, bright right half -> a strong vertical edge at col 4..5
        v = (c >= 5) ? 0.82 : 0.16;
        // a bright horizontal band across the middle rows -> a horizontal edge
        if(r >= 3 && r <= 4) v = Math.max(v, 0.7);
        // a small dark square top-right -> a corner / contrast feature
        if(r <= 2 && c >= 6) v = 0.1;
        // a bright dot bottom-left -> isolated blob
        if(r >= 6 && r <= 7 && c >= 1 && c <= 2) v = 0.9;
        // a touch of seeded texture so cells aren't perfectly flat
        v += (rng() - 0.5) * 0.06;
        row.push(V.clamp(v, 0, 1));
      }
      IMG.push(row);
    }
  })();

  // ---- kernel presets (each 3x3, row-major) ----
  var PRESETS = [
    { name: 'Identity',        k: [[0,0,0],[0,1,0],[0,0,0]],          desc: 'copies the centre pixel' },
    { name: 'Box blur',        k: [[1/9,1/9,1/9],[1/9,1/9,1/9],[1/9,1/9,1/9]], desc: 'averages the 3×3 patch → smooth' },
    { name: 'Sharpen',         k: [[0,-1,0],[-1,5,-1],[0,-1,0]],      desc: 'boosts centre, subtracts neighbours' },
    { name: 'Vertical edge',   k: [[1,0,-1],[2,0,-2],[1,0,-1]],       desc: 'Sobel-x: fires on left↔right changes' },
    { name: 'Horizontal edge', k: [[1,2,1],[0,0,0],[-1,-2,-1]],       desc: 'Sobel-y: fires on top↔bottom changes' }
  ];
  var presetIdx = 3; // start on Vertical edge — most visually instructive

  // ---- the output feature map (raw sums) + a 'filled' mask ----
  var OUTMAP = [];     // OUTMAP[i][j] raw convolution value
  var FILLED = [];     // FILLED[i][j] true once computed
  function resetMap(){
    OUTMAP = []; FILLED = [];
    for(var i = 0; i < OUT; i++){
      OUTMAP.push(new Array(OUT).fill(0));
      FILLED.push(new Array(OUT).fill(false));
    }
  }
  resetMap();

  // current window top-left position (oi, oj) over the OUTPUT grid; equals image
  // top-left because valid conv with stride 1.
  var pos = 0;             // linear index 0..OUT*OUT-1 of the NEXT cell to compute
  var lastProducts = null; // 3x3 array of products for the cell just computed
  var lastSum = 0;
  var lastCell = null;     // {i,j} of last computed output cell

  // compute convolution at output cell (i,j): sum_{a,b} IMG[i+a][j+b]*K[a][b]
  function convAt(i, j){
    var K = PRESETS[presetIdx].k;
    var sum = 0, prods = [];
    for(var a = 0; a < F; a++){
      var prow = [];
      for(var b = 0; b < F; b++){
        var pr = IMG[i + a][j + b] * K[a][b];
        prow.push(pr);
        sum += pr;
      }
      prods.push(prow);
    }
    return { sum: sum, prods: prods };
  }

  // ---- compute the value range of the WHOLE current feature map so we can
  // normalise to grayscale consistently (precomputed for the active kernel). ----
  var mapMin = 0, mapMax = 1;
  function computeRange(){
    var lo = Infinity, hi = -Infinity;
    for(var i = 0; i < OUT; i++){
      for(var j = 0; j < OUT; j++){
        var s = convAt(i, j).sum;
        if(s < lo) lo = s; if(s > hi) hi = s;
      }
    }
    if(hi - lo < 1e-9){ hi = lo + 1; } // avoid divide-by-zero on flat maps
    mapMin = lo; mapMax = hi;
  }
  computeRange();

  // normalise a raw sum to [0,1] for grayscale display
  function norm(v){ return V.clamp((v - mapMin) / (mapMax - mapMin), 0, 1); }

  // ---- animation control ----
  var playing = false;
  var stepFrames = 26;     // frames between auto-steps (speed control adjusts)
  var frameCnt = 0;

  // perform one step: compute the cell at current pos, advance pos
  function doStep(){
    if(pos >= OUT * OUT){ playing = false; updateBtns(); return; }
    var i = Math.floor(pos / OUT), j = pos % OUT;
    var r = convAt(i, j);
    OUTMAP[i][j] = r.sum;
    FILLED[i][j] = true;
    lastProducts = r.prods;
    lastSum = r.sum;
    lastCell = { i: i, j: j };
    pos++;
    if(pos >= OUT * OUT){ playing = false; updateBtns(); }
  }

  function fullReset(){
    playing = false;
    pos = 0;
    lastProducts = null; lastCell = null; lastSum = 0;
    resetMap();
    updateBtns();
  }

  function selectPreset(idx){
    presetIdx = idx;
    computeRange();
    fullReset();
    // active preset = solid mlviz-btn; others = ghost (both theme-aware via CSS vars)
    for(var b = 0; b < presetBtns.length; b++){
      presetBtns[b].className = 'mlviz-btn' + (b === idx ? '' : ' ghost');
    }
  }

  // ---- controls ----
  // Kernel-preset chooser. Reuse the built-in .mlviz-btn classes so the buttons
  // recolour correctly on light/dark theme; the active one is solid, rest ghost.
  var presetBtns = [];
  var presetRow = V.el('div', { class: 'mlviz-presetrow',
    style: 'display:flex;flex-wrap:wrap;gap:.45rem;justify-content:center;width:100%;' });
  PRESETS.forEach(function(pre, idx){
    var b = V.el('button', {
      class: 'mlviz-btn' + (idx === presetIdx ? '' : ' ghost'),
      type: 'button',
      html: pre.name,
      onclick: function(){ selectPreset(idx); }
    });
    presetBtns.push(b);
    presetRow.appendChild(b);
  });
  P.controls.appendChild(presetRow);

  var playBtn = V.button('Play', function(){
    if(pos >= OUT * OUT) fullReset();
    playing = !playing;
    updateBtns();
  });
  var stepBtn = V.button('Step', function(){ playing = false; doStep(); updateBtns(); }, { ghost: true });
  var resetBtn = V.button('Reset', function(){ fullReset(); }, { ghost: true });
  P.controls.appendChild(playBtn);
  P.controls.appendChild(stepBtn);
  P.controls.appendChild(resetBtn);

  var speed = V.slider({
    label: 'speed', min: 1, max: 10, step: 1, value: 5,
    format: function(v){ return v + '×'; },
    onInput: function(v){ stepFrames = Math.round(42 - v * 3.6); } // 1→~38 frames, 10→~6 frames
  });
  stepFrames = Math.round(42 - 5 * 3.6);
  P.controls.appendChild(speed.wrap);

  function updateBtns(){
    playBtn.textContent = playing ? 'Pause' : (pos >= OUT * OUT ? 'Replay' : 'Play');
  }
  updateBtns();

  // ---- layout geometry ----
  // Left: 9x9 image. Right: 7x7 feature map. Below image: kernel + products readout.
  function layout(){
    var topPad = 24, leftPad = 8;
    // image grid (left)
    var imgCell = 21;
    var imgX = leftPad, imgY = topPad;
    var imgW = N * imgCell;
    // feature map grid (right)
    var mapCell = 21;
    var mapW = OUT * mapCell;
    var mapX = C.w - mapW - 12;
    var mapY = topPad;
    return { imgX: imgX, imgY: imgY, imgCell: imgCell, imgW: imgW,
             mapX: mapX, mapY: mapY, mapCell: mapCell, mapW: mapW, topPad: topPad };
  }

  function grayCss(t){ var g = Math.round(t * 255); return 'rgb(' + g + ',' + g + ',' + g + ')'; }

  function draw(){
    var p = V.palette();
    ctx.clearRect(0, 0, C.w, C.h);
    var L = layout();
    ctx.textBaseline = 'alphabetic';

    // ---------- titles ----------
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = p.ink;
    ctx.fillText('Image  (9×9)', L.imgX, L.imgY - 9);
    ctx.fillText('Feature map  (7×7)', L.mapX, L.mapY - 9);

    // current output cell to draw a window for: the one we are ABOUT to compute,
    // or the last computed if finished.
    var curI, curJ, isPreview;
    if(pos < OUT * OUT){ curI = Math.floor(pos / OUT); curJ = pos % OUT; isPreview = true; }
    else if(lastCell){ curI = lastCell.i; curJ = lastCell.j; isPreview = false; }
    else { curI = 0; curJ = 0; isPreview = true; }

    // ---------- image grid ----------
    for(var r = 0; r < N; r++){
      for(var c = 0; c < N; c++){
        var x = L.imgX + c * L.imgCell, y = L.imgY + r * L.imgCell;
        ctx.fillStyle = grayCss(IMG[r][c]);
        ctx.fillRect(x, y, L.imgCell, L.imgCell);
      }
    }
    // thin grid lines over the image
    ctx.strokeStyle = p.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(var gi = 0; gi <= N; gi++){
      ctx.moveTo(L.imgX + gi * L.imgCell, L.imgY); ctx.lineTo(L.imgX + gi * L.imgCell, L.imgY + L.imgW);
      ctx.moveTo(L.imgX, L.imgY + gi * L.imgCell); ctx.lineTo(L.imgX + L.imgW, L.imgY + gi * L.imgCell);
    }
    ctx.stroke();
    // outer border
    ctx.strokeStyle = p.axis; ctx.lineWidth = 1.4;
    ctx.strokeRect(L.imgX, L.imgY, L.imgW, L.imgW);

    // highlight the current 3x3 window on the image
    var wx = L.imgX + curJ * L.imgCell, wy = L.imgY + curI * L.imgCell;
    var wSize = F * L.imgCell;
    // dim everything else slightly to make the window pop
    ctx.save();
    ctx.fillStyle = p.dark ? 'rgba(10,12,16,0.42)' : 'rgba(250,250,248,0.40)';
    ctx.beginPath();
    ctx.rect(L.imgX, L.imgY, L.imgW, L.imgW);
    ctx.rect(wx, wy, wSize, wSize); // inner reverse for even-odd
    ctx.fill('evenodd');
    ctx.restore();
    // window border
    ctx.strokeStyle = p.accent; ctx.lineWidth = 2.4;
    ctx.strokeRect(wx + 0.5, wy + 0.5, wSize - 1, wSize - 1);
    // grid inside window
    ctx.strokeStyle = p.accent; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for(var gw = 1; gw < F; gw++){
      ctx.moveTo(wx + gw * L.imgCell, wy); ctx.lineTo(wx + gw * L.imgCell, wy + wSize);
      ctx.moveTo(wx, wy + gw * L.imgCell); ctx.lineTo(wx + wSize, wy + gw * L.imgCell);
    }
    ctx.stroke(); ctx.globalAlpha = 1;

    // ---------- feature map grid ----------
    for(var oi = 0; oi < OUT; oi++){
      for(var oj = 0; oj < OUT; oj++){
        var ox = L.mapX + oj * L.mapCell, oy = L.mapY + oi * L.mapCell;
        if(FILLED[oi][oj]){
          ctx.fillStyle = grayCss(norm(OUTMAP[oi][oj]));
        } else {
          ctx.fillStyle = p.panel;
        }
        ctx.fillRect(ox, oy, L.mapCell, L.mapCell);
      }
    }
    // grid lines over feature map
    ctx.strokeStyle = p.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1; ctx.beginPath();
    for(var mg = 0; mg <= OUT; mg++){
      ctx.moveTo(L.mapX + mg * L.mapCell, L.mapY); ctx.lineTo(L.mapX + mg * L.mapCell, L.mapY + OUT * L.mapCell);
      ctx.moveTo(L.mapX, L.mapY + mg * L.mapCell); ctx.lineTo(L.mapX + OUT * L.mapCell, L.mapY + mg * L.mapCell);
    }
    ctx.stroke();
    ctx.strokeStyle = p.axis; ctx.lineWidth = 1.4;
    ctx.strokeRect(L.mapX, L.mapY, L.mapW, L.mapW);

    // highlight the target output cell with the same accent
    var tx = L.mapX + curJ * L.mapCell, ty = L.mapY + curI * L.mapCell;
    ctx.strokeStyle = p.accent; ctx.lineWidth = 2.4;
    ctx.strokeRect(tx + 0.5, ty + 0.5, L.mapCell - 1, L.mapCell - 1);

    // connector arrow from window centre to the target cell
    ctx.strokeStyle = p.accent2 || p.teal; ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(wx + wSize, wy + wSize / 2);
    ctx.lineTo(tx, ty + L.mapCell / 2);
    ctx.stroke();
    // arrowhead
    var ahx = tx, ahy = ty + L.mapCell / 2;
    var ang = Math.atan2((ty + L.mapCell / 2) - (wy + wSize / 2), tx - (wx + wSize));
    ctx.beginPath();
    ctx.moveTo(ahx, ahy);
    ctx.lineTo(ahx - 7 * Math.cos(ang - 0.4), ahy - 7 * Math.sin(ang - 0.4));
    ctx.lineTo(ahx - 7 * Math.cos(ang + 0.4), ahy - 7 * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fillStyle = p.accent2 || p.teal; ctx.fill();
    ctx.globalAlpha = 1;

    // ---------- kernel display (bottom-left, under the image) ----------
    var K = PRESETS[presetIdx].k;
    var kCell = 27;
    var kX = L.imgX + 4, kY = L.imgY + L.imgW + 24;
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillStyle = p.ink; ctx.textAlign = 'left';
    ctx.fillText('Kernel (3×3) — ' + PRESETS[presetIdx].name, kX, kY - 8);
    for(var ka = 0; ka < F; ka++){
      for(var kb = 0; kb < F; kb++){
        var kx = kX + kb * kCell, ky = kY + ka * kCell;
        ctx.fillStyle = p.dark ? '#1b212b' : '#f3f1ee';
        ctx.fillRect(kx, ky, kCell, kCell);
        ctx.strokeStyle = p.faint; ctx.lineWidth = 1;
        ctx.strokeRect(kx + 0.5, ky + 0.5, kCell - 1, kCell - 1);
        ctx.fillStyle = p.ink;
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(fmtNum(K[ka][kb]), kx + kCell / 2, ky + kCell / 2 + 0.5);
      }
    }
    ctx.textBaseline = 'alphabetic';
    // kernel description
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillStyle = p.soft; ctx.textAlign = 'left';
    ctx.fillText(PRESETS[presetIdx].desc, kX + F * kCell + 12, kY + 14);

    // ---------- products readout (right of kernel) ----------
    var pX = kX + F * kCell + 12;
    var pY = kY + 34;
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = p.ink;
    var label = (lastCell)
      ? 'Σ products at output (' + lastCell.i + ',' + lastCell.j + ') :'
      : 'Press Step or Play to compute the first cell.';
    ctx.fillText(label, pX, pY);

    if(lastProducts){
      // show the 9 products compactly as patch ⊙ kernel = sum
      ctx.font = '11px Inter, system-ui, sans-serif';
      var terms = [];
      for(var a = 0; a < F; a++){
        for(var b = 0; b < F; b++){
          var iv = IMG[lastCell.i + a][lastCell.j + b];
          var kv = K[a][b];
          if(Math.abs(kv) < 1e-9) continue; // skip zero-weight terms for readability
          terms.push(iv.toFixed(2) + '·' + fmtNum(kv));
        }
      }
      // wrap terms into lines
      var line = '', lines = [], maxChars = 30;
      for(var ti = 0; ti < terms.length; ti++){
        var add = (line ? line + ' + ' : '') + terms[ti];
        if(add.length > maxChars && line){ lines.push(line); line = terms[ti]; }
        else line = add;
      }
      if(line) lines.push(line);
      ctx.fillStyle = p.soft;
      for(var li = 0; li < lines.length && li < 3; li++){
        ctx.fillText(lines[li] + (li < lines.length - 1 ? ' +' : ''), pX, pY + 18 + li * 15);
      }
      // the sum, emphasised
      ctx.font = '700 13px Inter, system-ui, sans-serif';
      ctx.fillStyle = p.accent;
      ctx.fillText('= ' + lastSum.toFixed(2), pX, pY + 18 + Math.min(lines.length, 3) * 15 + 4);
    }

    // ---------- progress / status ----------
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillStyle = p.soft; ctx.textAlign = 'right';
    var done = Math.min(pos, OUT * OUT);
    ctx.fillText(done + ' / ' + (OUT * OUT) + ' cells', C.w - 10, L.mapY + OUT * L.mapCell + 16);
    if(pos >= OUT * OUT){
      ctx.fillStyle = p.good;
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.fillText('✓ feature map complete', C.w - 10, L.mapY + OUT * L.mapCell + 32);
    }
  }

  // format kernel numbers nicely (1/9 -> .11, integers stay integers)
  function fmtNum(v){
    if(Math.abs(v) < 1e-9) return '0';
    if(Math.abs(v - Math.round(v)) < 1e-9) return '' + Math.round(v);
    return v.toFixed(2).replace(/^(-?)0\./, '$1.');
  }

  // ---- animation loop ----
  V.loop(function(){
    if(playing){
      frameCnt++;
      if(frameCnt >= stepFrames){ frameCnt = 0; doStep(); updateBtns(); }
    }
    draw();
  }, node);

  // initial paint + active preset styling handled via CSS data-active; ensure draw runs
  selectPreset(presetIdx);
});
