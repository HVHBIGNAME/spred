/* СПРЕД v4 — ядро: видео-анализ, бит-клок, хуки светошоу */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const video = $('#dance'), fx = $('#fx'), ctx = fx.getContext('2d');
  const eqC = $('#equalizer'), eqX = eqC.getContext('2d');
  const gate = $('#gate'), title = $('#title');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BPM = 168, BEAT_MS = 60000 / BPM;

  let audio, analyser, data = null;
  let running = false, hue = 335, targetHue = 335, prevTarget = 335;
  let kick = 0, splitK = 0, energy = 0;
  let lastReal = 0, beatCount = 0, lastSample = 0, lastLuma = 0, prevPix = null;
  let visSm = 0, nextVisAt = 0, nextAudioAt = 0, bassPrev = 0;
  let rings = [], sparks = [];
  const cam = document.createElement('canvas'); cam.width = 48; cam.height = 27;
  const camX = cam.getContext('2d', { willReadFrequently: true });

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const ang = (a, b) => ((b - a + 540) % 360) - 180;
  const hsl = h => `hsl(${h}, 90%, 62%)`;
  const rgbOf = h => { const c = .9 * .62, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = .62 - c / 2, q = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]; return q.map(v => Math.round((v + m) * 255)); };
  const hook = (n, d) => { try { const f = window.SpredFx && window.SpredFx[n]; if (f) f(d); } catch (e) {} };
  window.SpredCore = { state: { hue: 335, kick: 0, energy: 0, playing: false, phase: 0 }, analyser: null, data: null, video };

  // ---- размеры ----
  function resize() { const d = Math.min(devicePixelRatio || 1, 2); fx.width = innerWidth * d; fx.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  addEventListener('resize', resize); resize();

  // ---- аудио ----
  function initAudio() {
    if (audio) return;
    try {
      audio = new AudioContext();
      const src = audio.createMediaElementSource(video);
      analyser = audio.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = .75;
      src.connect(analyser); analyser.connect(audio.destination);
      data = new Uint8Array(analyser.frequencyBinCount);
      window.SpredCore.analyser = analyser; window.SpredCore.data = data;
    } catch (e) { console.warn('audio off:', e); }
  }
  async function start(muted) {
    initAudio();
    video.muted = muted;
    try { if (audio && audio.state === 'suspended') await audio.resume(); await video.play(); } catch (e) { console.warn('playback blocked:', e); }
    gate.classList.add('is-leaving');
    running = true;
    window.SpredCore.state.playing = true;
    $('#soundLabel').textContent = muted ? 'звук выкл.' : 'звук вкл.';
    $('#soundBtn').setAttribute('aria-pressed', String(!muted));
    $('#playLabel').textContent = 'пауза'; $('#playIcon').textContent = 'Ⅱ';
    hook('onStart', { muted });
    setTimeout(() => title.classList.add('live'), 900); // отпустить анимацию букв для JS-танца
  }
  $('#startSound').addEventListener('click', () => start(false));
  $('#startSilent').addEventListener('click', () => start(true));
  $('#soundBtn').addEventListener('click', async () => { initAudio(); video.muted = !video.muted; if (audio && audio.state === 'suspended') await audio.resume(); $('#soundLabel').textContent = video.muted ? 'звук выкл.' : 'звук вкл.'; });
  $('#playBtn').addEventListener('click', async () => { if (video.paused) { initAudio(); if (audio && audio.state === 'suspended') await audio.resume(); await video.play(); } else video.pause(); });
  video.addEventListener('pause', () => { $('#playIcon').textContent = '▶'; $('#playLabel').textContent = 'плей'; });
  video.addEventListener('play', () => { $('#playIcon').textContent = 'Ⅱ'; $('#playLabel').textContent = 'пауза'; });
  video.addEventListener('loadeddata', () => video.classList.add('ready'));
  video.addEventListener('timeupdate', () => {
    const d = video.duration || 15;
    $('#progressBar').style.width = `${video.currentTime / d * 100}%`;
    $('#currentTime').textContent = '00:' + String(Math.floor(video.currentTime) % 60).padStart(2, '0');
  });

  // ---- бит: общий обработчик ----
  function fireBeat(power, fromAudio) {
    beatCount++;
    const now = performance.now();
    lastReal = now;
    kick = 1; splitK = 1;
    window.SpredCore.state.kick = 1;
    hook('onBeat', { power, hue, count: beatCount, fromAudio });
    // кольцо
    const cx = innerWidth * .5, cy = innerHeight * .72;
    if (rings.length < (innerWidth < 700 ? 3 : 5)) rings.push({ x: cx + (Math.random() - .5) * innerWidth * .3, y: cy + (Math.random() - .5) * innerHeight * .2, r: 12, a: .5, w: 3 + power * 5 });
    // искры
    const n = Math.round(2 + power * 6);
    for (let i = 0; i < n; i++) {
      const an = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 4;
      sparks.push({ x: innerWidth * (.2 + Math.random() * .6), y: innerHeight * (.55 + Math.random() * .3), vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 2, life: 1, size: Math.random() * 2.6 + .8 });
    }
  }

  // ---- анализ кадра (каждые ~120мс): цвет, склейки, движение ----
  function sample(now) {
    if (!video.videoWidth || now - lastSample < 120) return;
    lastSample = now;
    camX.drawImage(video, 0, 0, 48, 27);
    const p = camX.getImageData(0, 0, 48, 27).data;
    let l = 0, buckets = new Array(12).fill(0), sx = 0, sy = 0, sw = 0;
    for (let y = 0; y < 27; y++) for (let x = 0; x < 48; x++) {
      const i = (y * 48 + x) * 4, r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dv = mx - mn;
      l += (r + g + b) / 3;
      const s = mx ? dv / mx : 0;
      if (s >= .16 && mx >= .1) buckets[Math.floor(((Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180 / Math.PI + 360) % 360) / 30)] += s;
      if (prevPix) { const df = Math.abs(p[i] - prevPix[i]) + Math.abs(p[i + 1] - prevPix[i + 1]) + Math.abs(p[i + 2] - prevPix[i + 2]); if (df > 50) { const w = df / 765; sx += x * w; sy += y * w; sw += w; } }
    }
    l /= 1296;
    const mb = Math.max(...buckets);
    if (mb) { targetHue = (buckets.indexOf(mb) * 30 + 15) % 360; }
    hue = (hue + ang(hue, targetHue) * .08 + 360) % 360;
    const motion = sw ? { x: sx / sw, y: sy / sw, energy: clamp(sw / 140, 0, 1) } : { x: 24, y: 18, energy: 0 };
    const lumaJump = lastLuma && Math.abs(l - lastLuma) > 26;
    const hueJump = mb && Math.abs(ang(prevTarget, targetHue)) > 55;
    prevTarget = targetHue;
    // визуальный бит: пик движения (танец = ритм) — работает БЕЗ звука
    visSm = visSm * .8 + motion.energy * .2;
    const vk = motion.energy - visSm;
    if (!(lumaJump || hueJump) && vk > .1 && motion.energy > .42 && now > nextVisAt) {
      nextVisAt = now + 210;
      fireBeat(clamp(.45 + vk * 3, .45, 1), false);
    }
    if (lumaJump || hueJump) {
      const pc = rgbOf(hue);
      const fl = document.querySelector('.flash');
      fl.style.background = `radial-gradient(circle at ${motion.x / 48 * 100}% ${motion.y / 27 * 100}%, ${hsl(hue)} 0%, transparent 62%)`;
      fl.style.opacity = lumaJump ? '.28' : '.18';
      const bd = document.querySelector('.band');
      bd.style.background = hsl(hue); bd.style.boxShadow = `0 0 26px 6px ${hsl(hue)}`;
      bd.classList.remove('run'); bd.classList.add('run');
      setTimeout(() => { fl.style.opacity = '0'; }, 320);
      hook('onCut', { hue });
    }
    if (motion.energy > .45 && !reduced && Math.random() < .5) {
      for (let i = 0; i < 2; i++) sparks.push({ x: motion.x / 48 * innerWidth, y: motion.y / 27 * innerHeight, vx: (Math.random() - .5) * 2, vy: -1 - Math.random() * 2.4, life: 1, size: Math.random() * 2 + 1 });
    }
    prevPix = new Uint8ClampedArray(p);
    lastLuma = l;
    window.SpredCore.state.hue = hue;
  }

  // ---- главный цикл ----
  function draw(now) {
    requestAnimationFrame(draw);
    const dt = Math.min(32, now - (draw.prev || now)); draw.prev = now;
    sample(now);
    // аудио-бит (если звук жив)
    if (analyser && data) {
      analyser.getByteFrequencyData(data);
      let bass = 0; for (let i = 2; i < 14; i++) bass += data[i]; bass /= 12 * 255;
      energy = energy * .9 + bass * .1;
      const rise = bass - bassPrev; bassPrev = bass;
      if (rise > .05 && bass > .34 && now > nextAudioAt) { nextAudioAt = now + 190; fireBeat(clamp(.5 + rise * 3, .5, 1), true); }
    } else { energy *= .92; }
    // бит-клок 168 BPM: между реальными битами держим фазу (пульс не замирает)
    const phase = lastReal ? ((now - lastReal) / BEAT_MS) : 0;
    window.SpredCore.state.phase = phase;
    if (lastReal && phase > 1 && beatCount > 0 && !reduced) {
      // свободный ход: если реальный бит опаздывает >~40мс, достукиваем сами
      if (phase > 1.12) fireBeat(.5, false);
    }
    kick *= .85; splitK *= .85;
    const k = kick, rgb = rgbOf(hue);
    window.SpredCore.state.kick = k; window.SpredCore.state.energy = energy;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    // ambient-заливка (живой цвет видео, дышит с битом)
    const amb = .05 + energy * .09 + k * .22;
    let g = ctx.createRadialGradient(innerWidth * .7, innerHeight * .88, 0, innerWidth * .7, innerHeight * .88, innerWidth * .75);
    g.addColorStop(0, `rgba(${rgb},${amb})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, innerWidth, innerHeight);
    g = ctx.createRadialGradient(innerWidth * .25, innerHeight * .15, 0, innerWidth * .25, innerHeight * .15, innerWidth * .5);
    g.addColorStop(0, `rgba(${rgbOf((hue + 40) % 360)},${amb * .5})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, innerWidth, innerHeight);
    // кольца
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.r += r.w * dt / 16; r.a -= .009 * dt / 16;
      ctx.strokeStyle = `rgba(${rgb},${clamp(r.a, 0, 1)})`; ctx.lineWidth = 2.5 + r.w * .4;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.283); ctx.stroke();
      if (r.a <= 0) rings.splice(i, 1);
    }
    // искры
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.x += s.vx * dt / 16; s.y += s.vy * dt / 16; s.vy += .05; s.life -= .02 * dt / 16;
      ctx.fillStyle = `rgba(255,${Math.round(200 + rgb[1] * .2)},255,${clamp(s.life, 0, 1) * .9})`; ctx.globalAlpha = clamp(s.life, 0, 1);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
      if (s.life <= 0) sparks.splice(i, 1);
    }
    // видео-пульс: сатурация/яркость/зум/RGB-сплит через drop-shadow
    const sp = splitK * 9;
    video.style.filter = `saturate(${1 + k * .25}) brightness(${1 + k * .1}) drop-shadow(${sp}px 0 0 rgba(255,70,140,.6)) drop-shadow(${-sp}px 0 0 rgba(70,225,255,.55))`;
    video.style.transform = `scale(${1.08 + k * .02})`;
    // заголовок танцует: покачивание по фазе бита + кик
    if (!reduced && title.classList.contains('live')) {
      const bob = Math.sin(phase * Math.PI * 2) * 3.2 * (0.4 + energy);
      [...title.children].forEach((sp, i) => {
        const sway = Math.sin(phase * Math.PI * 2 + i * .9) * 2.4;
        const sq = k > .4 ? (1 + Math.sin(i * 1.3) * .015) : 1;
        sp.style.transform = `translateY(${bob * .5}px) rotate(${sway}deg) scale(${sq})`;
      });
    }
    // мини-эквалайзер в плеере
    eqX.clearRect(0, 0, 180, 30); eqX.fillStyle = hsl(hue);
    for (let i = 0; i < 15; i++) { const v = data ? (data[i * 3] || 0) : Math.max(0, Math.sin(now / 80 + i) * (60 + 160 * energy)); const h = 2 + v / 255 * 26; eqX.globalAlpha = .35 + v / 255 * .6; eqX.fillRect(i * 12, 30 - h, 7, h); }
    eqX.globalAlpha = 1;
    hook('onFrame', { hue, kick: k, energy, phase });
  }
  requestAnimationFrame(draw);
})();
