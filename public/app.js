/* СПРЕД v6 — сцена в темноте: бит-грид + свечение/ударные волны/танец ника */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const video = $('#dance'), mirror = $('#mirror'), box = $('.stagebox');
  const fx = $('#fx'), ctx = fx.getContext('2d');
  const gate = $('#gate'), title = $('#title'), band = $('.band');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let timeline = null, bi = 0, lastT = -1, downSet = null, lastBeatT = 0;
  let running = false, hue = 330, targetHue = 330, prevTarget = 330, beatCount = 0, flashK = 0;
  let kick = 0, punchK = 0, env = 0, lastSample = 0, lastLuma = 0, prevPix = null, lastCut = -9;
  let audio = null;
  const sparks = [], waves = [];
  const cam = document.createElement('canvas'); cam.width = 48; cam.height = 27;
  const camX = cam.getContext('2d', { willReadFrequently: true });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const ang = (a, b) => ((b - a + 540) % 360) - 180;
  const hslS = (h, a = 1) => `hsla(${h}, 95%, 64%, ${a})`;
  const rgbOf = h => { const c = .95 * .64, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = .64 - c / 2, q = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]; return q.map(v => Math.round((v + m) * 255)); };
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;

  function resize() { const d = Math.min(devicePixelRatio || 1, 2); fx.width = innerWidth * d; fx.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  addEventListener('resize', resize); resize();

  fetch('assets/timeline.json').then(r => r.json()).then(t => { timeline = t; downSet = new Set(t.downs); console.log('timeline', t.bpm, 'bpm /', t.count, 'beats'); }).catch(() => {});

  function initAudio() { if (audio) return; try { audio = new AudioContext(); const s = audio.createMediaElementSource(video); s.connect(audio.destination); } catch (e) {} }
  async function start(muted) {
    initAudio(); video.muted = muted;
    try { if (audio && audio.state === 'suspended') await audio.resume(); await video.play(); await mirror.play(); } catch (e) { console.warn(e); }
    gate.classList.add('is-leaving'); running = true;
    $('#soundLabel').textContent = muted ? 'звук выкл.' : 'звук вкл.';
    $('#playIcon').textContent = '❚❚'; $('#playLabel').textContent = 'пауза';
    setTimeout(() => title.classList.add('live'), 900);
  }
  $('#startSound').addEventListener('click', () => start(false));
  $('#startSilent').addEventListener('click', () => start(true));
  $('#soundBtn').addEventListener('click', async () => { initAudio(); video.muted = !video.muted; if (audio && audio.state === 'suspended') await audio.resume(); $('#soundLabel').textContent = video.muted ? 'звук выкл.' : 'звук вкл.'; });
  $('#playBtn').addEventListener('click', async () => {
    if (video.paused) { initAudio(); if (audio && audio.state === 'suspended') await audio.resume(); await video.play(); await mirror.play(); }
    else { video.pause(); mirror.pause(); }
  });
  video.addEventListener('play', () => { $('#playIcon').textContent = '❚❚'; $('#playLabel').textContent = 'пауза'; });
  video.addEventListener('pause', () => { $('#playIcon').textContent = '▶'; $('#playLabel').textContent = 'плей'; });
  video.addEventListener('loadeddata', () => video.classList.add('ready'));
  video.addEventListener('timeupdate', () => {
    const d = video.duration || 175;
    $('#progressBar').style.width = `${video.currentTime / d * 100}%`;
    $('#currentTime').textContent = fmt(video.currentTime); $('#totalTime').textContent = fmt(d);
  });

  // --- биты по гриду песни ---
  function onBeat(p, down) {
    beatCount++; const t = video.currentTime; lastBeatT = t;
    kick = down ? 1 : Math.max(kick, .62 * (.45 + p));
    if (down && beatCount % 8 === 0) flashK = 1;   // акцент каждые 2 такта
    if (reduced || !running) return;
    const b = box.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    if (down) {
      punchK = 1;
      waves.push({ x: cx, y: cy, r0: Math.max(b.width, b.height) * .42, t0: performance.now() });
      const n = 14;
      for (let i = 0; i < n; i++) {
        const an = Math.random() * 6.283, sp = 2 + Math.random() * 4.5;
        sparks.push({ x: b.left + Math.random() * b.width, y: b.top + b.height * (Math.random() < .5 ? 0 : 1), vx: Math.cos(an) * sp, vy: -1.2 - Math.random() * 3, life: 1, s: 1.6 + Math.random() * 2.2 });
      }
    } else {
      for (let i = 0; i < 3; i++) sparks.push({ x: b.left + Math.random() * b.width, y: b.top + b.height * .5 + (Math.random() - .5) * b.height, vx: (Math.random() - .5) * 2.2, vy: -.8 - Math.random() * 2, life: 1, s: 1 + Math.random() * 1.6 });
    }
  }
  function fireDue(t) {
    if (lastT > 0 && t < lastT - .5) bi = 0;   // перемотка/луп
    lastT = t;
    if (!timeline || bi >= timeline.count) return;
    let n = 0;
    while (bi < timeline.count && timeline.beats[bi][0] <= t) {
      const [bt, p] = timeline.beats[bi];
      if (bt >= .15) onBeat(p, downSet && downSet.has(bi));
      bi++; if (++n > 10) break;
    }
    env = env * .996 + (n ? .045 : 0); if (env > 1) env = 1;
  }

  // --- цвет кадра + склейки ---
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
    const jump = lastLuma && Math.abs(l - lastLuma) > 20;
    const hueJump = mb && Math.abs(ang(prevTarget, targetHue)) > 55;
    prevTarget = targetHue;
    if ((jump || hueJump) && now - lastCut > 900) {
      lastCut = now;
      band.style.color = hslS(hue); band.style.background = hslS(hue);
      band.classList.remove('run'); void band.offsetWidth; band.classList.add('run');
    }
    prevPix = p; lastLuma = l;
  }

  // --- цикл ---
  function draw(now) {
    requestAnimationFrame(draw);
    const t = video.currentTime;
    if (running && !video.paused) fireDue(t);
    kick *= .84; punchK *= .86; env *= .997;
    const k = kick, rgb = rgbOf(hue);
    const b = box.getBoundingClientRect();
    // свечение сцены (перелив в цвет кадра) — главный эффект
    const glowA = .16 + env * .1 + k * .55;
    box.style.boxShadow = `0 0 0 1px rgba(255,255,255,.1), 0 0 ${30 + k * 90}px ${6 + k * 26}px ${hslS(hue, .35 + k * .5)}, 0 ${10 + k * 30}px ${70 + k * 130}px -12px ${hslS((hue + 50) % 360, glowA * .8)}`;
    mirror.style.opacity = String(.22 + k * .16 + env * .08);
    document.documentElement.style.setProperty('--acc', hslS(hue, 1));

    ctx.clearRect(0, 0, innerWidth, innerHeight);
    sample(now);
    if (flashK > .02) { const fa = flashK * .16; let gg = ctx.createRadialGradient(innerWidth*.5, innerHeight*.55, 0, innerWidth*.5, innerHeight*.55, innerWidth*.75); gg.addColorStop(0, `rgba(${rgb},0)`); gg.addColorStop(.5, `rgba(${rgb},${fa})`); gg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gg; ctx.fillRect(0,0,innerWidth,innerHeight); } flashK *= .9;
    // световые «лужи» вокруг сцены
    const pool = .05 + env * .06 + k * .16;
    let g = ctx.createRadialGradient(b.left + b.width * .5, b.top + b.height * .5, 0, b.left + b.width * .5, b.top + b.height * .5, b.width * .95);
    g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(.55, `rgba(${rgb},${pool * .5})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, innerWidth, innerHeight);
    const tb = title.getBoundingClientRect();
    if (tb.width > 40) {
      const lk = .06 + env * .08 + k * .2 + punchK * .18;
      let tg = ctx.createRadialGradient(tb.left + tb.width / 2, tb.top + tb.height / 2, 0, tb.left + tb.width / 2, tb.top + tb.height / 2, tb.width * 1.05);
      tg.addColorStop(0, `rgba(${rgb},0)`); tg.addColorStop(.62, `rgba(${rgb},${lk})`); tg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = tg; ctx.fillRect(0, 0, innerWidth, innerHeight);
    }
    // ударные волны от сцены (даунбиты)
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i]; const pr = (now - w.t0) / 900;
      if (pr >= 1) { waves.splice(i, 1); continue; }
      const rr = w.r0 + pr * Math.max(innerWidth, innerHeight) * .55;
      ctx.strokeStyle = `rgba(${rgb},${.5 * (1 - pr)})`; ctx.lineWidth = 2 + 6 * (1 - pr);
      ctx.strokeRect(b.left - (rr - b.width / 2), b.top - (rr - b.height / 2), rr * 2, rr * 2);
    }
    // искры
    ctx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.x += s.vx; s.y += s.vy; s.vy += .06; s.life -= .016;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(${rgb},${s.life * .85})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.s * s.life, 0, 6.283); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // видео-пульс
    video.style.filter = `brightness(${1 + k * .07}) saturate(${1 + k * .12})`;
    video.style.transform = `scale(${1 + k * .008})`;
    // ник танцует: покачивание в такт + панч-прыжок на даунбитах
    if (!reduced && running && title.classList.contains('live')) {
      const bpm = timeline ? timeline.bpm : 166.7, bp = 60 / bpm;
      const ph = (t - lastBeatT) / bp;
      const sway = Math.sin(ph * 6.283) * (5 + env * 3);
      const lift = punchK * 20;
      [...title.children].forEach((el, i) => {
        const wave = Math.sin(ph * 6.283 + i * 1.05) * 3.4;
        const rot = sway * (i % 2 ? .8 : -.8) * .22 + punchK * (i % 2 ? 3.2 : -3.2);
        el.style.transform = `translateY(${-lift + sway * .5 + wave}px) rotate(${rot}deg)`;
      });
      title.style.filter = punchK > .04 ? `brightness(${1 + punchK * .8}) drop-shadow(0 ${punchK * 6}px ${punchK * 40}px ${hslS(hue, .95)})` : 'none';
    }
  }
  requestAnimationFrame(draw);
})();
