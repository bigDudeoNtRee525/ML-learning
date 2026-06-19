MLViz.register('knn', function(node, V){
  var P = V.panel(node, {
    title: 'k-Nearest Neighbors — vote of the k closest',
    caption: 'Drag the white "?" query point. Its k nearest training points are ringed and linked; their majority class wins (shown by the query\'s colour and the tally below). The shaded background is the decision region — every spot is coloured by what kNN would predict there. Small k = jagged/noisy regions; large k = smoother.'
  });

  var C = V.makeCanvas(P.body, 560, 340), ctx = C.ctx;

  // ---- plot geometry (data space is 0..10 in both axes) ----
  var PAD = { l: 38, r: 14, t: 14, b: 30 };
  var PW = C.w - PAD.l - PAD.r;
  var PH = C.h - PAD.t - PAD.b;
  function sx(x){ return PAD.l + (x / 10) * PW; }       // data -> screen x
  function sy(y){ return PAD.t + (1 - y / 10) * PH; }   // data -> screen y (flip)

  // ---- deterministic seeded RNG (mulberry32) ----
  function mulberry32(a){
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- build ~24 seeded training points in 3 classes (clusters + a little noise) ----
  // class index 0,1,2 -> colours chosen fresh in draw() from palette.
  var CLASSES = 3;
  var train = [];
  (function makeData(){
    var rng = mulberry32(20260618);
    var centers = [ {x:3.0, y:3.2}, {x:7.0, y:3.0}, {x:5.2, y:7.4} ];
    var perClass = 8; // 3 * 8 = 24
    function gauss(){ // Box-Muller from seeded uniforms
      var u = Math.max(1e-6, rng()), v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    for(var c = 0; c < CLASSES; c++){
      for(var i = 0; i < perClass; i++){
        var x = centers[c].x + gauss() * 1.15;
        var y = centers[c].y + gauss() * 1.15;
        x = V.clamp(x, 0.4, 9.6);
        y = V.clamp(y, 0.4, 9.6);
        train.push({ x: x, y: y, c: c });
      }
    }
  })();

  var query = { x: 5.0, y: 5.0 };
  var k = 5;

  // ---- decision-region grid (depends only on training points + k) ----
  var GRID = 44;                // 44x44 cells
  var regionGrid = null;        // Int8Array of predicted class per cell
  var regionDirty = true;

  function classifyAt(px, py, kk){
    // distances to all training points
    var n = train.length;
    var idx = new Array(n);
    var d2 = new Array(n);
    for(var i = 0; i < n; i++){
      var dx = train[i].x - px, dy = train[i].y - py;
      d2[i] = dx * dx + dy * dy;
      idx[i] = i;
    }
    // partial sort: pick kk smallest (selection — n is tiny so this is cheap)
    var votes = new Array(CLASSES);
    for(var c = 0; c < CLASSES; c++) votes[c] = 0;
    var used = kk < n ? kk : n;
    var nearest = [];
    for(var s = 0; s < used; s++){
      var best = s;
      for(var j = s + 1; j < n; j++){ if(d2[idx[j]] < d2[idx[best]]) best = j; }
      var tmp = idx[s]; idx[s] = idx[best]; idx[best] = tmp;
      votes[train[idx[s]].c]++;
      nearest.push(idx[s]);
    }
    // winner = highest vote; tie-break -> smaller class index that hit the count first
    var win = 0;
    for(var c2 = 1; c2 < CLASSES; c2++){ if(votes[c2] > votes[win]) win = c2; }
    return { win: win, votes: votes, nearest: nearest };
  }

  function rebuildRegions(){
    regionGrid = new Int8Array(GRID * GRID);
    for(var gy = 0; gy < GRID; gy++){
      for(var gx = 0; gx < GRID; gx++){
        var px = (gx + 0.5) / GRID * 10;
        var py = (gy + 0.5) / GRID * 10;
        regionGrid[gy * GRID + gx] = classifyAt(px, py, k).win;
      }
    }
    regionDirty = false;
  }

  // ---- controls ----
  var kSlider = V.slider({
    label: 'neighbors k', min: 1, max: 15, step: 1, value: k,
    format: function(v){ return String(v); },
    onInput: function(v){ k = v; regionDirty = true; draw(); }
  });
  P.controls.appendChild(kSlider.wrap);
  P.controls.appendChild(V.button('Reset query', function(){
    query.x = 5.0; query.y = 5.0; draw();
  }, { ghost: true }));

  // ---- helpers for class colours (fresh palette each draw) ----
  function classColors(p){ return [ p.blue, p.good, p.warn ]; }

  // ---- drawing ----
  function draw(){
    var p = V.palette();
    var cols = classColors(p);
    if(regionDirty || !regionGrid) rebuildRegions();

    ctx.clearRect(0, 0, C.w, C.h);

    // panel background for plot
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, C.w, C.h);

    // decision regions (faint fill per cell)
    var cw = PW / GRID, ch = PH / GRID;
    for(var gy = 0; gy < GRID; gy++){
      for(var gx = 0; gx < GRID; gx++){
        var cls = regionGrid[gy * GRID + gx];
        ctx.fillStyle = cols[cls];
        ctx.globalAlpha = p.dark ? 0.16 : 0.13;
        // screen: gx increases right; gy=0 is bottom of data, so flip
        var X = PAD.l + gx * cw;
        var Y = PAD.t + (GRID - 1 - gy) * ch;
        ctx.fillRect(X, Y, cw + 0.6, ch + 0.6);
      }
    }
    ctx.globalAlpha = 1;

    // plot frame + axis labels
    ctx.strokeStyle = p.axis;
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD.l, PAD.t, PW, PH);
    ctx.fillStyle = p.soft;
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('feature x₁', PAD.l + PW / 2, C.h - 8);
    ctx.save();
    ctx.translate(12, PAD.t + PH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('feature x₂', 0, 0);
    ctx.restore();

    // classify the query NOW (live on drag)
    var res = classifyAt(query.x, query.y, k);
    var nearestSet = {};
    res.nearest.forEach(function(i){ nearestSet[i] = true; });

    var qx = sx(query.x), qy = sy(query.y);

    // lines from query to its k neighbors
    ctx.lineWidth = 1.4;
    res.nearest.forEach(function(i){
      var t = train[i];
      ctx.strokeStyle = cols[t.c];
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(qx, qy);
      ctx.lineTo(sx(t.x), sy(t.y));
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // training points
    for(var i = 0; i < train.length; i++){
      var t = train[i];
      var X = sx(t.x), Y = sy(t.y);
      // neighbor ring
      if(nearestSet[i]){
        ctx.beginPath();
        ctx.arc(X, Y, 9.5, 0, Math.PI * 2);
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(X, Y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = cols[t.c];
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = p.bg;
      ctx.stroke();
    }

    // query point — coloured by winning class, white outline + "?"
    ctx.beginPath();
    ctx.arc(qx, qy, 9, 0, Math.PI * 2);
    ctx.fillStyle = cols[res.win];
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = p.dark ? '#ffffff' : '#1f2328';
    ctx.stroke();
    ctx.fillStyle = p.dark ? '#0b0e13' : '#ffffff';
    ctx.font = 'bold 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', qx, qy + 0.5);
    ctx.textBaseline = 'alphabetic';

    // ---- legend + vote tally (top-left, inside plot) ----
    var names = ['A', 'B', 'C'];
    var lx = PAD.l + 8, ly = PAD.t + 8, lh = 17;
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    // backing
    ctx.globalAlpha = p.dark ? 0.82 : 0.86;
    ctx.fillStyle = p.panel;
    ctx.fillRect(lx - 6, ly - 4, 132, lh * CLASSES + 8);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = p.faint;
    ctx.lineWidth = 1;
    ctx.strokeRect(lx - 6, ly - 4, 132, lh * CLASSES + 8);
    for(var c = 0; c < CLASSES; c++){
      var yy = ly + c * lh + 8;
      ctx.beginPath();
      ctx.arc(lx + 4, yy - 4, 5, 0, Math.PI * 2);
      ctx.fillStyle = cols[c];
      ctx.fill();
      var isWin = (c === res.win);
      ctx.fillStyle = p.ink;
      ctx.font = (isWin ? 'bold ' : '') + '12px Inter, system-ui, sans-serif';
      ctx.fillText('class ' + names[c] + ':  ' + res.votes[c] + ' vote' + (res.votes[c] === 1 ? '' : 's') + (isWin ? '  ✓' : ''), lx + 14, yy);
    }
  }

  // ---- dragging the query ----
  var dragging = false;
  function pickQuery(pos){
    // start drag if near query, else jump query to click
    var qx = sx(query.x), qy = sy(query.y);
    var dist = Math.hypot(pos.x - qx, pos.y - qy);
    return dist <= 18;
  }
  function setQueryFromPos(pos){
    var dx = (pos.x - PAD.l) / PW * 10;
    var dy = (1 - (pos.y - PAD.t) / PH) * 10;
    query.x = V.clamp(dx, 0, 10);
    query.y = V.clamp(dy, 0, 10);
  }
  C.canvas.style.touchAction = 'none';
  C.canvas.style.cursor = 'pointer';

  function down(ev){
    var pos = C.canvas.evtPos(ev);
    dragging = true;
    if(!pickQuery(pos)) setQueryFromPos(pos); // jump to click point
    draw();
    ev.preventDefault();
  }
  function move(ev){
    if(!dragging) return;
    setQueryFromPos(C.canvas.evtPos(ev));
    draw();
    ev.preventDefault();
  }
  function up(){ dragging = false; }

  C.canvas.addEventListener('mousedown', down);
  C.canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  C.canvas.addEventListener('touchstart', down, { passive: false });
  C.canvas.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', up);

  draw();
  V.onTheme(draw);
});
