MLViz.register('sigmoid', function(node, V){
  var P = V.panel(node, {
    title: 'Sigmoid: score → probability',
    caption: 'σ(w·x + b) squashes a score into a probability in [0,1]. Drag w (steepness) and b (shift). The dashed line is p = 0.5; the orange marker is the decision boundary where w·x + b = 0. Points are coloured by their predicted class. Drag the dot on the curve to read (z, σ(z)).'
  });

  var C = V.makeCanvas(P.body, 560, 320), ctx = C.ctx;

  // ---- model state ----
  var state = { w: 1.0, b: 0.0, dragZ: 1.5 };

  // ---- deterministic 1-D data: two classes spread along x ----
  // mulberry32 seeded PRNG for stable layout
  function mulberry32(a){ return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };}
  var rnd = mulberry32(20260618);
  var pts = [];
  // class 0 cluster on the left (true label 0), class 1 cluster on the right (true label 1)
  for (var i = 0; i < 6; i++) pts.push({ x: -4.2 + rnd() * 3.2, label: 0 });
  for (var j = 0; j < 6; j++) pts.push({ x: 1.0  + rnd() * 3.2, label: 1 });

  // ---- math ----
  function sigmoid(z){ return 1 / (1 + Math.exp(-z)); }

  // ---- plot domain ----
  var ZMIN = -8, ZMAX = 8;          // x-axis is the input x; z = w*x + b
  var pad = { l: 46, r: 16, t: 18, b: 40 };

  // ---- sliders ----
  var sw = V.slider({ label: 'weight w (steepness)', min: -3, max: 3, step: 0.05, value: state.w,
    format: function(v){ return v.toFixed(2); }, onInput: function(v){ state.w = v; draw(); } });
  var sb = V.slider({ label: 'bias b (shift)', min: -8, max: 8, step: 0.1, value: state.b,
    format: function(v){ return v.toFixed(1); }, onInput: function(v){ state.b = v; draw(); } });
  P.controls.appendChild(sw.wrap);
  P.controls.appendChild(sb.wrap);
  P.controls.appendChild(V.button('Reset', function(){
    state.w = 1.0; state.b = 0.0; state.dragZ = 1.5;
    sw.set(1.0); sb.set(0.0); draw();
  }, { ghost: true }));

  // ---- coordinate transforms ----
  function px(x){ // input x -> pixel
    return pad.l + (x - ZMIN) / (ZMAX - ZMIN) * (C.w - pad.l - pad.r);
  }
  function py(p){ // probability [0,1] -> pixel
    return pad.t + (1 - p) * (C.h - pad.t - pad.b);
  }
  function xFromPx(xp){
    return ZMIN + (xp - pad.l) / (C.w - pad.l - pad.r) * (ZMAX - ZMIN);
  }

  function draw(){
    var pal = V.palette();
    ctx.clearRect(0, 0, C.w, C.h);

    var w = state.w, b = state.b;
    var x0 = px(ZMIN), x1 = px(ZMAX);
    var yTop = py(1), yBot = py(0), yMid = py(0.5);

    // axes box gridlines for p = 0, 0.5, 1
    ctx.strokeStyle = pal.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, yTop); ctx.lineTo(x1, yTop); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, yBot); ctx.lineTo(x1, yBot); ctx.stroke();

    // dashed p = 0.5 line
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = pal.soft; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, yMid); ctx.lineTo(x1, yMid); ctx.stroke();
    ctx.restore();

    // axes
    ctx.strokeStyle = pal.axis; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x0, yBot); ctx.lineTo(x1, yBot); ctx.stroke(); // x-axis at p=0
    ctx.beginPath(); ctx.moveTo(x0, yTop); ctx.lineTo(x0, yBot); ctx.stroke(); // y-axis

    // y-axis labels
    ctx.fillStyle = pal.soft;
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('1.0', x0 - 6, yTop);
    ctx.fillText('0.5', x0 - 6, yMid);
    ctx.fillText('0.0', x0 - 6, yBot);
    // y title
    ctx.save();
    ctx.translate(14, (yTop + yBot) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.ink;
    ctx.fillText('probability  σ(w·x + b)', 0, 0);
    ctx.restore();

    // x-axis ticks/labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = pal.soft;
    for (var t = ZMIN; t <= ZMAX; t += 2){
      var xp = px(t);
      ctx.strokeStyle = pal.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xp, yBot); ctx.lineTo(xp, yBot + 4); ctx.stroke();
      ctx.fillText(String(t), xp, yBot + 7);
    }
    ctx.fillStyle = pal.ink;
    ctx.fillText('input  x', (x0 + x1) / 2, yBot + 22);

    // ---- the sigmoid curve σ(w*x + b) ----
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 2.5;
    ctx.beginPath();
    var first = true;
    for (var sx = 0; sx <= 1; sx += 0.004){
      var xv = ZMIN + sx * (ZMAX - ZMIN);
      var p = sigmoid(w * xv + b);
      var XX = px(xv), YY = py(p);
      if (first){ ctx.moveTo(XX, YY); first = false; } else ctx.lineTo(XX, YY);
    }
    ctx.stroke();

    // ---- decision boundary: where w*x + b = 0  =>  x = -b/w ----
    var hasBoundary = Math.abs(w) > 1e-9;
    var xb = hasBoundary ? (-b / w) : null;
    if (hasBoundary && xb >= ZMIN && xb <= ZMAX){
      var bx = px(xb);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = pal.warn; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(bx, yTop); ctx.lineTo(bx, yBot); ctx.stroke();
      ctx.restore();
      // marker where boundary meets p=0.5 (label lives in the top-right readout bar)
      ctx.fillStyle = pal.warn;
      ctx.beginPath(); ctx.arc(bx, yMid, 4.5, 0, Math.PI * 2); ctx.fill();
    }

    // ---- data points along the x-axis, coloured by PREDICTED class ----
    // predicted class 1 if σ(w*x+b) >= 0.5 (i.e. w*x+b >= 0)
    var rowY = yBot + 0;            // sit on the axis baseline area
    for (var k = 0; k < pts.length; k++){
      var pt = pts[k];
      var z = w * pt.x + b;
      var prob = sigmoid(z);
      var predicted1 = prob >= 0.5;
      var cx = px(pt.x);
      // colour by predicted class
      var col = predicted1 ? pal.teal : pal.pink;
      // place marker just below the axis; outline shows TRUE label
      var cyp = yBot + 16;
      ctx.beginPath();
      ctx.arc(cx, cyp, 6, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      // true-label ring: solid if prediction matches truth, dashed if misclassified
      var correct = (predicted1 ? 1 : 0) === pt.label;
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = correct ? pal.panel : pal.bad;
      if (!correct){ ctx.save(); ctx.setLineDash([2, 2]); }
      ctx.stroke();
      if (!correct) ctx.restore();

      // tick connecting point to its probability on the curve
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = pal.faint; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, py(prob)); ctx.lineTo(cx, cyp - 6); ctx.stroke();
      ctx.restore();
      // small dot on the curve at this point's probability
      ctx.beginPath(); ctx.arc(cx, py(prob), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
    }

    // ---- draggable readout dot on the curve ----
    var dz = state.dragZ;                 // this is an x value being dragged
    dz = V.clamp(dz, ZMIN, ZMAX);
    var dp = sigmoid(w * dz + b);
    var ddx = px(dz), ddy = py(dp);
    ctx.beginPath(); ctx.arc(ddx, ddy, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = pal.accent2; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = pal.panel; ctx.stroke();
    // readout label for dragged point
    ctx.font = '12px Inter, sans-serif';
    var zVal = w * dz + b;
    var lbl = 'x=' + dz.toFixed(2) + '  z=' + zVal.toFixed(2) + '  σ=' + dp.toFixed(3);
    ctx.textAlign = ddx > C.w - 150 ? 'right' : 'left';
    ctx.textBaseline = 'bottom';
    var lx = ddx > C.w - 150 ? ddx - 9 : ddx + 9;
    ctx.fillStyle = pal.ink;
    ctx.fillText(lbl, lx, ddy - 8);

    // ---- legend (top-left inside plot) ----
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    var lgx = x0 + 10, lgy = yTop + 12;
    ctx.beginPath(); ctx.arc(lgx, lgy, 5, 0, Math.PI * 2); ctx.fillStyle = pal.teal; ctx.fill();
    ctx.fillStyle = pal.soft; ctx.fillText('predicted class 1 (p ≥ 0.5)', lgx + 11, lgy);
    lgy += 16;
    ctx.beginPath(); ctx.arc(lgx, lgy, 5, 0, Math.PI * 2); ctx.fillStyle = pal.pink; ctx.fill();
    ctx.fillStyle = pal.soft; ctx.fillText('predicted class 0 (p < 0.5)', lgx + 11, lgy);
    lgy += 16;
    ctx.save(); ctx.setLineDash([2, 2]); ctx.strokeStyle = pal.bad; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(lgx, lgy, 5, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    ctx.fillStyle = pal.soft; ctx.fillText('dashed ring = misclassified', lgx + 11, lgy);

    // ---- readouts bar (top-right) ----
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = pal.ink;
    var bstr = hasBoundary ? (-b / w).toFixed(2) : 'none (w=0)';
    ctx.fillText('w = ' + w.toFixed(2) + '    b = ' + b.toFixed(1), C.w - pad.r, pad.t);
    ctx.fillStyle = pal.warn;
    ctx.fillText('boundary x = ' + bstr, C.w - pad.r, pad.t + 16);
  }

  // ---- dragging the curve dot ----
  var dragging = false;
  function nearDot(pos){
    var dz = V.clamp(state.dragZ, ZMIN, ZMAX);
    var dp = sigmoid(state.w * dz + state.b);
    var dx = pos.x - px(dz), dy = pos.y - py(dp);
    return (dx * dx + dy * dy) <= 200;
  }
  function setFromPos(pos){
    var xv = xFromPx(pos.x);
    state.dragZ = V.clamp(xv, ZMIN, ZMAX);
    draw();
  }
  C.canvas.addEventListener('mousedown', function(e){
    var pos = C.canvas.evtPos(e);
    if (nearDot(pos)){ dragging = true; setFromPos(pos); }
  });
  C.canvas.addEventListener('mousemove', function(e){
    if (dragging){ setFromPos(C.canvas.evtPos(e)); }
  });
  window.addEventListener('mouseup', function(){ dragging = false; });
  C.canvas.addEventListener('touchstart', function(e){
    var pos = C.canvas.evtPos(e);
    if (nearDot(pos)){ dragging = true; setFromPos(pos); e.preventDefault(); }
  }, { passive: false });
  C.canvas.addEventListener('touchmove', function(e){
    if (dragging){ setFromPos(C.canvas.evtPos(e)); e.preventDefault(); }
  }, { passive: false });
  window.addEventListener('touchend', function(){ dragging = false; });

  draw();
  V.onTheme(draw);
});
