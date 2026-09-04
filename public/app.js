/* СПРЕД v7 — дропы/разгоны + снаппи-попы в такт по бит-гриду песни */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const video = $('#dance'), mirror = $('#mirror'), box = $('.stagebox');
  const fx = $('#fx'), ctx = fx.getContext('2d');
  const gate = $('#gate'), title = $('#title'), band = $('.band');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = 5; // букв в нике

  let TL = null, bi = 0, lastT = -1;
  let dropSet = null, downSet = null;
  let running = false, hue = 330, targetHue = 330, prevTarget = 330;
  let kick = 0, punchK = 0, flashK = 0, env = 0;
  let ramp = 0, hot = 0;               // разгон (0..1) и посвечение после дропа
  let lastSample = 0, lastLuma = 0, prevPix = null, lastCut = -9;
  let audio = null;
  const sparks = [], waves = [];
  const popT = new Array(L).fill(-9), popA = new Array(L).fill(0);
  const cam = document.createElement('canvas'); cam.width = 48; cam.height = 27;
  const camX = cam.getContext('2d', { willReadFrequently: true });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const ang = (a, b) => ((b - a + 540) % 360) - 180;
  const hslS = (h, a = 1) => `hsla(${h}, 95%, 64%, ${a})`;
  const rgbOf = h => { const c = .95 * .64, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = .64 - c / 2, q = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]; return q.map(v => Math.round((v + m) * 255)); };
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;

  function resize() { const d = Math.min(devicePixelRatio || 1, 2); fx.width = innerWidth * d; fx.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  addEventListener('resize', resize); resize();

  fetch('assets/timeline.json').then(r => r.json()).then(t => {
    TL = t; downSet = new Set(t.downs); dropSet = new Set(t.drops);
    console.log('timeline', t.bpm, 'bpm /', t.count, 'beats / drops', t.drops.length);
  }).catch(() => {});

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

  // ---- удар по сетке песни ----
  function fireBeat(idx, bt, p) {
    const down = downSet.has(idx), drop = dropSet.has(idx);
    // фаза в структуре: разгон/дроп
    if (TL) {
      let inBuild = false;
      for (const [s, e] of TL.builds) {
        if (idx >= s && idx < e) { ramp = (idx - s) / (e - s); inBuild = true; break; }
      }
      if (!inBuild) ramp = 0;
      if (drop) { ramp = 0; hot = 1; }
    }
    kick = 1;
    if (drop) console.log("DROP@", Math.round(bt*10)/10, "beat", idx);
    const amp = drop ? 1.35 : down ? 1 : .62 * (.4 + p);
    punchK = Math.max(punchK, drop ? 1 : down ? .55 : .25);
    if (reduced || !running) return;
    const b = box.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height * .9;
    // снаппи-попы букв (со стаггером)
    const baseAmp = (drop ? 34 : down ? 17 : 6 + ramp * 9);
    for (let i = 0; i < L; i++) { popA[i] = baseAmp; popT[i] = performance.now() + i * 26; }
    // искры-фонтан из нижней кромки сцены
    const count = drop ? 26 : down ? 10 : Math.round(1 + ramp * 3);
    for (let i = 0; i < count; i++) {
      const ang2 = -Math.PI / 2 + (Math.random() - .5) * 1.7;
      const sp = (drop ? 3 : 1.6) + Math.random() * (drop ? 5 : 3) + hot * 2;
      sparks.push({ x: cx + (Math.random() - .5) * b.width * .8, y: b.bottom - 6, vx: Math.cos(ang2) * sp * 1.2, vy: Math.sin(ang2) * sp, life: 1, s: (drop ? 2.2 : 1.3) + Math.random() * 2, w: (Math.random() < .3) && drop });
    }
    if (drop) {
      flashK = 1;
      waves.push({ x: cx, y: b.top + b.height / 2, r0: b.width * .34, t0: performance.now(), big: 1 });
      waves.push({ x: cx, y: b.top + b.height / 2, r0: b.width * .2, t0: performance.now() - 140, big: 1 });
    } else if (down && ramp > .25) {
      waves.push({ x: cx, y: b.top + b.height / 2, r0: b.width * .22 * (1 + ramp), t0: performance.now(), big: 0 });
    }
    if (drop) hot = 1;
    else hot = Math.max(0, hot - .15);
  }
  function fireDue(t) {
    if (lastT > 0 && t < lastT - .5) bi = 0;
    lastT = t;
    if (!TL || bi >= TL.count) return;
    let n = 0;
    while (bi < TL.count && TL.beats[bi][0] <= t) {
      const [bt, p] = TL.beats[bi];
      if (bt >= .15) fireBeat(bi, bt, p);
      bi++; if (++n > 12) break;
    }
    env = env * .996 + (n ? .05 : 0); if (env > 1) env = 1;
  }

  // ---- цвет кадра + склейки ----
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

  // ---- цикл ----
  function draw(now) {
    requestAnimationFrame(draw);
    const t = video.currentTime;
    if (running && !video.paused) fireDue(t);
    kick *= .8; punchK *= .82; flashK *= .9; hot = Math.max(0, hot - .02); if (ramp > 0 && kick < .05) ramp *= .97;
    const k = kick, rgb = rgbOf(hue);
    const b = box.getBoundingClientRect();

    // свечение сцены: разгон сужает и разогревает, дроп — взрыв
    const glowA = .14 + env * .12 + k * (.5 + hot * .35) + ramp * .14;
    box.style.boxShadow = `0 0 0 1px rgba(255,255,255,.1), 0 0 ${20 + k * (dropK() * 160)}px ${5 + k * 26}px ${hslS(hue, .3 + k * .55)}, 0 ${10 + k * 26}px ${60 + k * 130}px -12px ${hslS((hue + 50) % 360, glowA * .75)}`;
    mirror.style.opacity = String(.2 + k * .2 + hot * .1 + ramp * .06);
    document.documentElement.style.setProperty('--acc', hslS(hue, 1));

    ctx.clearRect(0, 0, innerWidth, innerHeight);
    sample(now);
    if (flashK > .02) {
      const fa = flashK * .2;
      const gg = ctx.createRadialGradient(innerWidth * .5, innerHeight * .55, 0, innerWidth * .5, innerHeight * .55, innerWidth * .8);
      gg.addColorStop(0, `rgba(${rgb},0)`); gg.addColorStop(.45, `rgba(${rgb},${fa})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg; ctx.fillRect(0, 0, innerWidth, innerHeight);
    }
    const pool = .05 + env * .07 + k * .2 + hot * .1;
    let g = ctx.createRadialGradient(b.left + b.width * .5, b.top + b.height * .55, 0, b.left + b.width * .5, b.top + b.height * .55, b.width * 1);
    g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(.5, `rgba(${rgb},${pool * .5})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, innerWidth, innerHeight);
    const tb = title.getBoundingClientRect();
    if (tb.width > 40) {
      const lk = .07 + env * .09 + k * .24 + hot * .14 + ramp * .05;
      const tg = ctx.createRadialGradient(tb.left + tb.width / 2, tb.top + tb.height / 2, 0, tb.left + tb.width / 2, tb.top + tb.height / 2, tb.width * 1.1);
      tg.addColorStop(0, `rgba(${rgb},0)`); tg.addColorStop(.6, `rgba(${rgb},${lk})`); tg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = tg; ctx.fillRect(0, 0, innerWidth, innerHeight);
    }
    // ударные волны
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i]; const pr = (now - w.t0) / (w.big ? 950 : 700);
      if (pr >= 1) { waves.splice(i, 1); continue; }
      const rr = w.r0 + pr * Math.max(innerWidth, innerHeight) * (w.big ? .8 : .5);
      ctx.strokeStyle = `rgba(${rgb},${(w.big ? .55 : .3) * (1 - pr)})`; ctx.lineWidth = (w.big ? 4 : 1.5) + 7 * (1 - pr);
      ctx.strokeRect(b.left - (rr - b.width / 2), b.top - (rr - b.height / 2), rr * 2, rr * 2);
    }
    // искры (только в удары)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.x += s.vx; s.y += s.vy; s.vy += .09; s.vx *= .99; s.life -= .02;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.fillStyle = s.w ? `rgba(255,255,255,${s.life * .95})` : `rgba(${rgb},${s.life * .9})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.s * s.life, 0, 6.283); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    video.style.filter = `brightness(${1 + k * (.05 + hot * .06)}) saturate(${1 + k * .18})`;
    video.style.transform = `scale(${1 + k * .012})`;

    // буквы: только снаппи-попы по ударам (без плавания между ними)
    if (!reduced && running && title.classList.contains('live')) {
      [...title.children].forEach((el, i) => {
        const dt = now - popT[i];
        if (dt >= 0 && dt < 600) {
          const e = Math.exp(-dt / 110);
          const bounce = Math.sin(Math.min(dt / 600, 1) * Math.PI);
          const y = -popA[i] * e * (1 + .3 * (1 - bounce));
          const rot = (i % 2 ? 1 : -1) * popA[i] * .055 * e;
          el.style.transform = `translateY(${y}px) rotate(${rot}deg)`;
        } else el.style.transform = 'translateY(0) rotate(0deg)';
      });
      title.style.filter = punchK > .03 ? `brightness(${1 + punchK * .7}) drop-shadow(0 ${punchK * 4}px ${punchK * 30}px ${hslS(hue, .9)})` : 'none';
    }
  }
  let _dk = 0;
  function dropK() { return Math.max(kick, hot); }
  requestAnimationFrame(draw);
})();
