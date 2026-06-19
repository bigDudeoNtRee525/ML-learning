/* k-means clustering — assign points to nearest centroid, then move each centroid
   to the mean of its members; repeat until nothing changes. Two-phase Step makes the
   assign/update dance explicit; Run auto-iterates with gliding-centroid animation. */
MLViz.register('kmeans', function(node, V){
  var P = V.panel(node, {
    title: 'k-means: the assign-then-update dance',
    caption: 'Step alternates two phases: ASSIGN colours every point by its nearest centroid (✕), then UPDATE glides each centroid to the mean of its members. Run repeats until a round changes nothing — that is convergence. Change k or reseed the centroids to see how the start matters.'
  });
  var C = V.makeCanvas(P.body, 560, 330), ctx = C.ctx;

  // ---- deterministic RNG (mulberry32) ----
  function mulberry32(a){
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // gaussian via Box-Muller from a seeded uniform source
  function gauss(rng){
    var u = 0, v = 0;
    while(u === 0) u = rng();
    while(v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ---- plot geometry (data space is 0..10 in both axes) ----
  var PAD = { l: 38, r: 14, t: 26, b: 30 };
  function px(x){ return PAD.l + (x / 10) * (C.w - PAD.l - PAD.r); }
  function py(y){ return (C.h - PAD.b) - (y / 10) * (C.h - PAD.t - PAD.b); }

  // ---- build ~60 seeded points in 3 loose blobs ----
  var POINTS = [];
  (function buildPoints(){
    var rng = mulberry32(20240617);
    var blobs = [
      { cx: 2.6, cy: 7.2, n: 20, s: 0.85 },
      { cx: 7.4, cy: 7.4, n: 20, s: 0.95 },
      { cx: 5.0, cy: 2.6, n: 20, s: 0.95 }
    ];
    blobs.forEach(function(b){
      for(var i = 0; i < b.n; i++){
        var x = V.clamp(b.cx + gauss(rng) * b.s, 0.3, 9.7);
        var y = V.clamp(b.cy + gauss(rng) * b.s, 0.3, 9.7);
        POINTS.push({ x: x, y: y, c: -1 });
      }
    });
  })();

  // ---- state ----
  var state = {
    k: 3,
    iter: 0,
    phase: 'assign',     // next action a Step click will perform
    assigned: false,     // have points ever been coloured for current centroids?
    converged: false,
    running: false,
    seed: 7
  };
  // centroids: {x,y} = drawn (animated) position; tx,ty = target position
  var cents = [];
  var anim = { active: false, t: 0, dur: 26 }; // glide progress in frames

  function colourFor(p, j){
    return p.series[j % p.series.length];
  }

  // place k centroids at distinct seeded data points (k-means style init)
  function seedCentroids(){
    var rng = mulberry32(state.seed);
    var idx = [];
    var pool = POINTS.map(function(_, i){ return i; });
    for(var j = 0; j < state.k; j++){
      var pick = Math.floor(rng() * pool.length);
      idx.push(pool[pick]);
      pool.splice(pick, 1);
    }
    cents = idx.map(function(i){
      return { x: POINTS[i].x, y: POINTS[i].y, tx: POINTS[i].x, ty: POINTS[i].y };
    });
  }

  function reset(newSeed){
    if(newSeed) state.seed = (state.seed * 1103515245 + 12345) & 0x7fffffff;
    state.iter = 0;
    state.phase = 'assign';
    state.assigned = false;
    state.converged = false;
    stopRun();
    seedCentroids();
    POINTS.forEach(function(p){ p.c = -1; });
    anim.active = false;
    draw();
  }

  // ASSIGN: each point -> nearest centroid (squared Euclidean). Returns true if any changed.
  function assign(){
    var changed = false;
    for(var i = 0; i < POINTS.length; i++){
      var p = POINTS[i], best = -1, bd = Infinity;
      for(var j = 0; j < cents.length; j++){
        var dx = p.x - cents[j].tx, dy = p.y - cents[j].ty;
        var d = dx * dx + dy * dy;
        if(d < bd){ bd = d; best = j; }
      }
      if(p.c !== best){ changed = true; p.c = best; }
    }
    state.assigned = true;
    return changed;
  }

  // UPDATE: set each centroid TARGET to the mean of its members (empty -> stays put).
  function updateTargets(){
    for(var j = 0; j < cents.length; j++){
      var sx = 0, sy = 0, n = 0;
      for(var i = 0; i < POINTS.length; i++){
        if(POINTS[i].c === j){ sx += POINTS[i].x; sy += POINTS[i].y; n++; }
      }
      if(n > 0){ cents[j].tx = sx / n; cents[j].ty = sy / n; }
    }
  }

  // inertia = within-cluster sum of squared distances to own (target) centroid
  function inertia(){
    var J = 0;
    for(var i = 0; i < POINTS.length; i++){
      var p = POINTS[i];
      if(p.c < 0) continue;
      var dx = p.x - cents[p.c].tx, dy = p.y - cents[p.c].ty;
      J += dx * dx + dy * dy;
    }
    return J;
  }

  function startGlide(){
    anim.active = true;
    anim.t = 0;
  }

  // ---- one logical Step (two-phase) ----
  function step(){
    if(state.converged) return;
    if(anim.active) return; // wait for a glide to finish
    if(state.phase === 'assign'){
      var changed = assign();
      // An assign right after a completed update that changes nothing => converged.
      if(!changed && state.iter > 0){
        state.converged = true;
        draw();
        return;
      }
      state.phase = 'update';
    } else { // 'update'
      updateTargets();
      state.iter++;
      startGlide();          // animate centroids to their new means
      // after this glide, the next click re-assigns
      state.phase = 'assign';
    }
    draw();
  }

  // ---- Run: drive Steps automatically, detecting convergence ----
  function runTick(){
    if(!state.running) return;
    if(anim.active){ return; } // let glide play out; loop() keeps calling draw
    if(state.converged){ stopRun(); return; }
    if(state.phase === 'assign'){
      var changed = assign();
      state.phase = 'update';
      // if an assign right after an update changed nothing AND it's not the very first
      // assignment, we've converged.
      if(!changed && state.iter > 0){
        state.converged = true;
        stopRun();
        draw();
        return;
      }
      draw();
    } else {
      updateTargets();
      state.iter++;
      startGlide();
      state.phase = 'assign';
      draw();
    }
  }

  var ticker = null;
  function startRun(){
    if(state.converged) reset(false);
    state.running = true;
    runBtn.textContent = 'Pause';
    if(!ticker){
      ticker = setInterval(runTick, 360); // pace the assign/update beats
    }
  }
  function stopRun(){
    state.running = false;
    if(runBtn) runBtn.textContent = 'Run';
    if(ticker){ clearInterval(ticker); ticker = null; }
  }
  function toggleRun(){ if(state.running) stopRun(); else startRun(); }

  // ---- controls ----
  var kSlider = V.slider({
    label: 'clusters k', min: 2, max: 5, step: 1, value: state.k,
    format: function(v){ return '' + v; },
    onInput: function(v){ state.k = v; reset(false); }
  });
  P.controls.appendChild(kSlider.wrap);

  var stepBtn = V.button('Step', function(){ stopRun(); step(); });
  var runBtn  = V.button('Run', toggleRun);
  P.controls.appendChild(stepBtn);
  P.controls.appendChild(runBtn);
  P.controls.appendChild(V.button('Reset / new centroids', function(){ reset(true); }, { ghost: true }));

  // ---- drawing ----
  function drawAxes(p){
    ctx.strokeStyle = p.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    for(var g = 0; g <= 10; g += 2){
      ctx.moveTo(px(g), py(0)); ctx.lineTo(px(g), py(10));
      ctx.moveTo(px(0), py(g)); ctx.lineTo(px(10), py(g));
    }
    ctx.stroke();
    ctx.strokeStyle = p.axis; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(px(0), py(0)); ctx.lineTo(px(10), py(0));
    ctx.moveTo(px(0), py(0)); ctx.lineTo(px(0), py(10));
    ctx.stroke();
    ctx.fillStyle = p.soft;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('feature 1', (px(0) + px(10)) / 2, C.h - PAD.b + 11);
    ctx.save();
    ctx.translate(11, (py(0) + py(10)) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'middle';
    ctx.fillText('feature 2', 0, 0);
    ctx.restore();
  }

  function drawCross(cx, cy, col, p){
    var r = 9;
    // halo so the marker reads on any cluster colour
    ctx.lineCap = 'round';
    ctx.strokeStyle = p.bg; ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx - r, cy + r); ctx.lineTo(cx + r, cy - r);
    ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx - r, cy + r); ctx.lineTo(cx + r, cy - r);
    ctx.stroke();
    // ring
    ctx.strokeStyle = col; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // draw() just requests a repaint; the loop performs the actual paint() so we
  // never run two renders in the same frame and stay idle-cheap.
  var dirty = true;
  function draw(){ dirty = true; }

  function paint(){
    var p = V.palette();
    ctx.clearRect(0, 0, C.w, C.h);

    // background panel for the plot area
    ctx.fillStyle = p.panel;
    ctx.fillRect(px(0), py(10), px(10) - px(0), py(0) - py(10));

    drawAxes(p);

    // draw points
    for(var i = 0; i < POINTS.length; i++){
      var pt = POINTS[i];
      var X = px(pt.x), Y = py(pt.y);
      if(pt.c < 0){
        ctx.fillStyle = p.soft;
        ctx.globalAlpha = 0.85;
      } else {
        ctx.fillStyle = colourFor(p, pt.c);
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(X, Y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // draw faint lines from each point to its centroid (the "assignment")
    if(state.assigned){
      ctx.lineWidth = 1;
      for(var m = 0; m < POINTS.length; m++){
        var q = POINTS[m];
        if(q.c < 0) continue;
        var cc = cents[q.c];
        ctx.strokeStyle = colourFor(p, q.c);
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.moveTo(px(q.x), py(q.y));
        ctx.lineTo(px(cc.x), py(cc.y));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // draw centroids at their current (animated) positions
    for(var n = 0; n < cents.length; n++){
      var ce = cents[n];
      drawCross(px(ce.x), py(ce.y), colourFor(p, n), p);
    }

    // status banner
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.fillStyle = p.ink;
    ctx.fillText('iteration: ' + state.iter, PAD.l + 2, 16);

    var nextLabel;
    if(state.converged) nextLabel = '';
    else nextLabel = (state.phase === 'assign')
      ? 'next Step: ASSIGN (colour by nearest ✕)'
      : 'next Step: UPDATE (✕ glides to cluster mean)';
    ctx.fillStyle = p.soft;
    ctx.textAlign = 'right';
    ctx.fillText(nextLabel, C.w - PAD.r, 16);

    // inertia readout (only meaningful once assigned)
    if(state.assigned){
      ctx.textAlign = 'left';
      ctx.fillStyle = p.soft;
      ctx.fillText('inertia J ≈ ' + inertia().toFixed(1), PAD.l + 2, 30 + 0);
    }

    // converged badge
    if(state.converged){
      ctx.textAlign = 'right';
      ctx.font = '700 12px Inter, system-ui, sans-serif';
      ctx.fillStyle = p.good;
      ctx.fillText('✓ converged — no point changed cluster', C.w - PAD.r, 30);
    }
  }

  // continuous loop: drives the centroid glide smoothly. Idle frames cost almost
  // nothing because we only repaint when something is actually moving or marked dirty.
  V.loop(function(){
    if(anim.active){
      // capture start positions on first frame of a glide
      if(anim.t === 0){
        for(var j = 0; j < cents.length; j++){ cents[j].sx = cents[j].x; cents[j].sy = cents[j].y; }
      }
      anim.t++;
      var tt = V.clamp(anim.t / anim.dur, 0, 1);
      var ease = tt < 0.5 ? 2 * tt * tt : 1 - Math.pow(-2 * tt + 2, 2) / 2;
      for(var k = 0; k < cents.length; k++){
        var c = cents[k];
        c.x = V.lerp(c.sx, c.tx, ease);
        c.y = V.lerp(c.sy, c.ty, ease);
      }
      if(tt >= 1){
        anim.active = false;
        for(var q = 0; q < cents.length; q++){ cents[q].x = cents[q].tx; cents[q].y = cents[q].ty; }
      }
      dirty = true;
    }
    if(dirty){ paint(); dirty = false; }
  }, node);

  // init
  seedCentroids();
  draw();
  V.onTheme(draw);
});
