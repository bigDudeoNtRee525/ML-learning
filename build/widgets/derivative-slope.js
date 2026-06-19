/* widget: derivative-slope
   Derivative = slope of the tangent = limit of the secant slope.
   Curve f(x)=x^2 (toggle to sin x). A draggable point at x0, a second point at
   x0+h, and the secant line through them. A slider for h; as h -> 0 the secant
   visibly approaches the tangent. Readouts show the secant slope and the true
   derivative f'(x0). An "animate h → 0" button smoothly shrinks h. */
MLViz.register('derivative-slope', function(node, V){
  var P = V.panel(node, {
    title: 'Derivative = slope of the tangent',
    caption: 'The secant slope is (f(x₀+h) − f(x₀)) / h — rise over run between two points. ' +
             'Drag the blue point to move x₀; shrink h with the slider (or hit “animate h → 0”) ' +
             'and watch the secant (orange) swing onto the tangent (green). The true derivative is f′(x₀).'
  });

  var C = V.makeCanvas(P.body, 560, 320), ctx = C.ctx;

  var readline = V.el('div', { class: 'mlviz-readline' });
  P.body.appendChild(readline);
  var legend = V.el('div', { class: 'mlviz-legend' });
  P.body.appendChild(legend);

  // ---- state -----------------------------------------------------------------
  var state = {
    mode: 'sq',     // 'sq' = x^2, 'sin' = sin x
    x0: 1.2,
    h: 1.5,
    animating: false
  };

  // function + analytic derivative
  function f(x){ return state.mode === 'sq' ? x*x : Math.sin(x); }
  function df(x){ return state.mode === 'sq' ? 2*x : Math.cos(x); }
  function fname(){ return state.mode === 'sq' ? 'f(x) = x²' : 'f(x) = sin(x)'; }
  function dfname(){ return state.mode === 'sq' ? "f′(x) = 2x" : "f′(x) = cos(x)"; }

  // ---- world window ----------------------------------------------------------
  var xMin = -3, xMax = 3;
  function yRange(){ return state.mode === 'sq' ? { lo:-1.2, hi:9.5 } : { lo:-1.6, hi:1.6 }; }

  // margins for axis labels
  var ml = 38, mr = 14, mt = 14, mb = 28;
  function plotW(){ return C.w - ml - mr; }
  function plotH(){ return C.h - mt - mb; }
  function sx(x){ return ml + (x - xMin) / (xMax - xMin) * plotW(); }
  function sy(y){ var r = yRange(); return mt + (r.hi - y) / (r.hi - r.lo) * plotH(); }
  // inverse: canvas px -> world x (for dragging)
  function inv_x(px){ return xMin + (px - ml) / plotW() * (xMax - xMin); }

  // ---- controls --------------------------------------------------------------
  var hSlider = V.slider({
    label: 'step h', min: 0.05, max: 2.0, step: 0.01, value: state.h,
    format: function(v){ return v.toFixed(2); },
    onInput: function(v){ state.h = v; state.animating = false; }
  });
  P.controls.appendChild(hSlider.wrap);

  P.controls.appendChild(V.button('animate h → 0', function(){
    state.animating = true;
  }));

  P.controls.appendChild(V.button('reset h', function(){
    state.animating = false; state.h = 1.5; hSlider.set(1.5);
  }, {ghost:true}));

  var fnBtn = V.button('switch to sin(x)', function(){
    state.mode = (state.mode === 'sq') ? 'sin' : 'sq';
    fnBtn.textContent = (state.mode === 'sq') ? 'switch to sin(x)' : 'switch to x²';
    // keep x0 in a sensible spot for each function
    state.x0 = (state.mode === 'sq') ? 1.2 : 0.8;
    updateLegend();
  }, {ghost:true});
  P.controls.appendChild(fnBtn);

  // ---- dragging the x0 point -------------------------------------------------
  var dragging = false;
  function pointerStart(ev){
    var pos = C.canvas.evtPos(ev);
    var px = sx(state.x0), py = sy(f(state.x0));
    var d = Math.hypot(pos.x - px, pos.y - py);
    if(d < 26){ dragging = true; ev.preventDefault(); }
  }
  function pointerMove(ev){
    if(!dragging) return;
    var pos = C.canvas.evtPos(ev);
    var wx = V.clamp(inv_x(pos.x), xMin + 0.05, xMax - 0.05);
    // keep x0 + h inside the window so the secant stays visible
    state.x0 = V.clamp(wx, xMin + 0.05, xMax - state.h - 0.05);
    if(state.x0 < xMin + 0.05) state.x0 = xMin + 0.05;
    ev.preventDefault();
  }
  function pointerEnd(){ dragging = false; }

  C.canvas.addEventListener('mousedown', pointerStart);
  C.canvas.addEventListener('mousemove', pointerMove);
  window.addEventListener('mouseup', pointerEnd);
  C.canvas.addEventListener('touchstart', pointerStart, {passive:false});
  C.canvas.addEventListener('touchmove', pointerMove, {passive:false});
  window.addEventListener('touchend', pointerEnd);

  // ---- draw ------------------------------------------------------------------
  function draw(){
    var p = V.palette();
    var r = yRange();
    ctx.clearRect(0, 0, C.w, C.h);
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, C.w, C.h);

    // gridlines (integer x, and a few y)
    ctx.strokeStyle = p.grid; ctx.lineWidth = 1;
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for(var gx = Math.ceil(xMin); gx <= Math.floor(xMax); gx++){
      ctx.beginPath(); ctx.moveTo(sx(gx), mt); ctx.lineTo(sx(gx), mt + plotH()); ctx.stroke();
    }
    var yticks = state.mode === 'sq' ? [0,2,4,6,8] : [-1.5,-1,-0.5,0,0.5,1,1.5];
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for(var ti = 0; ti < yticks.length; ti++){
      var yv = yticks[ti];
      if(yv < r.lo || yv > r.hi) continue;
      ctx.strokeStyle = p.grid;
      ctx.beginPath(); ctx.moveTo(ml, sy(yv)); ctx.lineTo(ml + plotW(), sy(yv)); ctx.stroke();
      ctx.fillStyle = p.soft;
      ctx.fillText((Math.round(yv*10)/10).toString(), ml - 6, sy(yv));
    }

    // axes (x=0 and y=0)
    ctx.strokeStyle = p.axis; ctx.lineWidth = 1.3;
    if(0 >= r.lo && 0 <= r.hi){ ctx.beginPath(); ctx.moveTo(ml, sy(0)); ctx.lineTo(ml + plotW(), sy(0)); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(sx(0), mt); ctx.lineTo(sx(0), mt + plotH()); ctx.stroke();

    // x tick labels
    ctx.fillStyle = p.soft; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for(var lx = Math.ceil(xMin); lx <= Math.floor(xMax); lx++){
      if(lx === 0) continue;
      ctx.fillText(lx.toString(), sx(lx), mt + plotH() + 5);
    }
    ctx.fillText('x', ml + plotW() - 4, sy(0) + 5);

    // the curve f(x)
    ctx.strokeStyle = p.accent; ctx.lineWidth = 2.4;
    ctx.beginPath();
    var first = true;
    for(var px = ml; px <= ml + plotW(); px += 1){
      var xw = xMin + (px - ml) / plotW() * (xMax - xMin);
      var yw = f(xw);
      var yp = sy(yw);
      if(first){ ctx.moveTo(px, yp); first = false; } else { ctx.lineTo(px, yp); }
    }
    ctx.stroke();

    var x0 = state.x0, x1 = state.x0 + state.h;
    var y0 = f(x0), y1 = f(x1);
    var slopeSecant = (y1 - y0) / state.h;
    var slopeTrue = df(x0);

    // tangent line (green) through (x0,y0) with slope slopeTrue — drawn first, behind secant
    ctx.strokeStyle = p.good; ctx.lineWidth = 2;
    ctx.setLineDash([6,4]);
    drawLineThrough(x0, y0, slopeTrue, p);
    ctx.setLineDash([]);

    // secant line (orange) through the two points, extended across the plot
    ctx.strokeStyle = p.warn; ctx.lineWidth = 2;
    drawLineThrough(x0, y0, slopeSecant, p);

    // vertical "run" + horizontal helpers to show rise/run between the points
    ctx.strokeStyle = p.faint; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(sx(x0), sy(y0)); ctx.lineTo(sx(x1), sy(y0)); ctx.stroke(); // run
    ctx.beginPath(); ctx.moveTo(sx(x1), sy(y0)); ctx.lineTo(sx(x1), sy(y1)); ctx.stroke(); // rise
    ctx.setLineDash([]);

    // the two points
    // second point (x0+h)
    ctx.fillStyle = p.warn;
    dot(sx(x1), sy(y1), 5);
    // first point (x0) — draggable, blue, larger with halo
    ctx.fillStyle = p.dark ? 'rgba(96,165,250,0.25)' : 'rgba(37,99,235,0.18)';
    dot(sx(x0), sy(y0), dragging ? 13 : 10);
    ctx.fillStyle = p.blue;
    dot(sx(x0), sy(y0), 6);
    ctx.strokeStyle = p.bg; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx(x0), sy(y0), 6, 0, Math.PI*2); ctx.stroke();

    // labels near points
    ctx.font = '600 11px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = p.blue; ctx.fillText('x₀', sx(x0) + 9, sy(y0) - 6);
    ctx.fillStyle = p.warn; ctx.fillText('x₀+h', sx(x1) + 8, sy(y1) - 6);

    // function name in corner
    ctx.font = '600 12px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = p.accent; ctx.fillText(fname(), ml + 6, mt + 4);
  }

  function drawLineThrough(x0, y0, slope, p){
    // draw the infinite line y = y0 + slope*(x - x0) clipped to the plot box
    var r = yRange();
    var xa = xMin, xb = xMax;
    var ya = y0 + slope * (xa - x0);
    var yb = y0 + slope * (xb - x0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ml, mt, plotW(), plotH());
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(sx(xa), sy(ya));
    ctx.lineTo(sx(xb), sy(yb));
    ctx.stroke();
    ctx.restore();
  }

  function dot(x, y, r){ ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill(); }

  // ---- readouts --------------------------------------------------------------
  function updateReadline(){
    var x0 = state.x0;
    var slopeSecant = (f(x0 + state.h) - f(x0)) / state.h;
    var slopeTrue = df(x0);
    var err = Math.abs(slopeSecant - slopeTrue);
    readline.innerHTML =
      'x₀ = <b>' + x0.toFixed(2) + '</b>' +
      '&nbsp;&nbsp;•&nbsp;&nbsp;h = <b>' + state.h.toFixed(2) + '</b>' +
      '&nbsp;&nbsp;•&nbsp;&nbsp;secant slope = <b>' + slopeSecant.toFixed(3) + '</b>' +
      '&nbsp;&nbsp;•&nbsp;&nbsp;true f′(x₀) = <b>' + slopeTrue.toFixed(3) + '</b>' +
      '&nbsp;&nbsp;•&nbsp;&nbsp;gap = <b>' + err.toFixed(3) + '</b>';
  }

  function updateLegend(){
    var p = V.palette();
    legend.innerHTML =
      '<span><i style="background:' + p.accent + '"></i>' + fname() + '</span>' +
      '<span><i style="background:' + p.warn + '"></i>secant line</span>' +
      '<span><i style="background:' + p.good + '"></i>tangent (' + dfname() + ')</span>' +
      '<span><i style="background:' + p.blue + '"></i>drag x₀</span>';
  }

  // ---- animation loop --------------------------------------------------------
  function tick(){
    if(state.animating){
      // exponential shrink toward the slider minimum (0.05)
      state.h += (0.05 - state.h) * 0.06;
      if(state.h <= 0.06){ state.h = 0.05; state.animating = false; }
      hSlider.set(state.h);
      // keep x0 inside the window as h changes
      state.x0 = V.clamp(state.x0, xMin + 0.05, xMax - state.h - 0.05);
    }
    draw();
    updateReadline();
  }

  updateLegend();
  updateReadline();
  V.loop(tick, node);
  V.onTheme(function(){ updateLegend(); updateReadline(); });
});
