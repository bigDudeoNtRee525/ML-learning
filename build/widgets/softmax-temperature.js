/* widget: softmax-temperature — an LLM's next-token distribution over a tiny
   vocabulary with fixed logits, and how the temperature T reshapes it.
   p_i = exp(z_i/T) / Σ_j exp(z_j/T). Low T -> peaky/greedy; high T -> flat/random.
   A "Sample" button draws a token according to the current probabilities and
   highlights the chosen bar. Teaching point: LLM output is a probability
   distribution over the vocabulary, and temperature is the randomness knob. */
MLViz.register('softmax-temperature', function(node, V){
  var P = V.panel(node, {
    title: 'Temperature: the randomness knob',
    caption: 'Prompt: “The cat sat on the ___”. The model assigns a fixed score (logit) to each candidate next word; softmax turns those scores into probabilities pᵢ = exp(zᵢ/T) / Σ exp(zⱼ/T). Drag temperature T: low T makes the distribution peaky (greedy — almost always the top word), high T flattens it (more random and creative). Hit Sample to roll a weighted die and pick a token.'
  });
  var C = V.makeCanvas(P.body, 560, 330), ctx = C.ctx;

  // ---- fixed vocabulary with fixed logits (deterministic) ----
  var vocab = [
    { w: 'mat',   z: 3.1 },
    { w: 'floor', z: 2.4 },
    { w: 'sofa',  z: 1.9 },
    { w: 'rug',   z: 1.2 },
    { w: 'roof',  z: 0.8 },
    { w: 'table', z: 0.1 },
    { w: 'idea',  z: -0.5 }
  ];
  var n = vocab.length;

  var state = { T: 1.0, chosen: -1 };

  // ---- deterministic RNG (mulberry32) seeded for reproducible-but-varied draws ----
  var seed = 0x9e3779b9 >>> 0;
  function rand(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ---- softmax with temperature (numerically stable: subtract max) ----
  function softmax(T){
    var i, mx = -Infinity;
    var scaled = new Array(n);
    for(i = 0; i < n; i++){ scaled[i] = vocab[i].z / T; if(scaled[i] > mx) mx = scaled[i]; }
    var sum = 0, ex = new Array(n);
    for(i = 0; i < n; i++){ ex[i] = Math.exp(scaled[i] - mx); sum += ex[i]; }
    var p = new Array(n);
    for(i = 0; i < n; i++) p[i] = ex[i] / sum;
    return p;
  }

  function sample(){
    var p = softmax(state.T);
    var r = rand(), acc = 0, pick = n - 1;
    for(var i = 0; i < n; i++){ acc += p[i]; if(r <= acc){ pick = i; break; } }
    state.chosen = pick;
  }

  // ---- layout ----
  var m = { l: 64, r: 16, t: 18, b: 46 };

  function draw(){
    var p = V.palette();
    ctx.clearRect(0, 0, C.w, C.h);

    var probs = softmax(state.T);
    var plotW = C.w - m.l - m.r;
    var plotH = C.h - m.t - m.b;
    var baseY = m.t + plotH;          // y of the probability=0 baseline
    var maxP = 1.0;                   // fixed y-scale 0..1 so changes are legible
    var slot = plotW / n;
    var bw = slot * 0.62;

    // ---- y grid + axis (probability 0..1) ----
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    var gridvals = [0, 0.25, 0.5, 0.75, 1.0];
    for(var g = 0; g < gridvals.length; g++){
      var gv = gridvals[g];
      var gy = baseY - gv / maxP * plotH;
      ctx.strokeStyle = p.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(m.l, gy); ctx.lineTo(m.l + plotW, gy); ctx.stroke();
      ctx.fillStyle = p.soft;
      ctx.fillText(gv.toFixed(2), m.l - 7, gy);
    }
    // y-axis title
    ctx.save();
    ctx.translate(16, m.t + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = p.soft; ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText('probability  pᵢ', 0, 0);
    ctx.restore();

    // ---- baseline axis ----
    ctx.strokeStyle = p.axis; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(m.l, baseY); ctx.lineTo(m.l + plotW, baseY); ctx.stroke();

    // ---- bars ----
    var topIdx = 0;
    for(var i = 1; i < n; i++) if(probs[i] > probs[topIdx]) topIdx = i;

    for(i = 0; i < n; i++){
      var cx = m.l + slot * (i + 0.5);
      var bx = cx - bw / 2;
      var h = probs[i] / maxP * plotH;
      var by = baseY - h;

      var isChosen = (i === state.chosen);
      var fill;
      if(isChosen)      fill = p.pink;
      else if(i === topIdx) fill = p.accent;
      else              fill = p.blue;

      // bar
      ctx.fillStyle = fill;
      ctx.globalAlpha = isChosen ? 1 : 0.92;
      roundRectTop(bx, by, bw, h, 4);
      ctx.fill();
      ctx.globalAlpha = 1;

      // chosen highlight outline + glow ring on top
      if(isChosen){
        ctx.strokeStyle = p.pink; ctx.lineWidth = 2;
        roundRectTop(bx, by, bw, h, 4);
        ctx.stroke();
      }

      // probability number above the bar
      ctx.fillStyle = p.ink;
      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText((probs[i] * 100).toFixed(1) + '%', cx, Math.min(by - 4, baseY - 4));

      // word label under the bar
      ctx.fillStyle = isChosen ? p.pink : p.ink;
      ctx.font = (isChosen ? 'bold ' : '') + '12px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText('“' + vocab[i].w + '”', cx, baseY + 6);

      // logit value (faint) beneath the word
      ctx.fillStyle = p.soft;
      ctx.font = '9px Inter, system-ui, sans-serif';
      ctx.fillText('z=' + vocab[i].z.toFixed(1), cx, baseY + 22);
    }

    // ---- legend / status (top-right) ----
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '10px Inter, system-ui, sans-serif';
    var lx = m.l + 6, ly = m.t + 8;
    swatch(lx, ly, p.accent); ctx.fillStyle = p.ink; ctx.fillText('top (greedy pick)', lx + 16, ly);
    if(state.chosen >= 0){
      swatch(lx, ly + 16, p.pink); ctx.fillStyle = p.ink;
      ctx.fillText('sampled: “' + vocab[state.chosen].w + '”', lx + 16, ly + 16);
    }

    function swatch(x, y, col){
      ctx.fillStyle = col; ctx.fillRect(x, y - 5, 11, 10);
    }
  }

  function roundRectTop(x, y, w, h, r){
    r = Math.min(r, w / 2, h);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }

  // ---- controls ----
  var Tslider = V.slider({
    label: 'temperature T', min: 0.2, max: 2.0, step: 0.05, value: state.T,
    format: function(v){ return v.toFixed(2) + (v < 0.55 ? '  (greedy)' : v > 1.5 ? '  (creative)' : ''); },
    onInput: function(v){ state.T = v; draw(); }
  });
  P.controls.appendChild(Tslider.wrap);

  P.controls.appendChild(V.button('Sample', function(){ sample(); draw(); }));
  P.controls.appendChild(V.button('Clear', function(){ state.chosen = -1; draw(); }, { ghost: true }));

  draw();
  V.onTheme(draw);
});
