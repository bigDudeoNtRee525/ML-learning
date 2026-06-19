/* widget: linear-transform
   "A matrix is a transformation of space."
   Shows a coordinate grid + basis vectors î, ĵ being moved by a 2x2 matrix.
   Animates a smooth lerp from the current transform to the new one whenever the
   matrix changes (sliders or preset buttons). Shades the unit square's image and
   reports the determinant = a*d - b*c = signed area of that image. */
MLViz.register('linear-transform', function(node, V){
  var P = V.panel(node, {
    title: 'A matrix transforms space',
    caption: 'A 2×2 matrix sends î=(1,0) to column 1 and ĵ=(0,1) to column 2; the whole grid rides along. ' +
             'Drag the sliders or hit a preset — the grid animates to the new transform. ' +
             'The shaded patch is the image of the unit square; its area is |det|. ' +
             'det &lt; 0 means space got flipped (orientation reversed).'
  });

  var C = V.makeCanvas(P.body, 560, 340), ctx = C.ctx;

  // readout line (matrix + determinant)
  var readline = V.el('div', { class: 'mlviz-readline' });
  P.body.appendChild(readline);

  // legend
  var legend = V.el('div', { class: 'mlviz-legend' });
  P.body.appendChild(legend);

  // ---- geometry: world units -> canvas pixels --------------------------------
  var cx = C.w / 2, cy = C.h / 2;   // origin at canvas centre
  var unit = 46;                    // pixels per world unit
  function toPx(wx, wy){ return { x: cx + wx * unit, y: cy - wy * unit }; }

  // ---- state -----------------------------------------------------------------
  // cur = matrix currently displayed; tgt = matrix we are animating toward.
  // Stored column-major as basis images: i=(ix,iy)=image of (1,0), j=(jx,jy)=image of (0,1).
  // For matrix [[a,b],[c,d]]: a=ix, b=jx, c=iy, d=jy.
  var cur = { ix:1, iy:0, jx:0, jy:1 };
  var tgt = { ix:1, iy:0, jx:0, jy:1 };
  var from = { ix:1, iy:0, jx:0, jy:1 };
  var anim = { active:false, t:0, dur:0.5 };
  var last = 0;

  // example vector (in ORIGINAL space) — rides along with the transform
  var exV = { x:1, y:1 };

  // ---- sliders ---------------------------------------------------------------
  function f2(v){ return (v>=0?' ':'') + v.toFixed(2); }
  var sa = V.slider({ label:'a (î x)', min:-2, max:2, step:0.05, value:1, format:f2, onInput:function(v){ setTarget(v, null, null, null); } });
  var sb = V.slider({ label:'b (ĵ x)', min:-2, max:2, step:0.05, value:0, format:f2, onInput:function(v){ setTarget(null, v, null, null); } });
  var scc= V.slider({ label:'c (î y)', min:-2, max:2, step:0.05, value:0, format:f2, onInput:function(v){ setTarget(null, null, v, null); } });
  var sd = V.slider({ label:'d (ĵ y)', min:-2, max:2, step:0.05, value:1, format:f2, onInput:function(v){ setTarget(null, null, null, v); } });
  P.controls.appendChild(sa.wrap);
  P.controls.appendChild(sb.wrap);
  P.controls.appendChild(scc.wrap);
  P.controls.appendChild(sd.wrap);

  // current matrix entries (target values, which sliders reflect)
  function curA(){ return tgt.ix; }
  function curB(){ return tgt.jx; }
  function curC(){ return tgt.iy; }
  function curD(){ return tgt.jy; }

  // begin animating toward a new matrix; null args keep the existing target value
  function setTarget(a, b, c, d){
    var na = (a==null) ? tgt.ix : a;
    var nb = (b==null) ? tgt.jx : b;
    var nc = (c==null) ? tgt.iy : c;
    var nd = (d==null) ? tgt.jy : d;
    // start the lerp from wherever we currently are on screen
    from.ix = cur.ix; from.iy = cur.iy; from.jx = cur.jx; from.jy = cur.jy;
    tgt.ix = na; tgt.jx = nb; tgt.iy = nc; tgt.jy = nd;
    anim.active = true; anim.t = 0;
  }

  // preset applies all four AND syncs the sliders
  function applyPreset(a, b, c, d){
    sa.set(a); sb.set(b); scc.set(c); sd.set(d);
    setTarget(a, b, c, d);
  }

  P.controls.appendChild(V.button('Identity', function(){ applyPreset(1,0,0,1); }, {ghost:true}));
  P.controls.appendChild(V.button('Rotate 90°', function(){ applyPreset(0,-1,1,0); }, {ghost:true}));
  P.controls.appendChild(V.button('Shear', function(){ applyPreset(1,1,0,1); }, {ghost:true}));
  P.controls.appendChild(V.button('Scale 1.5×', function(){ applyPreset(1.5,0,0,1.5); }, {ghost:true}));
  P.controls.appendChild(V.button('Reflect', function(){ applyPreset(-1,0,0,1); }, {ghost:true}));

  // ---- math helpers ----------------------------------------------------------
  // apply the CURRENT (interpolated) transform to a world point (wx,wy)
  function apply(wx, wy){
    return { x: cur.ix * wx + cur.jx * wy, y: cur.iy * wx + cur.jy * wy };
  }

  function easeInOut(t){ return t<0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2; }

  // ---- arrow drawing ---------------------------------------------------------
  function arrow(p0, p1, color, width){
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    var ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    var hl = 11;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p1.x - hl*Math.cos(ang - 0.4), p1.y - hl*Math.sin(ang - 0.4));
    ctx.lineTo(p1.x - hl*Math.cos(ang + 0.4), p1.y - hl*Math.sin(ang + 0.4));
    ctx.closePath(); ctx.fill();
  }

  // ---- draw ------------------------------------------------------------------
  function draw(){
    var p = V.palette();
    ctx.clearRect(0, 0, C.w, C.h);

    // background
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, C.w, C.h);

    var range = 5; // draw grid lines from -range..range in world units

    // faint reference grid (untransformed) so movement is visible against it
    ctx.strokeStyle = p.grid; ctx.lineWidth = 1;
    for(var g = -range; g <= range; g++){
      var pv0 = toPx(g, -range), pv1 = toPx(g, range);
      ctx.beginPath(); ctx.moveTo(pv0.x, pv0.y); ctx.lineTo(pv1.x, pv1.y); ctx.stroke();
      var ph0 = toPx(-range, g), ph1 = toPx(range, g);
      ctx.beginPath(); ctx.moveTo(ph0.x, ph0.y); ctx.lineTo(ph1.x, ph1.y); ctx.stroke();
    }

    // transformed grid (the moving rubber sheet) — accent-tinted lines
    ctx.strokeStyle = p.dark ? 'rgba(129,140,248,0.45)' : 'rgba(79,70,229,0.40)';
    ctx.lineWidth = 1;
    for(var k = -range; k <= range; k++){
      // vertical line of constant world-x = k
      var a0 = apply(k, -range), a1 = apply(k, range);
      var pa0 = toPx(a0.x, a0.y), pa1 = toPx(a1.x, a1.y);
      ctx.beginPath(); ctx.moveTo(pa0.x, pa0.y); ctx.lineTo(pa1.x, pa1.y); ctx.stroke();
      // horizontal line of constant world-y = k
      var b0 = apply(-range, k), b1 = apply(range, k);
      var pb0 = toPx(b0.x, b0.y), pb1 = toPx(b1.x, b1.y);
      ctx.beginPath(); ctx.moveTo(pb0.x, pb0.y); ctx.lineTo(pb1.x, pb1.y); ctx.stroke();
    }

    // image of the unit square: corners (0,0)(1,0)(1,1)(0,1) under cur
    var s00 = apply(0,0), s10 = apply(1,0), s11 = apply(1,1), s01 = apply(0,1);
    var q00 = toPx(s00.x, s00.y), q10 = toPx(s10.x, s10.y), q11 = toPx(s11.x, s11.y), q01 = toPx(s01.x, s01.y);
    var det = cur.ix * cur.jy - cur.jx * cur.iy;
    // shade: green-ish if det>0 (orientation kept), red-ish if det<0 (flipped)
    var fill = det >= 0
      ? (p.dark ? 'rgba(52,211,153,0.22)' : 'rgba(16,185,129,0.20)')
      : (p.dark ? 'rgba(248,113,113,0.24)' : 'rgba(225,29,72,0.20)');
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(q00.x, q00.y); ctx.lineTo(q10.x, q10.y); ctx.lineTo(q11.x, q11.y); ctx.lineTo(q01.x, q01.y);
    ctx.closePath(); ctx.fill();

    // axes through origin (drawn on top of grid, under vectors)
    var ox = toPx(0,0);
    ctx.strokeStyle = p.axis; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(toPx(-range,0).x, ox.y); ctx.lineTo(toPx(range,0).x, ox.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox.x, toPx(0,-range).y); ctx.lineTo(ox.x, toPx(0,range).y); ctx.stroke();

    // example vector (image of exV)
    var ev = apply(exV.x, exV.y);
    arrow(ox, toPx(ev.x, ev.y), p.warn, 2.2);

    // basis vectors î (image of (1,0)) and ĵ (image of (0,1))
    var iImg = apply(1,0), jImg = apply(0,1);
    arrow(ox, toPx(iImg.x, iImg.y), p.blue, 3.2);
    arrow(ox, toPx(jImg.x, jImg.y), p.good, 3.2);

    // labels for the basis vectors
    ctx.font = '600 13px Inter, sans-serif';
    var ip = toPx(iImg.x, iImg.y), jp = toPx(jImg.x, jImg.y);
    ctx.fillStyle = p.blue; ctx.fillText('î', ip.x + 6, ip.y - 4);
    ctx.fillStyle = p.good; ctx.fillText('ĵ', jp.x + 6, jp.y - 4);
    ctx.fillStyle = p.warn;
    var evp = toPx(ev.x, ev.y);
    ctx.font = '500 11px Inter, sans-serif';
    ctx.fillText('v', evp.x + 6, evp.y - 4);
  }

  // ---- readouts (matrix text + determinant) ----------------------------------
  function updateReadline(){
    var p = V.palette();
    var a = curA(), b = curB(), c = curC(), d = curD();
    var det = a * d - b * c;
    var sign = det > 0.0001 ? '' : (det < -0.0001 ? 'flips space (det &lt; 0)' : 'collapses to a line (det = 0)');
    readline.innerHTML =
      'M = [ <b>' + a.toFixed(2) + '</b>&nbsp;&nbsp;<b>' + b.toFixed(2) + '</b> ; ' +
      '<b>' + c.toFixed(2) + '</b>&nbsp;&nbsp;<b>' + d.toFixed(2) + '</b> ]' +
      '&nbsp;&nbsp;•&nbsp;&nbsp;det = a·d − b·c = <b>' + det.toFixed(2) + '</b>' +
      '&nbsp;&nbsp;•&nbsp;&nbsp;|det| = area of image = <b>' + Math.abs(det).toFixed(2) + '</b>' +
      (sign ? '&nbsp;&nbsp;(' + sign + ')' : '');
  }

  function updateLegend(){
    var p = V.palette();
    legend.innerHTML =
      '<span><i style="background:' + p.blue + '"></i>î = column 1</span>' +
      '<span><i style="background:' + p.good + '"></i>ĵ = column 2</span>' +
      '<span><i style="background:' + p.warn + '"></i>example vector v</span>' +
      '<span><i style="background:' + (p.dark?'rgba(52,211,153,0.5)':'rgba(16,185,129,0.5)') + '"></i>image of unit square</span>';
  }

  // ---- animation loop --------------------------------------------------------
  function tick(t){
    var now = t / 1000;
    var dt = last ? (now - last) : 0;
    last = now;
    if(anim.active){
      anim.t += dt / anim.dur;
      if(anim.t >= 1){ anim.t = 1; anim.active = false; }
      var e = easeInOut(V.clamp(anim.t, 0, 1));
      cur.ix = V.lerp(from.ix, tgt.ix, e);
      cur.iy = V.lerp(from.iy, tgt.iy, e);
      cur.jx = V.lerp(from.jx, tgt.jx, e);
      cur.jy = V.lerp(from.jy, tgt.jy, e);
    }
    draw();
    updateReadline();
  }

  updateLegend();
  updateReadline();
  V.loop(tick, node);
  V.onTheme(function(){ updateLegend(); updateReadline(); });
});
