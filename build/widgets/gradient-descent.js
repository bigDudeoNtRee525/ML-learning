/* gradient-descent — the flagship cost-bowl descent widget.
   Minimizes J(w) = (w-3)^2, J'(w) = 2(w-3), minimum at w=3.
   Update rule: w := w - alpha * J'(w).  Shows convergence, crawling, and divergence. */
MLViz.register('gradient-descent', function(node, V){
  var P = V.panel(node, {
    title: 'Gradient descent on a cost bowl',
    caption: 'The bowl is the cost J(w) = (w − 3)². The ball sits at the current w. Each Step does w := w − α·J′(w) with J′(w) = 2(w − 3), sliding the ball downhill. Try α ≈ 0.1–0.3 (smooth convergence to w = 3), tiny α (it crawls), or α ≥ 1.0 (it overshoots and diverges).'
  });

  var C = V.makeCanvas(P.body, 560, 300), ctx = C.ctx;

  // --- domain / cost ----------------------------------------------------
  var W_MIN = -2, W_MAX = 8;            // w axis range shown
  var TARGET = 3;                       // location of the minimum
  function J(w){ return (w - TARGET) * (w - TARGET); }     // cost
  function dJ(w){ return 2 * (w - TARGET); }               // slope J'(w)
  var J_MAX = Math.max(J(W_MIN), J(W_MAX));                // for vertical scale (=25)
  var START_W = 0;

  // --- state ------------------------------------------------------------
  var state = {
    w: START_W,          // current parameter (logical, post-step)
    prevW: START_W,      // where the ball animates FROM
    lr: 0.1,             // learning rate alpha
    step: 0,             // iteration count
    path: [START_W],     // visited w values (trajectory)
    anim: 0,             // 0..1 animation progress for the current slide
    animating: false,
    running: false,      // auto-run toggle
    diverged: false,
    autoTimer: 0         // ms accumulator to pace auto-steps
  };

  // --- plot geometry ----------------------------------------------------
  var PAD_L = 46, PAD_R = 16, PAD_T = 22, PAD_B = 40;
  function plotW(){ return C.w - PAD_L - PAD_R; }
  function plotH(){ return C.h - PAD_T - PAD_B; }
  function sx(w){ return PAD_L + (w - W_MIN) / (W_MAX - W_MIN) * plotW(); }
  function sy(j){ return PAD_T + (1 - V.clamp(j, 0, J_MAX) / J_MAX) * plotH(); } // clamp so off-bowl points pin to top

  // --- one gradient-descent update -------------------------------------
  function doStep(){
    if(state.diverged || state.animating) return;
    var g = dJ(state.w);
    var next = state.w - state.lr * g;   // the GD update
    state.prevW = state.w;
    state.w = next;
    state.step += 1;
    state.path.push(next);
    if(state.path.length > 60) state.path.shift();
    // divergence guard: cost is exploding well beyond the visible bowl
    if(!isFinite(next) || Math.abs(next - TARGET) > 1e4 || J(next) > 1e7){
      state.diverged = true;
      state.running = false;
      runBtn.textContent = 'Run';
    }
    state.anim = 0;
    state.animating = true;
  }

  // --- drawing ----------------------------------------------------------
  function drawAxes(p){
    ctx.strokeStyle = p.grid; ctx.lineWidth = 1;
    ctx.fillStyle = p.soft;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    // vertical gridlines + w ticks
    for(var w = W_MIN; w <= W_MAX; w += 1){
      var x = sx(w);
      ctx.globalAlpha = (w === TARGET) ? 0 : 1;
      ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + plotH()); ctx.stroke();
      ctx.globalAlpha = 1;
      if(w % 1 === 0){ ctx.fillText(w, x, PAD_T + plotH() + 6); }
    }
    // horizontal gridlines + J ticks
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for(var j = 0; j <= J_MAX; j += 5){
      var y = sy(j);
      ctx.strokeStyle = p.grid;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + plotW(), y); ctx.stroke();
      ctx.fillStyle = p.soft;
      ctx.fillText(j, PAD_L - 6, y);
    }
    // axes box edges
    ctx.strokeStyle = p.axis; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(PAD_L, PAD_T); ctx.lineTo(PAD_L, PAD_T + plotH()); ctx.lineTo(PAD_L + plotW(), PAD_T + plotH());
    ctx.stroke();
    // axis labels
    ctx.fillStyle = p.ink;
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('parameter w', PAD_L + plotW() / 2, PAD_T + plotH() + 22);
    ctx.save();
    ctx.translate(13, PAD_T + plotH() / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('cost J(w)', 0, 0);
    ctx.restore();
  }

  function drawBowl(p){
    ctx.strokeStyle = p.accent; ctx.lineWidth = 2.5;
    ctx.beginPath();
    var first = true;
    for(var px = 0; px <= plotW(); px += 2){
      var w = W_MIN + (px / plotW()) * (W_MAX - W_MIN);
      var x = PAD_L + px, y = sy(J(w));
      if(first){ ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
    ctx.stroke();
    // minimum marker at w=3
    var mx = sx(TARGET), my = sy(0);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = p.good; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, PAD_T); ctx.lineTo(mx, my); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = p.good;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('minimum  w = 3', mx, PAD_T + 12);
  }

  function drawTrajectory(p){
    // visited points along the bowl, faded older -> brighter newer
    var pts = state.path;
    for(var i = 0; i < pts.length; i++){
      var w = pts[i];
      var wc = V.clamp(w, W_MIN, W_MAX);
      var x = sx(wc), y = sy(J(w));
      var t = pts.length > 1 ? i / (pts.length - 1) : 1;
      // connecting segment to previous
      if(i > 0){
        var pw = V.clamp(pts[i - 1], W_MIN, W_MAX);
        ctx.strokeStyle = p.warn;
        ctx.globalAlpha = 0.25 + 0.45 * t;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx(pw), sy(J(pts[i - 1])));
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.35 + 0.55 * t;
      ctx.fillStyle = p.warn;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBall(p){
    // interpolate the ball position during the slide animation
    var wDisp = state.animating ? V.lerp(state.prevW, state.w, ease(state.anim)) : state.w;
    var wc = V.clamp(wDisp, W_MIN, W_MAX);
    var x = sx(wc), y = sy(J(wDisp));
    var offEdge = (wDisp < W_MIN || wDisp > W_MAX);

    // slope tangent line at the ball (teaching: the gradient we follow)
    if(!offEdge && !state.diverged){
      var g = dJ(wDisp);
      // tangent in screen space: dy/dx of J w.r.t. screen
      var dwScreen = plotW() / (W_MAX - W_MIN);          // px per unit w
      var djScreen = -plotH() / J_MAX;                   // px per unit J (y inverted)
      var dirx = dwScreen, diry = g * djScreen;
      var len = Math.sqrt(dirx * dirx + diry * diry) || 1;
      dirx /= len; diry /= len;
      var L = 34;
      ctx.strokeStyle = p.bad; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - dirx * L, y - diry * L);
      ctx.lineTo(x + dirx * L, y + diry * L);
      ctx.stroke();
    }

    // the ball
    ctx.fillStyle = state.diverged ? p.bad : p.pink;
    ctx.strokeStyle = p.bg; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    if(offEdge){
      // arrow hint that the ball flew off the chart
      ctx.fillStyle = p.bad;
      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      if(wDisp > W_MAX){ ctx.textAlign = 'right'; ctx.fillText('→ off chart', PAD_L + plotW() - 4, PAD_T + 14); }
      else { ctx.textAlign = 'left'; ctx.fillText('off chart ←', PAD_L + 4, PAD_T + 14); }
    }
  }

  function drawReadout(p){
    var w = state.w, cost = J(w), grad = dJ(w);
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    var lines = [
      ['step ', String(state.step), p.soft, p.ink],
      ['w = ', fmt(w), p.soft, p.ink],
      ['J(w) = ', fmt(cost), p.soft, p.ink],
      ['J′(w) = ', fmt(grad), p.soft, (Math.abs(grad) < 1e-3 ? p.good : p.bad)]
    ];
    var bx = PAD_L + 8, by = PAD_T + 6, lh = 15;
    // backing for legibility
    ctx.fillStyle = p.dark ? 'rgba(22,27,34,0.72)' : 'rgba(255,255,255,0.78)';
    ctx.fillRect(bx - 5, by - 4, 132, lh * lines.length + 8);
    for(var i = 0; i < lines.length; i++){
      var ly = by + i * lh;
      ctx.fillStyle = lines[i][2]; ctx.fillText(lines[i][0], bx, ly);
      var lw = ctx.measureText(lines[i][0]).width;
      ctx.fillStyle = lines[i][3]; ctx.fillText(lines[i][1], bx + lw, ly);
    }
    if(state.diverged){
      ctx.fillStyle = p.bad;
      ctx.font = 'bold 14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('diverging!  α is too large', PAD_L + plotW() / 2, PAD_T + plotH() / 2);
    } else if(Math.abs(grad) < 1e-3 && state.step > 0){
      ctx.fillStyle = p.good;
      ctx.font = 'bold 13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('converged ✓  slope ≈ 0', PAD_L + plotW() / 2, PAD_T + 16);
    }
  }

  function fmt(v){
    if(!isFinite(v)) return '∞';
    var a = Math.abs(v);
    if(a >= 1e4) return v.toExponential(1);
    return v.toFixed(a < 100 ? 3 : 1);
  }
  function ease(t){ return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; } // smooth in-out

  function draw(){
    var p = V.palette();
    ctx.clearRect(0, 0, C.w, C.h);
    drawAxes(p);
    drawBowl(p);
    drawTrajectory(p);
    drawBall(p);
    drawReadout(p);
  }

  // --- animation loop (handles the slide + auto-run pacing) -------------
  var lastT = 0;
  var anim = V.loop(function(t){
    var dt = lastT ? Math.min(64, t - lastT) : 16; lastT = t;
    // advance slide animation
    if(state.animating){
      state.anim += dt / 360;            // ~0.36s per slide
      if(state.anim >= 1){ state.anim = 1; state.animating = false; }
    }
    // auto-run: take a step when the previous slide has (mostly) settled
    if(state.running && !state.animating && !state.diverged){
      state.autoTimer += dt;
      if(state.autoTimer > 90){ state.autoTimer = 0; doStep(); }
      // stop auto-run once essentially converged
      if(Math.abs(dJ(state.w)) < 1e-3){ state.running = false; runBtn.textContent = 'Run'; }
    }
    draw();
  }, node);

  // --- controls ---------------------------------------------------------
  var lrSlider = V.slider({
    label: 'learning rate α', min: 0.01, max: 1.2, step: 0.01, value: state.lr,
    format: function(v){ return v.toFixed(2); },
    onInput: function(v){ state.lr = v; }
  });
  P.controls.appendChild(lrSlider.wrap);

  var stepBtn = V.button('Step', function(){
    if(state.diverged) return;
    state.running = false; runBtn.textContent = 'Run';
    doStep();
  });
  P.controls.appendChild(stepBtn);

  var runBtn = V.button('Run', function(){
    if(state.diverged){ reset(); }
    state.running = !state.running;
    state.autoTimer = 0;
    runBtn.textContent = state.running ? 'Pause' : 'Run';
  });
  P.controls.appendChild(runBtn);

  function reset(){
    state.w = START_W; state.prevW = START_W; state.step = 0;
    state.path = [START_W]; state.anim = 0; state.animating = false;
    state.running = false; state.diverged = false; state.autoTimer = 0;
    runBtn.textContent = 'Run';
  }
  P.controls.appendChild(V.button('Reset', reset, { ghost: true }));

  draw();
  // V.loop already redraws every frame, so it picks up theme changes automatically.
});
