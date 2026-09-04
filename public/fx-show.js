/* СПРЕД v4 — светошоу: спектр-стены + полноэкранные волны на бит */
(() => {
  'use strict';
  const cv = document.querySelector('#show');
  const cx = cv.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1;
  let hue = 330, kick = 0, energy = 0, phase = 0, analyser = null, data = null;
  let beatIdx = 0, lastCut = 0;
  const rings = [], sweeps = [];
  const N = () => (innerWidth < 700 ? 26 : 72);

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize); resize();

  const seedRand = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  let audioLoud = 0;
  function barLevel(i, n, now) {
    const p = phase > 1 ? 1 : phase;
    const pat = .3 + seedRand(i) * .7;
    const wave = .55 + .45 * Math.sin(p * Math.PI * 2 - i * .35);
    // синтетический пульс: бьётся от бит-клока (работает и без звука)
    const env = Math.max(0, 1 - p) * (.4 + energy * 1.3) + kick * 1.6;
    const synth = env * pat * wave;
    let real = 0;
    if (analyser && data && audioLoud > 8) {
      const bin = Math.min(data.length - 1, Math.floor(i * data.length / n));
      real = Math.pow(data[bin] / 255, 1.4) * (1 + kick * .6);
    }
    return clamp(Math.max(synth, real) + kick * .35 * pat, 0, 1.1);
  }
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const hsl = (h, a = 1) => `hsla(${h}, 92%, ${58 + Math.sin(nowMs * .002) * 4}%, ${a})`;
  let nowMs = 0;

  function drawWall(yBase, n, maxH, alpha, dir) {
    const w = W / n;
    for (let i = 0; i < n; i++) {
      const lvl = barLevel(i, n, nowMs);
      const h = Math.max(2, lvl * maxH);
      const hh = hue + (i - n / 2) * (70 / n);
      cx.fillStyle = `hsla(${hh}, 92%, 62%, ${alpha})`;
      const y0 = dir === 1 ? yBase - h : yBase;
      cx.fillRect(i * w + .5, y0, Math.max(1, w - 1), h);
      // яркое основание
      cx.fillStyle = `hsla(${hh}, 95%, 75%, ${alpha + .2})`;
      cx.fillRect(i * w + .5, dir === 1 ? yBase - 2 : yBase, Math.max(1, w - 1), 2);
    }
  }

  function loop(now) {
    requestAnimationFrame(loop);
    nowMs = now;
    const st = (window.SpredCore && window.SpredCore.state) || {};
    if (st.playing) { hue = st.hue || hue; kick = st.kick || 0; energy = st.energy || 0; phase = st.phase || 0; }
    analyser = (window.SpredCore && window.SpredCore.analyser) || null;
    data = (window.SpredCore && window.SpredCore.data) || null;
    if (analyser && data) { let s = 0; for (let i = 0; i < data.length; i += 8) s += data[i]; audioLoud = s / (data.length / 8); } else audioLoud = 0;
    if (reduced || !st.playing) {
      if (!st.playing) { cx.clearRect(0, 0, W, H); return; }
    }
    cx.clearRect(0, 0, W, H);
    cx.globalCompositeOperation = 'lighter';
    // нижняя стена
    drawWall(H - 4, N(), H * .34, .5, 1);
    // верхняя мини-стена (зеркало)
    drawWall(4, Math.floor(N() / 2), H * .09, .28, -1);
    // волны-свипы (склейки)
    for (let i = sweeps.length - 1; i >= 0; i--) {
      const s = sweeps[i];
      const t = (now - s.t) / 620;
      if (t >= 1) { sweeps.splice(i, 1); continue; }
      const y = t * H;
      const grd = cx.createLinearGradient(0, y - 60, 0, y);
      grd.addColorStop(0, `hsla(${s.hue}, 95%, 65%, 0)`);
      grd.addColorStop(1, `hsla(${s.hue}, 95%, 65%, .5)`);
      cx.fillStyle = grd;
      cx.fillRect(0, y - 60, W, 60);
    }
    // кольца по краям экрана (на каждый бит)
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      const t = (now - r.t) / 700;
      if (t >= 1) { rings.splice(i, 1); continue; }
      const rad = 40 + t * Math.max(W, H) * .8;
      if (!(rad > 1)) continue;
      cx.strokeStyle = `hsla(${r.hue}, 95%, 65%, ${r.p * .4 * (1 - t)})`;
      cx.lineWidth = 6 + r.p * 16 * (1 - t);
      cx.beginPath();
      cx.arc(W / 2, H * .62, rad, 0, 6.283);
      cx.stroke();
    }
    cx.globalCompositeOperation = 'source-over';
  }

  window.SpredFx = {
    onBeat: ({ power = .5, hue: h, count } = {}) => {
      if (reduced) return;
      if (h !== undefined) hue = h;
      rings.push({ t: performance.now(), p: clamp(power, 0, 1), hue: hue + (Math.random() - .5) * 30 });
      if (rings.length > 4) rings.shift();
      if (power > .6) rings.push({ t: performance.now() - 90, p: clamp(power * .7, 0, 1), hue: (hue + 40) % 360 });
    },
    onCut: ({ hue: h } = {}) => {
      if (reduced) return;
      if (h !== undefined) hue = h;
      sweeps.push({ t: performance.now(), hue: hue });
    },
    onFrame: ({ hue: h, kick: k, energy: e, phase: p } = {}) => {
      if (h !== undefined) hue = h; kick = k; energy = e; phase = p;
    },
    onStart: () => { beatIdx = 0; },
  };
  requestAnimationFrame(loop);
})();
