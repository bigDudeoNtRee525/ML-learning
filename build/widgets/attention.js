/* widget: attention — self-attention over a short fixed sentence.
   Every token "looks at" every other token. We give each token a tiny fixed 2-D
   embedding, set q = k = (a scaled copy of) that embedding, score with q·k / √d,
   then softmax each row so the attention from one query to all keys sums to 1.
   The user picks a QUERY token (click it, or use ◀ ▶). We show the weights three ways:
     (a) curved arcs from the query to every token, opacity ∝ weight,
     (b) a shaded bar under each token with the weight number,
     (c) a full n×n heatmap (rows = queries, cols = keys) with the query row boxed.
   Selecting a new query animates the bars/arcs/row toward the new softmax. */
MLViz.register('attention', function(node, V){
  var P = V.panel(node, {
    title: 'Self-attention: who looks at whom',
    caption: 'Pick a query token (click it, or use ◀ ▶). Each token gets a tiny fixed 2-D embedding; the score for query→key is their dot product ÷ √d, and a softmax turns the row of scores into attention weights that sum to 1. Arcs and the bars under each word show those weights; the n×n grid shows every query row at once. Weights are illustrative, computed via softmax of query·key similarities.'
  });
  var C = V.makeCanvas(P.body, 580, 340), ctx = C.ctx;

  // ---------- fixed sentence + tiny deterministic 2-D embeddings ----------
  // Directions are hand-picked so related content words score higher with each
  // other: cat / sat / mat sit in a similar region; the / on cluster apart.
  var TOKENS = ['the', 'cat', 'sat', 'on', 'the', 'mat'];
  var EMB = [
    [ 0.95, -0.30],  // the   (function word A)
    [ 0.55,  1.15],  // cat   (subject — content)
    [ 0.20,  1.30],  // sat   (verb — content, near cat & mat)
    [ 1.05, -0.15],  // on    (function word, near "the")
    [ 0.95, -0.30],  // the   (same as token 0)
    [-0.10,  1.20]   // mat   (object — content, near sat)
  ];
  var N = TOKENS.length;
  var D = 2;                 // embedding / key dimension d_k
  var SQRT_D = Math.sqrt(D);

  // q = k = embedding here (simplest faithful illustration: self-similarity).
  function dot(a, b){ var s = 0; for(var i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

  // full n×n attention matrix: row i = softmax over j of (e_i · e_j)/√d
  function attentionMatrix(){
    var M = [];
    for(var i = 0; i < N; i++){
      var scores = [];
      var mx = -Infinity;
      for(var j = 0; j < N; j++){
        var s = dot(EMB[i], EMB[j]) / SQRT_D;
        scores.push(s);
        if(s > mx) mx = s;
      }
      var sum = 0, row = [];
      for(var k = 0; k < N; k++){ var e = Math.exp(scores[k] - mx); row.push(e); sum += e; }
      for(var m = 0; m < N; m++) row[m] /= sum;
      M.push(row);
    }
    return M;
  }
  var ATTN = attentionMatrix();   // ATTN[query][key]

  // ---------- state ----------
  var state = { q: 1 };           // selected query token (start on "cat")
  // animated weights shown for the currently-selected query
  var shownW = ATTN[state.q].slice();
  var fromW  = shownW.slice();
  var toW    = shownW.slice();
  var anim   = { active: false, t: 0, dur: 22 };

  function selectQuery(i){
    if(i === state.q && anim.active === false){
      // re-affirm; still animate from current shown for a gentle pulse
    }
    state.q = ((i % N) + N) % N;
    fromW = shownW.slice();
    toW   = ATTN[state.q].slice();
    anim.active = true; anim.t = 0;
  }

  // ---------- layout ----------
  var m = { l: 14, r: 14, t: 50, b: 14 };
  // token row geometry
  var rowY = 96;                                  // baseline-ish y for token chips
  var chipH = 30;
  function chipW(){ return (C.w - m.l - m.r) / N; }
  function chipCX(i){ return m.l + chipW() * (i + 0.5); }
  // bar block under tokens
  var barTop = rowY + 26;
  var barMaxH = 46;
  // heatmap geometry (bottom block)
  var heat = { top: barTop + barMaxH + 26 };

  // ---------- drawing helpers ----------
  function roundRect(x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(){
    var p = V.palette();
    ctx.clearRect(0, 0, C.w, C.h);

    var W = shownW;     // weights currently displayed (animated)
    var cw = chipW();
    var qx = chipCX(state.q);

    // ===== title strip =====
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '700 12px Inter, system-ui, sans-serif';
    ctx.fillStyle = p.ink;
    ctx.fillText('query: ', m.l, 22);
    var qw = ctx.measureText('query: ').width;
    ctx.fillStyle = p.accent;
    ctx.fillText('"' + TOKENS[state.q] + '"', m.l + qw, 22);
    ctx.fillStyle = p.soft;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('weights softmax(query·key / √d),  row sums to 1', C.w - m.r, 22);

    // ===== (a) curved arcs from query to every token =====
    // draw arcs first so chips sit on top
    var arcTopY = rowY - chipH / 2 - 2;
    for(var j = 0; j < N; j++){
      var w = W[j];
      var tx = chipCX(j);
      // arc height grows with horizontal distance so far links bow higher
      var dist = Math.abs(tx - qx);
      var lift = 18 + dist * 0.42;
      var ctrlY = arcTopY - lift;
      var midX = (qx + tx) / 2;
      ctx.beginPath();
      ctx.moveTo(qx, arcTopY);
      ctx.quadraticCurveTo(midX, ctrlY, tx, arcTopY);
      // opacity & width ∝ weight; keep a faint floor so tiny links still hint
      var a = 0.10 + 0.85 * w;
      ctx.globalAlpha = V.clamp(a, 0, 1);
      ctx.strokeStyle = (j === state.q) ? p.accent2 : p.accent;
      ctx.lineWidth = 1 + 6 * w;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ===== token chips (the row) =====
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    for(var i = 0; i < N; i++){
      var cx = chipCX(i);
      var bw = cw - 12;
      var bx = cx - bw / 2;
      var by = rowY - chipH / 2;
      var isQ = (i === state.q);
      roundRect(bx, by, bw, chipH, 8);
      if(isQ){
        ctx.fillStyle = p.accent;
        ctx.fill();
      } else {
        ctx.fillStyle = p.panel;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = p.grid;
        ctx.stroke();
      }
      ctx.fillStyle = isQ ? '#ffffff' : p.ink;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(TOKENS[i], cx, rowY);
    }

    // ===== (b) weight bars + numbers under each token =====
    for(var b2 = 0; b2 < N; b2++){
      var cx2 = chipCX(b2);
      var ww = W[b2];
      var bw2 = cw - 22;
      var bx2 = cx2 - bw2 / 2;
      // track
      roundRect(bx2, barTop, bw2, barMaxH, 5);
      ctx.fillStyle = p.panel; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = p.grid; ctx.stroke();
      // fill (grows upward from bottom)
      var fh = barMaxH * ww;
      if(fh > 0.5){
        roundRect(bx2, barTop + (barMaxH - fh), bw2, fh, 5);
        ctx.fillStyle = (b2 === state.q) ? p.accent2 : p.accent;
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // number
      ctx.font = '700 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = p.ink;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(ww.toFixed(2), cx2, barTop + barMaxH + 4);
    }
    // small label for the bar block
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillStyle = p.soft;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('attention weight from "' + TOKENS[state.q] + '" to each token', m.l, barTop - 6);

    // ===== (c) full n×n heatmap =====
    drawHeatmap(p);
  }

  function drawHeatmap(p){
    var labelW = 40;                 // room for row labels on the left
    var topLabelH = 16;              // room for column labels on top
    var gx = m.l + labelW;
    var gy = heat.top + topLabelH;
    var availW = C.w - m.r - gx;
    var availH = C.h - 6 - gy;
    var cell = Math.min(availW / N, availH / N);
    var gridW = cell * N;

    // column header (keys)
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillStyle = p.soft;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for(var c = 0; c < N; c++){
      ctx.fillText(TOKENS[c], gx + cell * (c + 0.5), gy - 3);
    }
    // axis caption ("keys →"): place to the right of the grid so it never
    // overlaps the column token labels.
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = p.soft;
    ctx.fillText('keys →', gx + cell * N + 10, gy + cell * 0.5);
    // rows axis caption ("queries ↓") under the row labels
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('queries ↓', gx + cell * N + 10, gy + cell * 1.6);

    // cells
    for(var r = 0; r < N; r++){
      // row label (query)
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillStyle = (r === state.q) ? p.accent : p.soft;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(TOKENS[r], gx - 5, gy + cell * (r + 0.5));

      for(var cc = 0; cc < N; cc++){
        var w = (r === state.q) ? shownW[cc] : ATTN[r][cc];  // animate only active row
        var x = gx + cell * cc;
        var y = gy + cell * r;
        // intensity: blend panel -> accent by weight
        ctx.fillStyle = p.accent;
        ctx.globalAlpha = 0.12 + 0.85 * w;
        ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        ctx.globalAlpha = 1;
        // number for the highlighted query row only (keeps grid readable)
        if(r === state.q && cell >= 18){
          ctx.font = '9px Inter, system-ui, sans-serif';
          ctx.fillStyle = (w > 0.45) ? '#ffffff' : p.soft;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(w.toFixed(2), x + cell / 2, y + cell / 2);
        }
      }
    }

    // grid lines
    ctx.strokeStyle = p.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    for(var gi = 0; gi <= N; gi++){
      ctx.moveTo(gx + cell * gi, gy);            ctx.lineTo(gx + cell * gi, gy + cell * N);
      ctx.moveTo(gx, gy + cell * gi);            ctx.lineTo(gx + gridW, gy + cell * gi);
    }
    ctx.stroke();

    // highlight the selected query row with a box
    ctx.strokeStyle = p.accent; ctx.lineWidth = 2.2;
    ctx.strokeRect(gx + 1, gy + cell * state.q + 1, gridW - 2, cell - 2);

    // store hit region for clicking the grid to change query
    heat.hit = { gx: gx, gy: gy, cell: cell };
  }

  // ---------- interaction: click a token chip or a heatmap row to set query ----------
  C.canvas.style.touchAction = 'manipulation';
  function pick(ev){
    var pos = C.canvas.evtPos(ev);
    var cw = chipW();
    // token row band
    if(pos.y >= rowY - chipH / 2 - 4 && pos.y <= barTop + barMaxH + 4){
      var idx = Math.floor((pos.x - m.l) / cw);
      if(idx >= 0 && idx < N){ selectQuery(idx); return; }
    }
    // heatmap rows -> set query = that row
    if(heat.hit){
      var h = heat.hit;
      if(pos.x >= h.gx && pos.x <= h.gx + h.cell * N &&
         pos.y >= h.gy && pos.y <= h.gy + h.cell * N){
        var r = Math.floor((pos.y - h.gy) / h.cell);
        if(r >= 0 && r < N){ selectQuery(r); }
      }
    }
  }
  C.canvas.addEventListener('mousedown', pick);
  C.canvas.addEventListener('touchstart', function(ev){ ev.preventDefault(); pick(ev); }, { passive: false });

  // ---------- controls ----------
  P.controls.appendChild(V.button('◀ prev query', function(){ selectQuery(state.q - 1); }, { ghost: true }));
  P.controls.appendChild(V.button('next query ▶', function(){ selectQuery(state.q + 1); }, { ghost: true }));

  // ---------- animated loop ----------
  V.loop(function(){
    if(anim.active){
      anim.t++;
      var tt = V.clamp(anim.t / anim.dur, 0, 1);
      // easeOutCubic
      var e = 1 - Math.pow(1 - tt, 3);
      for(var i = 0; i < N; i++) shownW[i] = V.lerp(fromW[i], toW[i], e);
      if(tt >= 1){ anim.active = false; for(var k = 0; k < N; k++) shownW[k] = toW[k]; }
    }
    draw();
  }, node);

  draw();
});
