/* СПРЕД v5 — движок: реальная синхронизация по бит-гриду песни (timeline.json) */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const video = $('#dance'), fx = $('#fx'), ctx = fx.getContext('2d');
  const gate = $('#gate'), title = $('#title'), wipe = $('.wipe');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let timeline = null, bi = 0, lastT = -1, downSet = null;
  let running = false, hue = 330, targetHue = 330, prevTarget = 330;
  let kick = 0, env = 0, lastSample = 0, lastLuma = 0, prevPix = null, cutAt = -9;
  let audio = null;
  const sparks = [], rings = [];
  const cam = document.createElement('canvas'); cam.width = 48; cam.height = 27;
  const camX = cam.getContext('2d', { willReadFrequently: true });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const ang = (a, b) => ((b - a + 540) % 360) - 180;
  const hslC = h => `hsl(${h}, 92%, 64%)`;
  const rgbOf = h => { const c = .92 * .64, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = .64 - c / 2, q = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]; return q.map(v => Math.round((v + m) * 255)); };

  function resize() { const d = Math.min(devicePixelRatio || 1, 2); fx.width = innerWidth * d; fx.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  addEventListener('resize', resize); resize();

  // --- timeline ---
  fetch('assets/timeline.json').then(r => r.json()).then(t => { timeline = t; downSet = new Set(t.downs); console.log('timeline', t.bpm, 'bpm,', t.count, 'beats'); }).catch(e => console.warn('no timeline', e));

  // --- старт ---
  function initAudio() { if (audio) return; try { audio = new AudioContext(); const s = audio.createMediaElementSource(video); s.connect(audio.destination); } catch (e) {} }
  async function start(muted) {
    initAudio();
    video.muted = muted;
    try { if (audio && audio.state === 'suspended') await audio.resume(); await video.play(); } catch (e) { console.warn(e); }
    gate.classList.add('is-leaving'); running = true;
    $('#soundLabel').textContent = muted ? 'звук выкл.' : 'звук вкл.';
    $('#playIcon').textContent = '❚❚'; $('#playLabel').textContent = 'пауза';
    setTimeout(() => title.classList.add('live'), 850);
  }
  $('#startSound').addEventListener('click', () => start(false));
  $('#startSilent').addEventListener('click', () => start(true));
  $('#soundBtn').addEventListener('click', async () => { initAudio(); video.muted = !video.muted; if (audio && audio.state === 'suspended') await audio.resume(); $('#soundLabel').textContent = video.muted ? 'звук выкл.' : 'звук вкл.'; });
  $('#playBtn').addEventListener('click', async () => { if (video.paused) { initAudio(); if (audio && audio.state === 'suspended') await audio.resume(); await video.play(); } else video.pause(); });
  video.addEventListener('play', () => { $('#playIcon').textContent = '❚❚'; $('#playLabel').textContent = 'пауза'; });
  video.addEventListener('pause', () => { $('#playIcon').textContent = '▶'; $('#playLabel').textContent = 'плей'; });
  video.addEventListener('loadeddata', () => video.classList.add('ready'));
  video.addEventListener('timeupdate', () => {
    const d = video.duration || 175;
    $('#progressBar').style.width = `${video.currentTime / d * 100}%`;
    $('#currentTime').textContent = fmt(video.currentTime); $('#totalTime').textContent = fmt(d);
  });
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;

  // --- удары ---
  function onBeat(p, down) {
    kick = Math.max(kick, down ? 1 : .75 * (.5 + p));
    if (reduced || !running) return;
    const rgb = rgbOf(hue);
    if (down) {
      const cx = innerWidth * .5, cy = innerHeight * .62;
      rings.push({ x: cx, y: cy, r: innerHeight * .1, a: .34, w: 7 });
      for (let i = 0; i < 10; i++) { const an = Math.random() * 6.283, sp = 1 + Math.random() * 3.5; sparks.push({ x: innerWidth * (.25 + Math.random() * .5), y: innerHeight * (.5 + Math.random() * .35), vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 2.4, life: 1, s: 1.4 + Math.random() * 2 }); }
      title.classList.add('kick'); setTimeout(() => title.classList.remove('kick'), 140);
    } else {
      for (let i = 0; i < 2; i++) sparks.push({ x: innerWidth * (.3 + Math.random() * .4), y: innerHeight * (.62 + Math.random() * .25), vx: (Math.random() - .5) * 1.6, vy: -1 - Math.random() * 1.6, life: 1, s: 1 + Math.random() * 1.4 });
    }
  }
  function fireDue(t) {
    if (lastT > 0 && t < lastT - .5) { bi = 0; } lastT = t;
    if (!timeline || bi >= timeline.count) return;
    let n = 0;
    while (bi < timeline.count && timeline.beats[bi][0] <= t) {
      const [bt, p] = timeline.beats[bi];
      const down = downSet && downSet.has(bi);
      if (bt >= 0.15) { onBeat(p, down); if (window.__dbg) window.__dbg.fired++; }        // тишину интро пропускаем
      bi++; n++;
      if (n > 8) break;
    }
    env = env * .995 + (n ? .05 : 0);          // плавная «громкость» секции
    if (env > 1) env = 1;
  }

  // --- анализ кадра: цвет + склейки (~120мс) ---
  function sample(now) {
    if (!video.videoWidth || now - lastSample < 120) return;
    lastSample = now;
    camX.drawImage(video, 0, 0, 48, 27);
    const p = camX.getImageData(0, 0, 48, 27).data;
    let l = 0; const buckets = new Array(12).fill(0);
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dv = mx - mn, s = mx ? dv / mx : 0;
      l += (r + g + b) / 3;
      if (s >= .16 && mx >= .1) buckets[Math.floor(((Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180 / Math.PI + 360) % 360) / 30)] += s;
    }
    l /= 1296;
    const mb = Math.max(...buckets);
    if (mb) targetHue = (buckets.indexOf(mb) * 30 + 15) % 360;
    hue = (hue + ang(hue, targetHue) * .07 + 360) % 360;
    const jump = lastLuma && Math.abs(l - lastLuma) > 22;
    const hueJump = mb && Math.abs(ang(prevTarget, targetHue)) > 55;
    prevTarget = targetHue;
    if ((jump || hueJump) && now - cutAt > 800) {
      cutAt = now;
      wipe.style.background = `linear-gradient(180deg, transparent 0%, ${hslC(hue)} 50%, transparent 100%)`;
      wipe.style.opacity = '.28';
      setTimeout(() => { wipe.style.opacity = '0'; }, 350);
    }
    prevPix = p; lastLuma = l;
  }

  // --- цикл ---
  function draw(now) {
    requestAnimationFrame(draw);
    const t = video.currentTime;
    if (running && !video.paused) fireDue(t);
    kick *= .82; env *= .997;
    const rgb = rgbOf(hue), k = kick;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    sample(now);
    // ambient: дышит с битом и яркостью секции
    const amb = .045 + env * .05 + k * .14;
    let g = ctx.createRadialGradient(innerWidth * .72, innerHeight * .9, 0, innerWidth * .72, innerHeight * .9, innerWidth * .7);
    g.addColorStop(0, `rgba(${rgb},${amb})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, innerWidth, innerHeight);
    g = ctx.createRadialGradient(innerWidth * .3, innerHeight * .12, 0, innerWidth * .3, innerHeight * .12, innerWidth * .45);
    g.addColorStop(0, `rgba(${rgbOf((hue + 45) % 360)},${amb * .55})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, innerWidth, innerHeight);
    // кольца (только даунбиты)
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.r += r.w * 1.1; r.a -= .0065;
      ctx.strokeStyle = `rgba(${rgb},${clamp(r.a, 0, 1)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.283); ctx.stroke();
      if (r.a <= 0) rings.splice(i, 1);
    }
    // искры
    ctx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.x += s.vx * 1; s.y += s.vy * 1; s.vy += .05; s.life -= .018;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(${rgb},${s.life * .8})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.s * s.life, 0, 6.283); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // видео-пульс: мягкий «вдох» в ритм + кик на даунбите
    const sp = k * 6;
    video.style.filter = `saturate(${1 + k * .14}) brightness(${1 + k * .08}) drop-shadow(${sp}px 0 0 rgba(255,70,140,.5)) drop-shadow(${-sp}px 0 0 rgba(70,225,255,.45))`;
    video.style.transform = `scale(${1.06 + k * .012})`;
    // заголовок: лёгкое покачивание в такт
    if (!reduced && running && title.classList.contains('live')) {
      const ph = (t % (60 / 166.7)) / (60 / 166.7);
      const sway = Math.sin(ph * 6.283) * 1.6 * (0.5 + env);
      [...title.children].forEach((el, i) => { el.style.transform = `translateY(${sway * .4}px) rotate(${sway * (i % 2 ? .5 : -.5) * .3}deg)`; });
    }
    document.documentElement.style.setProperty('--acc', hslC(hue));
  }
  requestAnimationFrame(draw);
})();
