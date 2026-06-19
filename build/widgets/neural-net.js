/* widget: neural-net — a small MLP forward pass with an animated signal pulse.
   3 input -> 4 hidden (ReLU) -> 4 hidden (ReLU) -> 2 output (sigmoid).
   Edge colour = weight sign (blue +, red -), thickness = |weight|.
   Neuron brightness = its activation. A pulse travels left->right on Run. */
MLViz.register('neural-net', function(node, V){
  var P = V.panel(node, {
    title: 'A neural network is layers of neurons',
    caption: 'Each neuron = (weighted sum of its inputs) + bias, then an activation (ReLU in hidden layers, sigmoid at the output). Drag the three input sliders or press Run forward pass to watch the signal flow left to right. Blue edges = positive weights, red = negative; thicker = larger |weight|. A neuron glows brighter the more strongly it activates.'
  });
  var C = V.makeCanvas(P.body, 560, 340), ctx = C.ctx;

  // ---- deterministic seeded weights (mulberry32) ----
  function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var rnd = mulberry32(20240610);
  function randn(){ // Box-Muller from seeded uniform
    var u = 0, v = 0; while(u === 0) u = rnd(); while(v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // layer sizes: 3 -> 4 -> 4 -> 2
  var sizes = [3, 4, 4, 2];
  // weight matrices W[l][i][j] = weight from neuron i of layer l to neuron j of layer l+1
  var W = [], B = [];
  (function init(){
    for(var l = 0; l < sizes.length - 1; l++){
      var rows = [];
      // Xavier-ish scale so ReLU activations stay in a readable range
      var scale = Math.sqrt(2 / sizes[l]);
      for(var i = 0; i < sizes[l]; i++){
        var col = [];
        for(var j = 0; j < sizes[l + 1]; j++) col.push(randn() * scale);
        rows.push(col);
      }
      W.push(rows);
      var bs = [];
      for(var k = 0; k < sizes[l + 1]; k++) bs.push(randn() * 0.3);
      B.push(bs);
    }
  })();

  function relu(z){ return z > 0 ? z : 0; }
  function sigmoid(z){ return 1 / (1 + Math.exp(-z)); }

  var inputs = [0.6, 0.2, 0.9];
  var acts = [];   // acts[l] = array of activations for layer l (layer 0 = inputs)

  // full forward pass; returns per-layer activations
  function forward(){
    acts = [inputs.slice()];
    for(var l = 0; l < sizes.length - 1; l++){
      var prev = acts[l], out = [];
      for(var j = 0; j < sizes[l + 1]; j++){
        var z = B[l][j];
        for(var i = 0; i < sizes[l]; i++) z += prev[i] * W[l][i][j];
        // hidden layers use ReLU; the final layer uses sigmoid
        out.push(l === sizes.length - 2 ? sigmoid(z) : relu(z));
      }
      acts.push(out);
    }
    return acts;
  }
  forward();

  // ---- geometry: x positions per layer, y positions per neuron ----
  var padL = 56, padR = 96, padT = 46, padB = 30;
  function layerX(l){ return padL + (C.w - padL - padR) * (l / (sizes.length - 1)); }
  function neuronY(l, i){
    var n = sizes[l];
    var top = padT, bot = C.h - padB;
    if(n === 1) return (top + bot) / 2;
    return top + (bot - top) * (i / (n - 1));
  }
  var R = 17; // neuron radius

  // normalisation for brightness: track a soft max per draw
  function actNorm(l){
    if(l === 0) return 1;                       // inputs already in [0,1]
    if(l === sizes.length - 1) return 1;        // sigmoid outputs in [0,1]
    var m = 0.001, a = acts[l];                 // ReLU layers: scale by current max
    for(var i = 0; i < a.length; i++) if(a[i] > m) m = a[i];
    return m;
  }

  // ---- animation state: a wavefront sweeps across edges ----
  var anim = { active: false, t: 0, dur: 1500, last: 0 };
  function runPulse(){ anim.active = true; anim.t = 0; anim.last = 0; }

  // returns 0..1 reveal fraction for the edges entering layer (l+1)
  function edgeReveal(l, frac){
    // each layer transition gets its own slice of the timeline
    var segs = sizes.length - 1;
    var lo = l / segs, hi = (l + 1) / segs;
    return V.clamp((frac - lo) / (hi - lo), 0, 1);
  }
  // neuron "lit" fraction (lights as its incoming edges complete)
  function neuronLit(l, frac){
    if(l === 0) return 1;
    return edgeReveal(l - 1, frac);
  }

  function hexA(hex, a){
    // hex like #rrggbb -> rgba string
    var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function mix(c1, c2, t){ // mix two #rrggbb
    function p(h,i){ return parseInt(h.slice(i,i+2),16); }
    var r = Math.round(V.lerp(p(c1,1), p(c2,1), t));
    var g = Math.round(V.lerp(p(c1,3), p(c2,3), t));
    var b = Math.round(V.lerp(p(c1,5), p(c2,5), t));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // largest |weight| for thickness scaling
  var wMax = 0.001;
  for(var l0 = 0; l0 < W.length; l0++) for(var i0 = 0; i0 < W[l0].length; i0++)
    for(var j0 = 0; j0 < W[l0][i0].length; j0++) wMax = Math.max(wMax, Math.abs(W[l0][i0][j0]));

  function draw(ts){
    var p = V.palette();
    ctx.clearRect(0, 0, C.w, C.h);

    // advance animation by real elapsed time (frame-rate independent)
    var frac = 1;
    if(anim.active){
      var dt = (anim.last && ts) ? Math.min(64, ts - anim.last) : 16.7;
      anim.last = ts || 0;
      anim.t += dt;
      frac = anim.t / anim.dur;
      if(frac >= 1){ frac = 1; anim.active = false; }
    }

    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';

    // layer titles
    var titles = ['inputs (3)', 'hidden · ReLU (4)', 'hidden · ReLU (4)', 'outputs · σ (2)'];
    ctx.fillStyle = p.soft;
    for(var l = 0; l < sizes.length; l++){
      ctx.fillText(titles[l], layerX(l), 18);
    }

    // ---- edges ----
    for(var L = 0; L < sizes.length - 1; L++){
      var reveal = edgeReveal(L, frac);
      for(var i = 0; i < sizes[L]; i++){
        for(var j = 0; j < sizes[L + 1]; j++){
          var w = W[L][i][j];
          var x1 = layerX(L) + R, y1 = neuronY(L, i);
          var x2 = layerX(L + 1) - R, y2 = neuronY(L + 1, j);
          var t = Math.min(1, Math.abs(w) / wMax);
          var col = w >= 0 ? p.blue : p.bad;
          // base faint edge
          ctx.strokeStyle = hexA(col, 0.12 + 0.32 * t);
          ctx.lineWidth = 0.6 + 2.6 * t;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

          // animated bright segment travelling along the edge
          if(reveal > 0 && reveal < 1){
            var head = reveal;
            var tail = Math.max(0, reveal - 0.28);
            ctx.strokeStyle = hexA(col, 0.85);
            ctx.lineWidth = 1.2 + 3.2 * t;
            ctx.beginPath();
            ctx.moveTo(V.lerp(x1, x2, tail), V.lerp(y1, y2, tail));
            ctx.lineTo(V.lerp(x1, x2, head), V.lerp(y1, y2, head));
            ctx.stroke();
          } else if(reveal >= 1){
            // fully delivered: a steady, slightly stronger line
            ctx.strokeStyle = hexA(col, 0.28 + 0.4 * t);
            ctx.lineWidth = 0.8 + 2.8 * t;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          }
        }
      }
    }

    // ---- neurons ----
    for(var l2 = 0; l2 < sizes.length; l2++){
      var norm = actNorm(l2);
      var lit = neuronLit(l2, frac);
      for(var k = 0; k < sizes[l2]; k++){
        var x = layerX(l2), y = neuronY(l2, k);
        var a = acts[l2][k];
        var bright = V.clamp(a / norm, 0, 1) * lit;
        // fill: blend panel -> accent by brightness
        var base = p.dark ? '#1b212b' : '#fbfaf8';
        var hot = l2 === sizes.length - 1 ? p.good : (l2 === 0 ? p.teal : p.accent);
        ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fillStyle = mix(base, hot, bright);
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = lit > 0.5 ? hot : p.faint;
        ctx.stroke();

        // activation number inside / beside
        ctx.fillStyle = bright > 0.55 ? '#ffffff' : p.ink;
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillText(a.toFixed(2), x, y + 3.5);
      }
    }

    // ---- input labels on the left ----
    ctx.fillStyle = p.soft;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    for(var ii = 0; ii < sizes[0]; ii++){
      ctx.fillText('x' + (ii + 1), layerX(0) - R - 6, neuronY(0, ii) + 4);
    }

    // ---- output readout on the right ----
    ctx.textAlign = 'left';
    var outL = sizes.length - 1;
    for(var o = 0; o < sizes[outL]; o++){
      var oy = neuronY(outL, o);
      ctx.fillStyle = p.good;
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.fillText('ŷ' + (o + 1) + ' = ' + acts[outL][o].toFixed(3),
                   layerX(outL) + R + 8, oy + 4);
    }
  }

  // sliders for the three inputs
  for(var s = 0; s < 3; s++){
    (function(idx){
      var sl = V.slider({
        label: 'input x' + (idx + 1), min: 0, max: 1, step: 0.01, value: inputs[idx],
        format: function(v){ return v.toFixed(2); },
        onInput: function(v){ inputs[idx] = v; forward(); runPulse(); }
      });
      P.controls.appendChild(sl.wrap);
    })(s);
  }
  P.controls.appendChild(V.button('Run forward pass', function(){ forward(); runPulse(); }));

  forward();
  V.loop(draw, node);   // continuous loop drives the pulse and recolours on theme
});
