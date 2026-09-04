/* СПРЕД v8 — аудиореактивная система: полосы, удары, мышь, структура песни, аутро */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const video = $('#dance'), mirror = $('#mirror'), box = $('.stagebox');
  const fx = $('#fx'), ctx = fx.getContext('2d');
  const gate = $('#gate'), title = $('#title'), cd = $('#cd');
  const stage = $('.stage'), layout = $('.layout'), hero = $('.hero');
  const ambient = $('#ambient'), mglow = $('#mglow'), sweep = $('#sweep');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = 5;

  // ===== настраиваемые параметры =====
  const P = {
    shakeMax: 7, kickRot: .35, bassScale: .012, tilt: 6,
    glowK: 1, particlesPerPeak: 5, peakCooldown: 520,
    transIntensity: 1, calmAt: .22, outroSec: 9
  };
  window.SPRED_PARAMS = P;

  let TL = null, bi = 0, lastT = -1, downSet = null, dropSet = null;
  let running = false, hue = 330, targetHue = 330, prevTarget = 330;
  let audio = null, analyser = null, freq = null;
  let env = 0, kick = 0, impact = 0, shakeK = 0, transK = 0;
  let lastSample = 0, lastLuma = 0, prevPix = null, lastCut = -9, cdShow = 0, cdT = -9, bgT = 0;
  let mouse = { x: .5, y: .5, gx: .5, gy: .5 };
  const popT = new Array(L).fill(-9), popA = new Array(L).fill(0);
  const parts = [], waves = [], irises = [];
  const cam = document.createElement('canvas'); cam.width = 48; cam.height = 27;
  const camX = cam.getContext('2d', { willReadFrequently: true });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const ang = (a, b) => ((b - a + 540) % 360) - 180;
  const hslS = (h, a = 1) => `hsla(${h}, 95%, 64%, ${a})`;
  const rgbOf = h => { const c = .95 * .64, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = .64 - c / 2, q = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]; return q.map(v => Math.round((v + m) * 255)); };
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;

  function resize() { const d = Math.min(devicePixelRatio || 1, 2); fx.width = innerWidth * d; fx.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  addEventListener('resize', resize); resize();
  addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth; mouse.y = e.clientY / innerHeight; }, { passive: true });

  fetch('assets/timeline.json').then(r => r.json()).then(t => {
    TL = t; downSet = new Set(t.downs); dropSet = new Set(t.drops);
    const pr = document.querySelector('.progress');
    if (pr) t.drops.forEach(d => { const el = document.createElement('i'); el.className = 'tick'; el.style.left = (t.beats[d][0] / t.duration * 100) + '%'; pr.appendChild(el); });
    console.log('timeline ok', t.bpm, 'bpm / drops', t.drops.length);
  }).catch(() => {});

  // ===== аудио: полосы =====
  const B = { bass: 0, low: 0, mid: 0, high: 0, energy: 0, peak: 0 };
  function initAudio() {
    if (audio) return;
    try {
      audio = new AudioContext();
      const src = audio.createMediaElementSource(video);
      analyser = audio.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = .7;
      src.connect(analyser); analyser.connect(audio.destination);
      freq = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) {}
  }
  function sm(key, v, a) { const c = B[key]; B[key] = v > c ? c + (v - c) * .85 : c + (v - c) * a; }
  function audioBands(now) {
    const ph = TL ? ((video.currentTime % (60 / TL.bpm)) / (60 / TL.bpm)) : .5;
    const beatEnv = Math.max(0, 1 - ph) * (0.4 + env * .8) + kick * .9;
    if (analyser && freq) {
      analyser.getByteFrequencyData(freq);
      const n = freq.length;
      let bsum = 0, lsum = 0, msum = 0, hsum = 0;
      for (let i = 1; i < n; i++) { const v = freq[i] / 255; const k = i / n; if (k < .08) bsum += v; else if (k < .25) lsum += v; else if (k < .6) msum += v; else hsum += v; }
      const nB = Math.max(1, n * .08), nL = Math.max(1, n * .17), nM = Math.max(1, n * .35), nH = Math.max(1, n * .4);
      sm('bass', bsum / nB, .5); sm('low', lsum / nL, .5); sm('mid', msum / nM, .5); sm('high', hsum / nH, .5);
      B.energy = B.energy * .92 + (B.bass * .5 + B.low * .3 + B.mid * .15 + B.high * .05);
      const on = Math.max(0, B.bass - (B.energy * .8));
      B.peak = Math.max(0, on * 2.4);
    } else { // без аудио: ритм из грида
      const m = (beatEnv * .7 + B.energy * .3);
      sm('bass', m, .4); sm('low', m * .8, .5); sm('mid', m * .5, .6); sm('high', m * .25, .7);
      B.energy = B.energy * .9 + m * .1;
      B.peak = Math.max(0, m - B.energy);
    }
    B.energy = clamp(B.energy, 0, 1);
  }

  async function start(muted) {
    initAudio(); video.muted = muted;
    try { if (audio && audio.state === 'suspended') await audio.resume(); await video.play(); await mirror.play(); } catch (e) { console.warn(e); }
    gate.classList.add('is-leaving'); running = true;
    $('#soundLabel').textContent = muted ? 'звук выкл.' : 'звук вкл.';
    setTimeout(() => title.classList.add('live'), 900);
  }
  $('#startSound').addEventListener('click', () => start(false));
  $('#startSilent').addEventListener('click', () => start(true));
  $('#soundBtn').addEventListener('click', async () => { initAudio(); video.muted = !video.muted; if (audio && audio.state === 'suspended') await audio.resume(); $('#soundLabel').textContent = video.muted ? 'звук выкл.' : 'звук вкл.'; });
  $('#playBtn').addEventListener('click', async () => {
    if (video.paused) { initAudio(); if (audio && audio.state === 'suspended') await audio.resume(); await video.play(); await mirror.play(); }
    else { video.pause(); mirror.pause(); }
  });
  video.addEventListener('play', () => { $('#playIcon').textContent = '❚❚'; });
  video.addEventListener('pause', () => { $('#playIcon').textContent = '▶'; });
  video.addEventListener('loadeddata', () => video.classList.add('ready'));
  video.addEventListener('timeupdate', () => {
    const d = video.duration || 175;
    $('#progressBar').style.width = `${video.currentTime / d * 100}%`;
    $('#currentTime').textContent = fmt(video.currentTime);
  });

  // ===== сильные события (дропы/пики) с кулдауном =====
  let lastPeakAt = 0;
  function peakFx(strength, why) {
    const now = performance.now();
    if (now - lastPeakAt < P.peakCooldown && strength < .9) return;
    lastPeakAt = now;
    impact = Math.max(impact, strength);
    shakeK = Math.max(shakeK, strength);
    const b = box.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height * .55;
    // частицы от краёв сцены (немного, по кулдауну)
    const cnt = Math.round(2 + strength * P.particlesPerPeak);
    for (let i = 0; i < cnt; i++) {
      const edge = Math.floor(Math.random() * 4);
      let x, y;
      if (edge === 0) { x = b.left + Math.random() * b.width; y = b.top; }
      else if (edge === 1) { x = b.left + Math.random() * b.width; y = b.bottom; }
      else if (edge === 2) { x = b.left; y = b.top + Math.random() * b.height; }
      else { x = b.right; y = b.top + Math.random() * b.height; }
      const an = Math.atan2(cy - y, cx - x) + (Math.random() - .5) * 1.4;
      const sp = 1.2 + Math.random() * 2.6;
      parts.push({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: 1, kind: Math.random() < .55 ? 0 : (Math.random() < .5 ? 1 : 2), s: 1 + Math.random() * 1.8 });
    }
    // световой скан по рамке
    sweep.classList.remove('on'); void sweep.offsetWidth; sweep.classList.add('on');
    setTimeout(() => sweep.classList.remove('on'), 700);
  }

  // ===== биты по гриду песни =====
  function fireBeat(idx, bt, p) {
    const down = downSet.has(idx), drop = dropSet.has(idx);
    let ramp = 0;
    if (TL) for (const [s, e] of TL.builds) { if (idx >= s && idx < e) { ramp = (idx - s) / (e - s); break; } }
    kick = 1;
    const baseAmp = drop ? 30 : down ? 15 : 4 + ramp * 8;
    for (let i = 0; i < L; i++) { popA[i] = baseAmp; popT[i] = performance.now() + i * 24; }
    if (drop) {
      console.log('DROP@', Math.round(bt * 10) / 10);
      transK = 1; peakFx(1, 'drop');
      waves.push({ x: 0, y: 0, t0: performance.now(), big: 1 });
    } else if (down) {
      peakFx(.5 + ramp * .5, 'down');
      if (ramp > .3) waves.push({ x: 0, y: 0, t0: performance.now(), big: 0 });
    }
    if (TL) {
      const nd = TL.drops.find(dd => dd >= idx);
      if (nd) { const left = nd - idx; if (left >= 1 && left <= 3) { cd.textContent = String(left); cdT = performance.now(); cdShow = 1; } }
    }
  }
  function fireDue(t) {
    if (lastT > 0 && t < lastT - .5) { bi = 0; }
    lastT = t;
    if (!TL || bi >= TL.count) return;
    let n = 0;
    while (bi < TL.count && TL.beats[bi][0] <= t) { const [bt, p] = TL.beats[bi]; if (bt >= .15) fireBeat(bi, bt, p); bi++; if (++n > 12) break; }
    env = env * .996 + (n ? .05 : 0); if (env > 1) env = 1;
  }

  // ===== цвет кадра + склейки =====
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
    hue = (hue + ang(hue, targetHue) * .06 + 360) % 360;
    const jump = lastLuma && Math.abs(l - lastLuma) > 20;
    const hueJump = mb && Math.abs(ang(prevTarget, targetHue)) > 55;
    prevTarget = targetHue;
    if ((jump || hueJump) && now - lastCut > 900) {
      lastCut = now;
      const bb = box.getBoundingClientRect();
      irises.push({ x: bb.left + bb.width / 2, y: bb.top + bb.height / 2, t0: now, hue });
      shakeK = Math.max(shakeK, .35);
    }
    prevPix = p; lastLuma = l;
  }

  // ===== главный цикл =====
  function draw(now) {
    requestAnimationFrame(draw);
    const t = video.currentTime;
    if (running && !video.paused) fireDue(t);
    audioBands(now);
    kick *= .78; impact *= .9; shakeK *= .82; transK *= .9;
    const dur = video.duration || 175;
    const outro = running ? clamp((dur - t) / P.outroSec, 0, 1) : 0;      // 1 в норме → 0 в конце
    const quiet = env < P.calmAt ? env / P.calmAt : 1;                    // затихание на тихих местах
    const act = outro * (0.25 + .75 * quiet);                             // глобальный «калм»
    const k = kick * act, imp = impact * act, shk = shakeK * act;
    const rgb = rgbOf(hue);
    const b = box.getBoundingClientRect();
    mouse.gx += (mouse.x - mouse.gx) * .06; mouse.gy += (mouse.y - mouse.gy) * .06;
    const nowMs = now;

    // ---- фон-аура: дрейф + бас + события ----
    if (nowMs - bgT > 90) {
      bgT = nowMs;
      const a1 = .10 + B.energy * .10 + imp * .12 + transK * .1;
      ambient.style.background = `radial-gradient(55% 55% at 50% 50%, rgba(${rgb},${a1}), transparent 70%)`;
      ambient.style.opacity = String(.5 * (0.4 + act));
      ambient.style.transform = `translate3d(${Math.sin(nowMs * .00012) * 4}%, ${Math.cos(nowMs * .00009) * 3}%, 0) scale(${1 + B.bass * .12 + imp * .18})`;
      mglow.style.background = `radial-gradient(14% 14% at ${mouse.gx * 100}% ${mouse.gy * 100}%, rgba(${rgb},${.10 + B.energy * .06}), transparent 70%)`;
      stage.style.background = `radial-gradient(120% 90% at 50% -10%, rgba(${rgb},${.05 + env * .04}), #05030a 60%)`;
      document.documentElement.style.setProperty('--acc', hslS(hue, 1));
    }

    // ---- сцена: мышь + музыка ----
    const rx = (mouse.gy - .5) * -P.tilt * (1 + .6 * B.energy);
    const ry = (mouse.gx - .5) * P.tilt * (1 + .6 * B.energy);
    const bassScale = 1 + B.bass * P.bassScale * act * .6;
    const rotZ = Math.sin(nowMs * .0011) * .06 + imp * P.kickRot * (Math.random() < .5 ? 1 : -1);
    const floatX = Math.sin(nowMs * .0006) * .12, floatY = Math.cos(nowMs * .00045) * .1;
    const shX = shk > .02 ? (Math.random() - .5) * P.shakeMax * shk : 0;
    const shY = shk > .02 ? (Math.random() - .5) * P.shakeMax * shk : 0;
    box.style.transform = `translate3d(${shX}px, ${shY}px, 0) rotateX(${rx + floatY}deg) rotateY(${ry + floatX}deg) rotateZ(${rotZ}deg) scale(${bassScale})`;
    // тряска экрана (только сильные события)
    if (imp > .15) layout.style.transform = `translate3d(${(Math.random() - .5) * 6 * imp}px, ${(Math.random() - .5) * 5 * imp}px, 0) scale(${1 + transK * .008})`;
    else layout.style.transform = transK > .01 ? `scale(${1 + transK * .008})` : '';

    // ---- свечение/отражение ----
    const glowA = (.13 + B.energy * .12 + k * .3 + imp * .3) * act;
    box.style.boxShadow = `0 0 0 1px rgba(255,255,255,.1), 0 0 ${18 + k * 60 + imp * 120}px ${5 + k * 18 + imp * 26}px ${hslS(hue, (.25 + k * .4 + imp * .4) * act)}, 0 ${8 + imp * 20}px ${50 + k * 90}px -10px ${hslS((hue + 50) % 360, glowA * .6)}`;
    mirror.style.opacity = String((.18 + B.energy * .08 + k * .15 + imp * .12) * act);

    // ---- канвас: волны/частицы/iris/вспышки ----
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    sample(now);
    if (transK > .02) {
      const fa = transK * .18 * act;
      const gg = ctx.createRadialGradient(innerWidth * .5, innerHeight * .55, 0, innerWidth * .5, innerHeight * .55, innerWidth * .8);
      gg.addColorStop(0, `rgba(${rgb},0)`); gg.addColorStop(.45, `rgba(${rgb},${fa})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg; ctx.fillRect(0, 0, innerWidth, innerHeight);
    }
    for (let i = irises.length - 1; i >= 0; i--) {
      const ir = irises[i]; const pr = (now - ir.t0) / 320;
      if (pr >= 1) { irises.splice(i, 1); continue; }
      const rr = Math.max(innerWidth, innerHeight) * (.05 + pr);
      const g2 = ctx.createRadialGradient(ir.x, ir.y, 0, ir.x, ir.y, rr);
      g2.addColorStop(0, `rgba(${rgbOf(ir.hue)},${.14 * (1 - pr)})`); g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(ir.x, ir.y, rr, 0, 6.283); ctx.fill();
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i]; const pr = (now - w.t0) / (w.big ? 900 : 650);
      if (pr >= 1) { waves.splice(i, 1); continue; }
      const rr = b.width * .3 + pr * Math.max(innerWidth, innerHeight) * (w.big ? .75 : .45);
      ctx.strokeStyle = `rgba(${rgb},${(w.big ? .5 : .25) * (1 - pr) * act})`; ctx.lineWidth = (w.big ? 3 : 1.4) + 6 * (1 - pr);
      ctx.strokeRect(b.left - (rr - b.width / 2), b.top - (rr - b.height / 2), rr * 2, rr * 2);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const s = parts[i]; s.x += s.vx; s.y += s.vy; s.vy += .05; s.life -= .022;
      if (s.life <= 0) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = s.life;
      ctx.fillStyle = s.kind === 2 ? '#ffffff' : `rgb(${rgb})`;
      if (s.kind === 0) ctx.fillRect(s.x, s.y, s.s * s.life * 2, s.s * s.life * 2);
      else if (s.kind === 1) { ctx.fillRect(s.x, s.y, s.s * 2.2, 1.2); }
      else { ctx.beginPath(); ctx.arc(s.x, s.y, s.s * s.life, 0, 6.283); ctx.fill(); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // световая лужа под ником
    const tb = title.getBoundingClientRect();
    if (tb.width > 40 && running) {
      const lk = (.05 + B.energy * .08 + k * .16 + imp * .16) * act;
      const tg = ctx.createRadialGradient(tb.left + tb.width / 2, tb.top + tb.height / 2, 0, tb.left + tb.width / 2, tb.top + tb.height / 2, tb.width * 1.1);
      tg.addColorStop(0, `rgba(${rgb},0)`); tg.addColorStop(.6, `rgba(${rgb},${lk})`); tg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = tg; ctx.fillRect(0, 0, innerWidth, innerHeight);
    }
    // отсчёт
    if (cdShow) {
      const cdt = now - cdT;
      if (cdt < 700) {
        const sc = 1 + .22 * Math.sin(Math.min(cdt / 700, 1) * Math.PI);
        cd.style.opacity = String(1 - cdt / 700); cd.style.transform = `translate(-50%,-50%) scale(${sc})`;
        cd.style.color = hslS(hue); cd.style.textShadow = `0 0 44px ${hslS(hue, .85)}`;
      } else { cdShow = 0; cd.style.opacity = '0'; }
    }
    // буквы
    if (!reduced && running && title.classList.contains('live')) {
      const micro = 1 + B.bass * .004 * act;
      [...title.children].forEach((el, i) => {
        const dt = now - popT[i];
        let y = 0, rot = 0;
        if (dt >= 0 && dt < 600) {
          const e = Math.exp(-dt / 105);
          y = -popA[i] * e; rot = popA[i] > 24 ? (i % 2 ? 1 : -1) * e * 1.6 : 0;
        }
        el.style.transform = `scale(${micro}) translateY(${y}px) rotate(${rot}deg)`;
      });
      title.style.filter = impact > .1 ? `brightness(${1 + impact * .5}) drop-shadow(0 0 ${impact * 26}px ${hslS(hue, .9 * act)})` : 'none';
    }
  }
  requestAnimationFrame(draw);
})();
