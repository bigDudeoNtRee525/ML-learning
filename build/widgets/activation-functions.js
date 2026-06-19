/* widget: activation-functions — plot Sigmoid / Tanh / ReLU / Leaky ReLU on
   x in [-5,5], with an optional dashed derivative overlay. Teaching point:
   sigmoid/tanh derivatives shrink to ~0 for large |x| (vanishing gradients),
   while ReLU's derivative is a clean 0 or 1. */
MLViz.register('activation-functions', function(node, V){
  var P = V.panel(node, {
    title: 'Activation functions and their slopes',
    caption: 'Pick an activation and (optionally) overlay its derivative as a dashed curve — that slope is exactly what backprop multiplies by. Notice how sigmoid and tanh go flat (slope ≈ 0) for large |x|: stack many such tiny slopes in a deep net and the gradient vanishes. ReLU and Leaky ReLU keep a clean slope of 1 on the positive side, which is why they dominate hidden layers.'
  });
  var C = V.makeCanvas(P.body, 560, 320), ctx = C.ctx;

  // ---- the four activations and their derivatives ----
  var LEAK = 0.1;
  var fns = {
    Sigmoid: {
      f: function(x){ return 1 / (1 + Math.exp(-x)); },
      d: function(x){ var s = 1 / (1 + Math.exp(-x)); return s * (1 - s); },
      note: 'Range (0,1). Max slope only 0.25 at x=0; flattens to ≈0 at the ends.'
    },
    Tanh: {
      f: function(x){ return Math.tanh(x); },
      d: function(x){ var t = Math.tanh(x); return 1 - t * t; },
      note: 'Range (-1,1), zero-centred. Max slope 1 at x=0 but still saturates to ≈0.'
    },
    ReLU: {
      f: function(x){ return x > 0 ? x : 0; },
      d: function(x){ return x > 0 ? 1 : 0; },
      note: 'max(0,x). Slope is a clean 0 (x<0) or 1 (x>0) — no vanishing on the positive side.'
    },
    'Leaky ReLU': {
      f: function(x){ return x > 0 ? x : LEAK * x; },
      d: function(x){ return x > 0 ? 1 : LEAK; },
      note: 'Like ReLU but a small slope (' + LEAK + ') for x<0, so negative neurons still learn.'
    }
  };
  var order = ['Sigmoid', 'Tanh', 'ReLU', 'Leaky ReLU'];

  var state = { cur: 'Sigmoid', showDeriv: true };

  // ---- plot region ----
  var XMIN = -5, XMAX = 5, YMIN = -1.4, YMAX = 1.9;
  var m = { l: 42, r: 14, t: 16, b: 26 };
  function px(x){ return m.l + (x - XMIN) / (XMAX - XMIN) * (C.w - m.l - m.r); }
  function py(y){ return C.h - m.b - (y - YMIN) / (YMAX - YMIN) * (C.h - m.t - m.b); }

  function drawCurve(fn, color, dashed){
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = dashed ? 2 : 2.6;
    ctx.setLineDash(dashed ? [6, 5] : []);
    var first = true;
    for(var i = 0; i <= 280; i++){
      var x = XMIN + (XMAX - XMIN) * i / 280;
      var y = fn(x);
      // ReLU/Leaky have a kink at 0 but f & d are still finite everywhere here
      var X = px(x), Y = py(y);
      if(first){ ctx.moveTo(X, Y); first = false; } else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function draw(){
    var p = V.palette();
    ctx.clearRect(0, 0, C.w, C.h);

    // ---- grid ----
    ctx.strokeStyle = p.grid; ctx.lineWidth = 1;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.fillStyle = p.soft;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var gx;
    for(gx = XMIN; gx <= XMAX; gx++){
      ctx.beginPath(); ctx.moveTo(px(gx), py(YMAX)); ctx.lineTo(px(gx), py(YMIN)); ctx.stroke();
    }
    var yticks = [-1, 0, 1];
    var gy;
    for(var yi = 0; yi < yticks.length; yi++){
      gy = yticks[yi];
      ctx.beginPath(); ctx.moveTo(px(XMIN), py(gy)); ctx.lineTo(px(XMAX), py(gy)); ctx.stroke();
    }

    // ---- axes (x=0 and y=0) ----
    ctx.strokeStyle = p.axis; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(px(0), py(YMAX)); ctx.lineTo(px(0), py(YMIN)); ctx.stroke(); // y-axis
    ctx.beginPath(); ctx.moveTo(px(XMIN), py(0)); ctx.lineTo(px(XMAX), py(0)); ctx.stroke(); // x-axis

    // axis tick labels
    ctx.fillStyle = p.soft;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for(gx = XMIN; gx <= XMAX; gx += 1){
      if(gx === 0) continue;
      ctx.fillText('' + gx, px(gx), py(0) + 4);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for(var yj = 0; yj < yticks.length; yj++){
      gy = yticks[yj];
      if(gy === 0) continue;
      ctx.fillText('' + gy, m.l - 5, py(gy));
    }
    // axis names
    ctx.fillStyle = p.soft; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('x', px(XMAX) - 2, py(0) - 4);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('g(x)', px(0) + 5, py(YMAX) + 2);

    // ---- the selected curve and (optionally) its derivative ----
    var entry = fns[state.cur];
    if(state.showDeriv) drawCurve(entry.d, p.warn, true);   // derivative dashed, behind
    drawCurve(entry.f, p.accent, false);                    // function, on top

    // ---- legend ----
    var lx = px(XMIN) + 8, ly = py(YMAX) + 6;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '11px Inter, system-ui, sans-serif';
    // function swatch
    ctx.strokeStyle = p.accent; ctx.lineWidth = 2.6; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(lx, ly + 6); ctx.lineTo(lx + 22, ly + 6); ctx.stroke();
    ctx.fillStyle = p.ink; ctx.fillText(state.cur + '  g(x)', lx + 28, ly + 6);
    if(state.showDeriv){
      ctx.strokeStyle = p.warn; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(lx, ly + 22); ctx.lineTo(lx + 22, ly + 22); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = p.ink; ctx.fillText("derivative g'(x)", lx + 28, ly + 22);
    }

    // ---- short note about this activation (bottom-right) ----
    ctx.fillStyle = p.soft; ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(entry.note, px(XMAX) - 2, C.h - 4);
  }

  // ---- controls: function selector buttons + derivative checkbox ----
  var btns = {};
  function refreshBtns(){
    var pal = V.palette();
    for(var name in btns){
      var b = btns[name];
      if(name === state.cur){
        b.style.background = pal.accent;
        b.style.color = '#ffffff';
        b.style.borderColor = pal.accent;
      } else {
        b.style.background = '';
        b.style.color = '';
        b.style.borderColor = '';
      }
    }
  }
  order.forEach(function(name){
    var b = V.button(name, function(){ state.cur = name; refreshBtns(); draw(); }, { ghost: true });
    btns[name] = b;
    P.controls.appendChild(b);
  });

  // derivative checkbox
  var cb = V.el('input', { type: 'checkbox' });
  cb.checked = state.showDeriv;
  cb.addEventListener('change', function(){ state.showDeriv = cb.checked; draw(); });
  var cbLabel = V.el('label', {
    class: 'mlviz-slider',
    style: 'flex-direction:row; align-items:center; gap:6px; cursor:pointer;'
  }, [cb, V.el('span', { class: 'mlviz-slabel' }, 'show derivative')]);
  P.controls.appendChild(cbLabel);

  refreshBtns();
  draw();
  V.onTheme(function(){ refreshBtns(); draw(); });
});
