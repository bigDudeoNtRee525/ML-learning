/* linreg-fit — Linear regression: drag the slope/intercept knobs to make the
   line hug the data; residuals + live MSE update; "Best fit" animates the line
   to the closed-form least-squares optimum so the MSE bottoms out. */
MLViz.register('linreg-fit', function(node, V){
  var P = V.panel(node, {
    title: 'Fit the line: residuals & MSE',
    caption: 'Each green dot is a data point. Adjust slope w and intercept b to draw a line through them. ' +
             'The red bars are residuals (vertical gaps the model is trying to shrink); their shaded squares are the squared errors that MSE averages. ' +
             'Hit "Best fit" to animate the line to the exact least-squares optimum and watch the MSE bottom out.'
  });
  var C = V.makeCanvas(P.body, 560, 320), ctx = C.ctx;

  // --- deterministic data: ~9 points roughly along y = 0.62 x + 1.4 + noise ---
  // mulberry32 seeded PRNG so layout is identical on every load.
  function mulberry32(a){ return function(){ a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  var rnd = mulberry32(20260619);
  var DATA = [];
  (function(){
    var trueW = 0.62, trueB = 1.4;
    for(var i = 0; i < 9; i++){
      var x = 1 + i * 1.0;                      // x = 1..9
      var noise = (rnd() - 0.5) * 3.0;          // symmetric noise in data units
      var y = trueW * x + trueB + noise;
      DATA.push({ x: x, y: y });
    }
  })();

  // --- closed-form least-squares optimum (computed once) ---
  function leastSquares(pts){
    var n = pts.length, sx = 0, sy = 0;
    for(var i = 0; i < n; i++){ sx += pts[i].x; sy += pts[i].y; }
    var mx = sx / n, my = sy / n, num = 0, den = 0;
    for(i = 0; i < n; i++){
      var dx = pts[i].x - mx;
      num += dx * (pts[i].y - my);
      den += dx * dx;
    }
    var w = den === 0 ? 0 : num / den;
    var b = my - w * mx;
    return { w: w, b: b };
  }
  var OPT = leastSquares(DATA);

  function mse(w, b){
    var s = 0;
    for(var i = 0; i < DATA.length; i++){
      var r = (w * DATA[i].x + b) - DATA[i].y;
      s += r * r;
    }
    return s / DATA.length;
  }
  var MSE_OPT = mse(OPT.w, OPT.b);

  // --- view / state ---
  var state = { w: 0.0, b: 5.0, anim: null };

  // data ranges -> pixel mapping (fixed so the line/squares never jump)
  var pad = { l: 46, r: 16, t: 18, b: 40 };
  var X_MIN = 0, X_MAX = 10;
  var Y_MIN = 0, Y_MAX = 11;
  function px(x){ return pad.l + (x - X_MIN) / (X_MAX - X_MIN) * (C.w - pad.l - pad.r); }
  function py(y){ return (C.h - pad.b) - (y - Y_MIN) / (Y_MAX - Y_MIN) * (C.h - pad.t - pad.b); }
  // pixels-per-unit on the Y axis: use this for BOTH sides of the error square so
  // its footprint is a true geometric square (side = |residual| in the same scale).
  var PPU_Y = (C.h - pad.t - pad.b) / (Y_MAX - Y_MIN);

  // --- controls ---
  var sw = V.slider({ label: 'slope w', min: -2, max: 3, step: 0.01, value: state.w,
    format: function(v){ return v.toFixed(2); },
    onInput: function(v){ stopAnim(); state.w = v; readout(); draw(); } });
  var sb = V.slider({ label: 'intercept b', min: -2, max: 10, step: 0.01, value: state.b,
    format: function(v){ return v.toFixed(2); },
    onInput: function(v){ stopAnim(); state.b = v; readout(); draw(); } });
  P.controls.appendChild(sw.wrap);
  P.controls.appendChild(sb.wrap);

  var bestBtn = V.button('Best fit', bestFit);
  var resetBtn = V.button('Reset', reset, { ghost: true });
  P.controls.appendChild(bestBtn);
  P.controls.appendChild(resetBtn);

  // live MSE readout line under the canvas
  var read = V.el('div', { class: 'mlviz-readline' });
  P.body.appendChild(read);
  function readout(){
    var p = V.palette();
    var m = mse(state.w, state.b);
    var atOpt = Math.abs(m - MSE_OPT) < 1e-4;
    read.innerHTML =
      'ŷ = <b>' + state.w.toFixed(2) + '</b> x + <b>' + state.b.toFixed(2) + '</b>' +
      ' &nbsp;·&nbsp; MSE = <b style="color:' + (atOpt ? p.good : p.bad) + '">' + m.toFixed(3) + '</b>' +
      ' &nbsp;·&nbsp; best possible = <b style="color:' + p.good + '">' + MSE_OPT.toFixed(3) + '</b>';
  }

  function stopAnim(){ if(state.anim){ state.anim.stop(); state.anim = null; bestBtn.disabled = false; } }

  function bestFit(){
    stopAnim();
    bestBtn.disabled = true;
    var w0 = state.w, b0 = state.b, t0 = null, dur = 900;
    state.anim = V.loop(function(t){
      if(t0 === null) t0 = t;
      var k = V.clamp((t - t0) / dur, 0, 1);
      var e = 1 - Math.pow(1 - k, 3);           // ease-out cubic
      state.w = V.lerp(w0, OPT.w, e);
      state.b = V.lerp(b0, OPT.b, e);
      sw.set(state.w); sb.set(state.b);
      readout(); draw();
      if(k >= 1){ state.w = OPT.w; state.b = OPT.b; sw.set(state.w); sb.set(state.b);
        readout(); draw(); stopAnim(); }
    }, node);
  }

  function reset(){
    stopAnim();
    state.w = 0.0; state.b = 5.0;
    sw.set(state.w); sb.set(state.b);
    readout(); draw();
  }

  // --- drawing ---
  function draw(){
    var p = V.palette();
    ctx.clearRect(0, 0, C.w, C.h);

    var x0 = px(X_MIN), x1 = px(X_MAX), y0 = py(Y_MIN), y1 = py(Y_MAX);

    // grid
    ctx.strokeStyle = p.grid; ctx.lineWidth = 1; ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for(var gx = 0; gx <= X_MAX; gx += 2){
      var xx = px(gx);
      ctx.beginPath(); ctx.moveTo(xx, y1); ctx.lineTo(xx, y0); ctx.stroke();
      ctx.fillStyle = p.faint; ctx.fillText('' + gx, xx, y0 + 6);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for(var gy = 0; gy <= Y_MAX - 1; gy += 2){
      var yy = py(gy);
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
      ctx.fillStyle = p.faint; ctx.fillText('' + gy, x0 - 6, yy);
    }

    // axes
    ctx.strokeStyle = p.axis; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke(); // x-axis
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.stroke(); // y-axis

    // axis labels
    ctx.fillStyle = p.soft; ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('feature x', (x0 + x1) / 2, C.h - 4);
    ctx.save();
    ctx.translate(12, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'top';
    ctx.fillText('target y', 0, 0);
    ctx.restore();

    var w = state.w, b = state.b;

    // squared-error squares + residual bars (draw first so dots sit on top)
    for(var i = 0; i < DATA.length; i++){
      var d = DATA[i];
      var dpx = px(d.x), dpy = py(d.y);
      var pred = w * d.x + b;
      var ppy = py(pred);
      var res = pred - d.y;                      // residual in data units (signed)
      // square footprint: side = |residual| measured on the Y scale, used for BOTH
      // axes so the drawn square genuinely represents the squared error.
      var sidePxY = Math.abs(ppy - dpy);
      var sidePxX = Math.abs(res) * PPU_Y;
      // place square to the right of the residual line, spanning the residual vertically
      var topPy = Math.min(dpy, ppy);
      ctx.fillStyle = p.bad;
      ctx.globalAlpha = 0.13;
      ctx.fillRect(dpx, topPy, sidePxX, sidePxY);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.bad; ctx.lineWidth = 1; ctx.globalAlpha = 0.35;
      ctx.strokeRect(dpx, topPy, sidePxX, sidePxY);
      ctx.globalAlpha = 1;

      // residual bar (point -> line)
      ctx.strokeStyle = p.bad; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(dpx, dpy); ctx.lineTo(dpx, ppy); ctx.stroke();
    }

    // the fitted line, clipped to the plot box
    var lyA = w * X_MIN + b, lyB = w * X_MAX + b;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y1, x1 - x0, y0 - y1); ctx.clip();
    ctx.strokeStyle = p.accent; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(px(X_MIN), py(lyA)); ctx.lineTo(px(X_MAX), py(lyB)); ctx.stroke();
    ctx.restore();

    // data points
    for(i = 0; i < DATA.length; i++){
      ctx.fillStyle = p.good;
      ctx.strokeStyle = p.panel; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px(DATA[i].x), py(DATA[i].y), 4.5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }

    // legend
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    var lx = x0 + 8, ly = y1 + 12;
    ctx.fillStyle = p.good; ctx.beginPath(); ctx.arc(lx + 4, ly, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.soft; ctx.fillText('data', lx + 14, ly);
    ctx.strokeStyle = p.accent; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(lx + 56, ly); ctx.lineTo(lx + 76, ly); ctx.stroke();
    ctx.fillStyle = p.soft; ctx.fillText('your line', lx + 82, ly);
    ctx.strokeStyle = p.bad; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(lx + 138, ly - 5); ctx.lineTo(lx + 138, ly + 5); ctx.stroke();
    ctx.fillStyle = p.soft; ctx.fillText('residual', lx + 146, ly);
  }

  readout();
  draw();
  V.onTheme(function(){ readout(); draw(); });
});
