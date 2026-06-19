/* Underfitting vs overfitting via polynomial degree.
   Fits a degree-d polynomial to seeded noisy points by least squares
   (Vandermonde -> normal equations -> Gaussian elimination w/ partial
   pivoting + tiny ridge). Shows train vs held-out test error, the fitted
   curve, the true function, and an inset error-vs-degree plot. */
MLViz.register('overfitting', function(node, V){
  var P = V.panel(node, {
    title: 'Underfitting vs overfitting',
    caption: 'Drag the degree slider. Degree 1 is too stiff (both errors high). High degree threads every training point (train error → 0) but wiggles wildly between them, so the held-out test error climbs. The sweet spot is in the middle. Green dots = training data, hollow dots = held-out test data.'
  });

  var W = 560, H = 340;
  var C = V.makeCanvas(P.body, W, H), ctx = C.ctx;

  var MAXDEG = 9;
  var DOMAIN = [-1, 1];          // keep x in [-1,1] for numerical stability
  var YRANGE = [-1.7, 1.7];      // plotting y-range

  var state = { degree: 3, train: [], test: [], coeffsByDeg: [], errByDeg: [] };

  /* ---------- deterministic RNG (mulberry32) ---------- */
  function mulberry32(a){
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- the true underlying function (gentle, smooth) ---------- */
  function trueF(x){ return Math.sin(2.3 * x) * 0.85; }

  /* standard-normal sample via Box-Muller from a uniform RNG */
  function gauss(rng){
    var u1 = Math.max(1e-9, rng()), u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /* ---------- generate data (14 train + 14 test, same function) ---------- */
  function genData(seed){
    var rng = mulberry32(seed);
    var nTrain = 14, nTest = 14, noise = 0.22;
    var train = [], test = [];
    var i, x;
    for(i = 0; i < nTrain; i++){
      // spread x across [-1,1] with a little jitter, deterministic given seed
      x = V.lerp(DOMAIN[0] + 0.04, DOMAIN[1] - 0.04, i / (nTrain - 1));
      x += (rng() - 0.5) * 0.06;
      x = V.clamp(x, DOMAIN[0], DOMAIN[1]);
      train.push({ x: x, y: trueF(x) + gauss(rng) * noise });
    }
    for(i = 0; i < nTest; i++){
      x = DOMAIN[0] + 0.02 + rng() * (DOMAIN[1] - DOMAIN[0] - 0.04);
      test.push({ x: x, y: trueF(x) + gauss(rng) * noise });
    }
    state.train = train;
    state.test = test;
  }

  /* ---------- linear algebra: solve (A x = b) by Gaussian elimination
                with partial pivoting. A is n×n (mutated), b length n. ---------- */
  function solve(A, b){
    var n = b.length, i, j, k;
    for(k = 0; k < n; k++){
      // partial pivot: largest |A[i][k]| in column k at/below row k
      var piv = k, big = Math.abs(A[k][k]);
      for(i = k + 1; i < n; i++){
        var v = Math.abs(A[i][k]);
        if(v > big){ big = v; piv = i; }
      }
      if(piv !== k){ var tr = A[piv]; A[piv] = A[k]; A[k] = tr; var tb = b[piv]; b[piv] = b[k]; b[k] = tb; }
      var akk = A[k][k];
      if(Math.abs(akk) < 1e-12) akk = (akk < 0 ? -1e-12 : 1e-12); // guard singular
      for(i = k + 1; i < n; i++){
        var f = A[i][k] / akk;
        if(f === 0) continue;
        for(j = k; j < n; j++) A[i][j] -= f * A[k][j];
        b[i] -= f * b[k];
      }
    }
    // back-substitution
    var x = new Array(n);
    for(i = n - 1; i >= 0; i--){
      var s = b[i];
      for(j = i + 1; j < n; j++) s -= A[i][j] * x[j];
      var d = A[i][i];
      if(Math.abs(d) < 1e-12) d = (d < 0 ? -1e-12 : 1e-12);
      x[i] = s / d;
    }
    return x;
  }

  /* ---------- least-squares polynomial fit of degree d via normal equations.
                Builds Vandermonde implicitly: AᵀA (m×m, m=d+1) and Aᵀy,
                adds ridge 1e-6 on the diagonal. Returns coeff array
                [c0, c1, ..., cd] for c0 + c1 x + ... + cd x^d. ---------- */
  function fitPoly(points, d){
    var m = d + 1, n = points.length, i, j, p;
    // powers cache: powsum[k] = Σ x^k for k in 0..2d ; ysum[k] = Σ y x^k for k in 0..d
    var powsum = new Array(2 * d + 1);
    for(i = 0; i <= 2 * d; i++) powsum[i] = 0;
    var ysum = new Array(d + 1);
    for(i = 0; i <= d; i++) ysum[i] = 0;
    for(p = 0; p < n; p++){
      var x = points[p].x, y = points[p].y, xp = 1;
      for(i = 0; i <= 2 * d; i++){
        powsum[i] += xp;
        if(i <= d) ysum[i] += y * xp;
        xp *= x;
      }
    }
    // AᵀA[i][j] = Σ x^(i+j) ; b[i] = Σ y x^i
    var A = [], b = [];
    for(i = 0; i < m; i++){
      A[i] = new Array(m);
      for(j = 0; j < m; j++) A[i][j] = powsum[i + j];
      A[i][i] += 1e-6;            // tiny ridge term for stability
      b[i] = ysum[i];
    }
    return solve(A, b);
  }

  function evalPoly(coeffs, x){
    // Horner's method
    var v = 0;
    for(var i = coeffs.length - 1; i >= 0; i--) v = v * x + coeffs[i];
    return v;
  }

  function rmse(points, coeffs){
    var s = 0;
    for(var i = 0; i < points.length; i++){
      var e = points[i].y - evalPoly(coeffs, points[i].x);
      s += e * e;
    }
    return Math.sqrt(s / points.length);
  }

  /* precompute coefficients + train/test error for every degree 1..MAXDEG */
  function computeAll(){
    state.coeffsByDeg = [null]; // index 0 unused (degrees start at 1)
    state.errByDeg = [null];
    for(var d = 1; d <= MAXDEG; d++){
      var c = fitPoly(state.train, d);
      state.coeffsByDeg[d] = c;
      state.errByDeg[d] = { train: rmse(state.train, c), test: rmse(state.test, c) };
    }
  }

  /* ---------- plot mapping ---------- */
  var pad = { l: 42, r: 16, t: 14, b: 30 };
  function px(x){ return pad.l + (x - DOMAIN[0]) / (DOMAIN[1] - DOMAIN[0]) * (W - pad.l - pad.r); }
  function py(y){ return pad.t + (YRANGE[1] - y) / (YRANGE[1] - YRANGE[0]) * (H - pad.t - pad.b - 96); }
  var plotBottom; // computed in draw

  function draw(){
    var p = V.palette();
    ctx.clearRect(0, 0, W, H);

    var plotH = H - pad.t - pad.b - 96;     // leave room for inset + readouts
    plotBottom = pad.t + plotH;

    // panel background for main plot
    ctx.fillStyle = p.panel;
    ctx.fillRect(pad.l, pad.t, W - pad.l - pad.r, plotH);

    // gridlines + axes
    ctx.strokeStyle = p.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    var gx;
    for(gx = -1; gx <= 1.0001; gx += 0.5){ ctx.moveTo(px(gx), pad.t); ctx.lineTo(px(gx), plotBottom); }
    var gy;
    for(gy = -1.5; gy <= 1.5001; gy += 0.75){ ctx.moveTo(pad.l, py(gy)); ctx.lineTo(W - pad.r, py(gy)); }
    ctx.stroke();

    // zero axis
    ctx.strokeStyle = p.axis; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, py(0)); ctx.lineTo(W - pad.r, py(0)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px(0), pad.t); ctx.lineTo(px(0), plotBottom); ctx.stroke();

    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillStyle = p.soft; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('x', W - pad.r - 6, py(0) + 4);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('y', pad.l - 8, py(1.5));

    var d = state.degree;
    var coeffs = state.coeffsByDeg[d];

    // true function (dashed)
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = p.soft; ctx.lineWidth = 1.6;
    ctx.beginPath();
    var first = true, sx, ty;
    for(sx = DOMAIN[0]; sx <= DOMAIN[1] + 1e-6; sx += 0.01){
      ty = trueF(sx);
      if(first){ ctx.moveTo(px(sx), py(ty)); first = false; } else ctx.lineTo(px(sx), py(ty));
    }
    ctx.stroke();
    ctx.restore();

    // fitted polynomial (clip to plot box so blow-ups don't escape)
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, W - pad.l - pad.r, plotH);
    ctx.clip();
    ctx.strokeStyle = p.accent; ctx.lineWidth = 2.4;
    ctx.beginPath();
    first = true;
    for(sx = DOMAIN[0]; sx <= DOMAIN[1] + 1e-6; sx += 0.004){
      var fy = evalPoly(coeffs, sx);
      var Y = py(fy);
      // guard against NaN/Infinity
      if(!isFinite(Y)){ first = true; continue; }
      if(first){ ctx.moveTo(px(sx), Y); first = false; } else ctx.lineTo(px(sx), Y);
    }
    ctx.stroke();
    ctx.restore();

    // training points (filled green)
    var i, pt;
    ctx.fillStyle = p.good;
    for(i = 0; i < state.train.length; i++){
      pt = state.train[i];
      ctx.beginPath(); ctx.arc(px(pt.x), py(V.clamp(pt.y, YRANGE[0], YRANGE[1])), 3.6, 0, 2 * Math.PI); ctx.fill();
    }
    // test points (hollow blue rings)
    ctx.strokeStyle = p.blue; ctx.lineWidth = 1.8;
    for(i = 0; i < state.test.length; i++){
      pt = state.test[i];
      ctx.beginPath(); ctx.arc(px(pt.x), py(V.clamp(pt.y, YRANGE[0], YRANGE[1])), 3.4, 0, 2 * Math.PI); ctx.stroke();
    }

    // ---------- readouts: train / test RMSE + diagnosis ----------
    var err = state.errByDeg[d];
    var rowY = plotBottom + 12;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '12px Inter, system-ui, sans-serif';

    ctx.fillStyle = p.good;
    ctx.fillText('train RMSE: ' + err.train.toFixed(3), pad.l, rowY);
    ctx.fillStyle = p.blue;
    ctx.fillText('test RMSE: ' + err.test.toFixed(3), pad.l + 168, rowY);

    // diagnosis tag
    var gap = err.test - err.train;
    var tag, tagCol;
    if(d <= 1 && err.train > 0.32){ tag = 'underfit'; tagCol = p.warn; }
    else if(gap > 0.18 || err.test > 0.42){ tag = 'overfit'; tagCol = p.bad; }
    else { tag = 'good fit'; tagCol = p.good; }
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillStyle = tagCol;
    ctx.textAlign = 'right';
    ctx.fillText('degree ' + d + ' → ' + tag, W - pad.r, rowY);

    // ---------- inset: error vs degree ----------
    var iX = pad.l, iY = plotBottom + 28, iW = W - pad.l - pad.r, iH = 56;
    ctx.fillStyle = p.bg;
    ctx.fillRect(iX, iY, iW, iH);
    ctx.strokeStyle = p.faint; ctx.lineWidth = 1;
    ctx.strokeRect(iX, iY, iW, iH);

    // max error for scaling (cap so a huge overfit spike doesn't crush the rest)
    var maxE = 0.001;
    for(i = 1; i <= MAXDEG; i++){
      maxE = Math.max(maxE, state.errByDeg[i].train, state.errByDeg[i].test);
    }
    maxE = Math.min(maxE, 1.2); // cap visual range
    function ixp(deg){ return iX + 8 + (deg - 1) / (MAXDEG - 1) * (iW - 16); }
    function iyp(e){ return iY + iH - 6 - V.clamp(e / maxE, 0, 1) * (iH - 12); }

    // train curve (green) + test curve (blue)
    function plotCurve(key, col){
      ctx.strokeStyle = col; ctx.lineWidth = 1.8;
      ctx.beginPath();
      for(i = 1; i <= MAXDEG; i++){
        var e = state.errByDeg[i][key];
        var X = ixp(i), Y = iyp(e);
        if(i === 1) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      // dots
      ctx.fillStyle = col;
      for(i = 1; i <= MAXDEG; i++){
        ctx.beginPath(); ctx.arc(ixp(i), iyp(state.errByDeg[i][key]), 2, 0, 2 * Math.PI); ctx.fill();
      }
    }
    plotCurve('train', p.good);
    plotCurve('test', p.blue);

    // marker for current degree
    ctx.strokeStyle = p.accent; ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(ixp(d), iY + 4); ctx.lineTo(ixp(d), iY + iH - 4); ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillStyle = p.soft; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('error vs degree', iX + 6, iY + 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('1', iX + 6, iY + iH - 1);
    ctx.textAlign = 'right';
    ctx.fillText(MAXDEG + ' (degree)', iX + iW - 4, iY + iH - 1);

    // small legend (true fn) top-left of main plot
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    var lx = pad.l + 8, ly = pad.t + 12;
    ctx.save();
    ctx.setLineDash([4, 3]); ctx.strokeStyle = p.soft; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 18, ly); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = p.soft; ctx.fillText('true function', lx + 23, ly);
    ctx.strokeStyle = p.accent; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(lx, ly + 14); ctx.lineTo(lx + 18, ly + 14); ctx.stroke();
    ctx.fillStyle = p.soft; ctx.fillText('degree-' + d + ' fit', lx + 23, ly + 14);
  }

  /* ---------- controls ---------- */
  var degSlider = V.slider({
    label: 'polynomial degree d', min: 1, max: MAXDEG, step: 1, value: state.degree,
    format: function(v){ return '' + v; },
    onInput: function(v){ state.degree = v | 0; draw(); }
  });
  P.controls.appendChild(degSlider.wrap);

  var seedCounter = 12345;
  P.controls.appendChild(V.button('Resample data', function(){
    seedCounter = (Math.random() * 1e9) | 0;   // new noise (Math.random OK for a button)
    genData(seedCounter);
    computeAll();
    draw();
  }, { ghost: true }));

  P.controls.appendChild(V.button('Reset', function(){
    seedCounter = 12345;
    state.degree = 3;
    degSlider.set(3);
    genData(seedCounter);
    computeAll();
    draw();
  }, { ghost: true }));

  /* ---------- init ---------- */
  genData(seedCounter);
  computeAll();
  draw();
  V.onTheme(draw);
});
