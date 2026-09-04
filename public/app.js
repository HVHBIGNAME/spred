/* СПРЕД v8.1 — честный цвет, звёзды-дорисовка, боб в такт танцу, работа без звука */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const video = $('#dance'), mirror = $('#mirror'), box = $('.stagebox');
  const fx = $('#fx'), ctx = fx.getContext('2d');
  const gate = $('#gate'), title = $('#title'), cd = $('#cd');
  const stage = $('.stage'), layout = $('.layout');
  const ambient = $('#ambient'), mglow = $('#mglow'), sweep = $('#sweep');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = 5;

  const P = {
    shakeMax: 7, kickRot: .35, bassScale: .014, tilt: 6,
    particlesPerPeak: 6, peakCooldown: 460, transIntensity: 1,
    calmAt: .22, outroSec: 9, bobAmp: 2.4
  };
  window.SPRED_PARAMS = P;

  let TL = null, bi = 0, lastT = -1, downSet = null, dropSet = null;
  let running = false, hue = 330, targetHue = 330, prevTarget = 330;
  let avgCol = [255, 62, 200];
  let audio = null, analyser = null, freq = null, audioDead = false, silenceSince = 0;
  let env = 0, kick = 0, impact = 0, shakeK = 0, transK = 0, flashK = 0, lastRms = .3;
  let mMotion = 0, danceS = 0, scatT = -9, scatA = 40;
  let lastSample = 0, lastLuma = 0, lSlow = 0, lastFlash = -Infinity, prevPix = null, lastCut = -9, cdShow = 0, cdT = -9, bgT = 0;
  let mouse = { x: .5, y: .5, gx: .5, gy: .5 };
  const popT = new Array(L).fill(-9), popA = new Array(L).fill(0);
  const parts = [], waves = [], irises = [], stars = [];
  const cam = document.createElement('canvas'); cam.width = 64; cam.height = 36;
  const camX = cam.getContext('2d', { willReadFrequently: true });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const ang = (a, b) => ((b - a + 540) % 360) - 180;
  const hslS = (h, a = 1) => `hsla(${h}, 95%, 64%, ${a})`;
  const rgbOf = h => { const c = .95 * .64, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = .64 - c / 2, q = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]; return q.map(v => Math.round((v + m) * 255)); };
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;

  function resize() {
    const d = Math.min(devicePixelRatio || 1, 2);
    fx.width = innerWidth * d; fx.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    stars.length = 0;
    const n = innerWidth < 700 ? 14 : 30;
    for (let i = 0; i < n; i++) stars.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: .5 + Math.random() * 1.7, v: .08 + Math.random() * .3, p: Math.random() * 6.28, big: Math.random() < .22 });
  }
  addEventListener('resize', resize); resize();
  addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth; mouse.y = e.clientY / innerHeight; }, { passive: true });

  fetch('assets/timeline.json').then(r => r.json()).then(t => {
    TL = t; downSet = new Set(t.downs); dropSet = new Set(t.drops);
    const pr = document.querySelector('.progress');
    if (pr) t.drops.forEach(d => { const el = document.createElement('i'); el.className = 'tick'; el.style.left = (t.beats[d][0] / t.duration * 100) + '%'; pr.appendChild(el); });
    console.log('timeline ok', t.bpm, 'bpm / drops', t.drops.length);
  }).catch(() => {});

  const B = { bass: 0, low: 0, mid: 0, high: 0, energy: 0 };
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
  function audioBands(now) {
    const bp = TL ? (60 / TL.bpm) : .36;
    const ph = (video.currentTime % bp) / bp;
    const beatEnv = Math.max(0, 1 - ph) * (.4 + env * .8) + kick * .9;
    let live = false;
    if (analyser && freq) {
      analyser.getByteFrequencyData(freq);
      let mx = 0; for (let i = 2; i < freq.length; i += 4) mx = Math.max(mx, freq[i]);
      if (mx < 7) { if (!audioDead && performance.now() - silenceSince > 1400) audioDead = true; }
      else { audioDead = false; silenceSince = now; live = true; }
    }
    if (live) {
      const n = freq.length;
      let bsum = 0, lsum = 0, msum = 0, hsum = 0;
      for (let i = 1; i < n; i++) { const v = freq[i] / 255; const k = i / n; if (k < .08) bsum += v; else if (k < .25) lsum += v; else if (k < .6) msum += v; else hsum += v; }
      const nB = Math.max(1, n * .08), nL = Math.max(1, n * .17), nM = Math.max(1, n * .35), nH = Math.max(1, n * .4);
      const tB = bsum / nB, tL = lsum / nL, tM = msum / nM, tH = hsum / nH;
      B.bass += (tB - B.bass) * (tB > B.bass ? .8 : .3);
      B.low += (tL - B.low) * .4; B.mid += (tM - B.mid) * .4; B.high += (tH - B.high) * .45;
      B.energy = B.energy * .9 + Math.max(B.bass * .5 + B.low * .3 + B.mid * .15 + B.high * .05, 0) * .1;
    } else {
      // синтез от бит-грида + реальная громкость доли (rms) — эффекты живут и без звука
      const m = beatEnv * (.45 + lastRms * .9);
      B.bass += (m - B.bass) * .7; B.low += (m * .9 - B.low) * .6;
      B.mid += (m * .55 - B.mid) * .5; B.high += (m * .22 - B.high) * .5;
      B.energy = B.energy * .9 + m * .1;
    }
    B.energy = clamp(B.energy, 0, 1);
  }

  // ===== перелёт ника из центра на своё место =====
  // Причина фикса: CSS-transition на h1 стартует от ИСХОДНОГО (identity) значения,
  // а сброс inline через rAF ловится тем же кадром — переход запускается «из дома в дом»
  // (см. отчёт: computed оставался identity и только через 120мс сдвигался НАЗАД).
  // WAAPI даёт независимую от transition-состояния анимацию с гарантированным стартом.
  let flyAnim = null;
  function flyTitle() {
    const hc = title.getBoundingClientRect();
    const offX = innerWidth / 2 - (hc.left + hc.width / 2);
    const offY = innerHeight * .46 - (hc.top + hc.height / 2);
    title.style.transform = '';
    if (flyAnim) { try { flyAnim.cancel(); } catch (e) {} }
    if (reduced) return;
    flyAnim = title.animate(
      [
        { transform: `translate(${offX}px, ${offY}px) scale(.93)`, offset: 0 },
        { transform: 'translate(0px, 0px) scale(1)', offset: 1 }
      ],
      { duration: 1000, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'none', composite: 'replace' }
    );
    flyAnim.onfinish = () => { title.style.transform = ''; flyAnim = null; };
    flyAnim.oncancel = () => { title.style.transform = ''; };
  }

  async function start(muted) {
    // отсчёт 3·2·1 на тёмном фоне (интерфейс скрыт) → видео плавно проявляется, ник едет из центра вправо
    initAudio();
    try { if (audio && audio.state === 'suspended') await audio.resume(); } catch (e) {}
    gate.classList.add('is-leaving'); running = true;
    $('#soundLabel').textContent = muted ? 'звук выкл.' : 'звук вкл.';
    video.pause(); video.classList.remove('on'); mirror.classList.remove('on');
    document.body.classList.add('cd');
    const seq = [3, 2, 1];
    let i = 0;
    const step = () => {
      if (i < seq.length) {
        cd.textContent = String(seq[i]);
        cdShow = 1; cdT = performance.now();
        i++;
        setTimeout(step, 820);
      } else {
        cdShow = 0; cd.style.opacity = '0';
        title.style.opacity = '1';
        document.body.classList.remove('cd');
        title.classList.add('live');
        // ник стартует из центра и уезжает на своё место справа (WAAPI, см. flyTitle)
        flyTitle();
        // видео стартует и плавно проявляется
        video.muted = muted; mirror.muted = true;
        video.currentTime = 0;
        try { video.play(); mirror.play(); } catch (e) { console.warn(e); }
      }
    };
    setTimeout(step, 500);
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
  video.addEventListener('playing', () => { video.classList.add('on'); mirror.classList.add('on'); });
  video.addEventListener('timeupdate', () => {
    const d = video.duration || 175;
    $('#progressBar').style.width = `${video.currentTime / d * 100}%`;
    $('#currentTime').textContent = fmt(video.currentTime);
  });
  video.addEventListener('ended', () => {
    running = false;
    video.pause(); mirror.pause();
    document.body.classList.add('ended');
    title.classList.remove('live');
    $('#restartBtn').focus();
  });
  $('#restartBtn').addEventListener('click', async () => {
    document.body.classList.remove('ended');
    title.classList.add('live');
    [...title.children].forEach(el => { el.style.transform = ''; el.style.opacity = ''; el.style.filter = ''; });
    video.currentTime = 0; mirror.currentTime = 0; bi = 0; lastT = -1; running = true;
    initAudio();
    try { if (audio && audio.state === 'suspended') await audio.resume(); await video.play(); await mirror.play(); } catch (e) {}
  });

  let lastPeakAt = 0;
  function spawnParts(b, strength) {
    const cnt = Math.round(2 + strength * P.particlesPerPeak);
    const cx = b.left + b.width / 2, cy = b.top + b.height * .55;
    for (let i = 0; i < cnt; i++) {
      const edge = Math.floor(Math.random() * 4);
      let x, y;
      if (edge === 0) { x = b.left + Math.random() * b.width; y = b.top; }
      else if (edge === 1) { x = b.left + Math.random() * b.width; y = b.bottom; }
      else if (edge === 2) { x = b.left; y = b.top + Math.random() * b.height; }
      else { x = b.right; y = b.top + Math.random() * b.height; }
      const an = Math.atan2(cy - y, cx - x) + (Math.random() - .5) * 1.5;
      const sp = 1.4 + Math.random() * 3;
      parts.push({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: 1, kind: Math.random() < .5 ? 0 : (Math.random() < .5 ? 1 : 2), s: 1 + Math.random() * 2 });
    }
  }
  function peakFx(strength) {
    const now = performance.now();
    if (now - lastPeakAt < P.peakCooldown && strength < .85) return;
    lastPeakAt = now;
    impact = Math.max(impact, strength); shakeK = Math.max(shakeK, strength);
    const b = box.getBoundingClientRect();
    spawnParts(b, strength);
    sweep.classList.remove('on'); void sweep.offsetWidth; sweep.classList.add('on');
    setTimeout(() => sweep.classList.remove('on'), 700);
  }

  function fireBeat(idx, bt, p) {
    if (TL && TL.rms && TL.rms[idx] !== undefined) lastRms = TL.rms[idx];
    const down = downSet.has(idx), drop = dropSet.has(idx);
    let ramp = 0;
    if (TL) for (const [s, e] of TL.builds) { if (idx >= s && idx < e) { ramp = (idx - s) / (e - s); break; } }
    const dur = video.duration || (TL && TL.duration) || 175;
    const loud = lastRms;
    const silent = TL && loud < .16;
    const tailEnd = dur && bt > dur - 22;
    kick = drop ? 1 : clamp(.2 + loud, 0, 1);
    const strength = clamp(.45 + lastRms * .6 + ramp * .25, 0, 1);
    const baseAmp = drop ? 30 : (tailEnd ? 0 : down ? (loud > .25 ? 15 : (loud >= .12 ? 6 : 0)) : (loud > .25 ? 4 + ramp * 8 : 0));
    for (let i = 0; i < L; i++) { popA[i] = baseAmp; popT[i] = performance.now() + i * 24; }
    if (drop) {
      console.log('DROP@', Math.round(bt * 10) / 10);
      transK = 1; peakFx(1); scatT = performance.now(); scatA = 34 + lastRms * 30;
      waves.push({ x: 0, y: 0, t0: performance.now(), big: 1 });
    } else if (down) {
      peakFx(.55 * strength + ramp * .3);
      if (strength > .4 || ramp > .4) waves.push({ x: 0, y: 0, t0: performance.now(), big: 0 });
    } else if (strength > .8) {
      peakFx(.4);
    }
  }
  function fireDue(t) {
    if (lastT > 0 && t < lastT - .5) bi = 0;
    lastT = t;
    if (!TL || bi >= TL.count) return;
    let n = 0;
    while (bi < TL.count && TL.beats[bi][0] <= t) { const [bt] = TL.beats[bi]; if (bt >= .15) fireBeat(bi, bt, 0); bi++; if (++n > 12) break; }
    env = env * .996 + (n ? .05 : 0); if (env > 1) env = 1;
  }

  // ===== цвет кадра: 24 бакета + средний цвет (честно) =====
  function sample(now) {
    if (!video.videoWidth || now - lastSample < 110) return;
    lastSample = now;
    camX.drawImage(video, 0, 0, 64, 36);
    const p = camX.getImageData(0, 0, 64, 36).data;
    const buckets = new Array(24).fill(0);
    let l = 0, sr = 0, sg = 0, sb = 0, sn = 0;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dv = mx - mn;
      const luma = (r + g + b) / 3; l += luma;
      if (luma > .06) { sr += r; sg += g; sb += b; sn++; }
      const s = mx ? dv / mx : 0;
      if (s >= .14 && mx >= .12) {
        let hu = Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180 / Math.PI;
        if (hu < 0) hu += 360;
        buckets[Math.floor(hu / 15) % 24] += s * (.3 + s);
      }
    }
    l /= 2304;
    lSlow += (l - lSlow) * .06;
    if (l > .72 && l - lSlow > .22 && now - lastFlash > 1600) {
      flashK = 1; lastFlash = now; shakeK = Math.max(shakeK, .12);
    }
    if (sn) { avgCol = [sr / sn * 255, sg / sn * 255, sb / sn * 255]; }
    if (prevPix) {
      let d = 0;
      for (let i = 0; i < p.length; i += 4) {
        d += Math.abs(p[i] - prevPix[i]) + Math.abs(p[i + 1] - prevPix[i + 1]) + Math.abs(p[i + 2] - prevPix[i + 2]);
      }
      mMotion += ((d / (2304 * 765)) - mMotion) * .45;
    }
    let best = -1, bv = 0;
    for (let i = 0; i < 24; i++) if (buckets[i] > bv) { bv = buckets[i]; best = i; }
    if (best >= 0) {
      const winHue = (best * 15 + 7.5) % 360;
      // защита от «ложного» доминанта (мелкий яркий объект): сверяем со средним цветом кадра
      const ar = avgCol[0] / 255, ag = avgCol[1] / 255, ab = avgCol[2] / 255;
      const amx = Math.max(ar, ag, ab), amn = Math.min(ar, ag, ab);
      const aSat = amx ? (amx - amn) / amx : 0;
      let aHue = winHue;
      if (amx - amn > .03) {
        let h2 = Math.atan2(Math.sqrt(3) * (ag - ab), 2 * ar - ag - ab) * 180 / Math.PI;
        if (h2 < 0) h2 += 360;
        aHue = h2;
      }
      if (aSat >= .1 && Math.abs(ang(winHue, aHue)) > 80 && Math.abs(ang(winHue, aHue)) < 280) targetHue = aHue;
      else targetHue = winHue;
    }
    hue = (hue + ang(hue, targetHue) * .1 + 360) % 360;
    const jump = lastLuma && Math.abs(l - lastLuma) > 20;
    const hueJump = best >= 0 && Math.abs(ang(prevTarget, targetHue)) > 48;
    prevTarget = targetHue;
    if ((jump || hueJump) && now - lastCut > 900) {
      lastCut = now;
      const bb = box.getBoundingClientRect();
      irises.push({ x: bb.left + bb.width / 2, y: bb.top + bb.height / 2, t0: now, hue });
      shakeK = Math.max(shakeK, .3);
    }
    prevPix = p; lastLuma = l;
  }

  function draw(now) {
    requestAnimationFrame(draw);
    const t = video.currentTime;
    if (running && !video.paused) fireDue(t);
    audioBands(now);
    kick *= .78; impact *= .9; shakeK *= .82; transK *= .9; flashK *= .82;
    const dur = video.duration || 175;
    const outro = running ? clamp((dur - t) / P.outroSec, 0, 1) : 0;
    const quiet = env < P.calmAt ? env / P.calmAt : 1;
    const act = outro * (0.28 + .72 * quiet);
    const k = kick * act, imp = impact * act, shk = shakeK * act;
    const hueRgb = rgbOf(hue);
    const avg = avgCol.map(v => Math.round(v));
    const b = box.getBoundingClientRect();
    mouse.gx += (mouse.x - mouse.gx) * .06; mouse.gy += (mouse.y - mouse.gy) * .06;

    // фон: реальный средний цвет кадра + акцент
    if (now - bgT > 90) {
      bgT = now;
      ambient.style.background = `radial-gradient(55% 55% at 50% 50%, rgba(${avg},${.07 + B.energy * .06 + imp * .06 + transK * .05 + flashK * .5}), transparent 70%)`;
      ambient.style.opacity = String(.35 * (0.4 + act));
      ambient.style.transform = `translate3d(${Math.sin(now * .00012) * 4}%, ${Math.cos(now * .00009) * 3}%, 0) scale(${1 + B.bass * .12 + imp * .18})`;
      mglow.style.background = `radial-gradient(13% 13% at ${mouse.gx * 100}% ${mouse.gy * 100}%, rgba(${hueRgb},${.05 + B.energy * .03}), transparent 70%)`;
      stage.style.background = `radial-gradient(120% 90% at 50% -10%, rgba(${avg},${.025 + env * .02}), #010104 60%)`;
      document.documentElement.style.setProperty('--acc', hslS(hue, 1));
    }

    // боб сцены в такт танцу (вверх-вниз) + тряска + наклон мыши + 3D
    const bp = TL ? (60 / TL.bpm) : .36;
    const ph = (t % bp) / bp;
    const bobY = Math.sin(ph * 6.283) * P.bobAmp * act + (k > .05 ? -k * 1.4 : 0);
    const rx = (mouse.gy - .5) * -P.tilt * (1 + .5 * B.energy);
    const ry = (mouse.gx - .5) * P.tilt * (1 + .5 * B.energy);
    const bassScale = 1 + B.bass * P.bassScale * act * .7;
    const rotZ = Math.sin(now * .0011) * .05 + imp * P.kickRot * (Math.sin(now * .01) > 0 ? 1 : -1);
    const floatX = Math.sin(now * .0006) * .12, floatY = Math.cos(now * .00045) * .1;
    // «девочки пляшут так, что экран трясётся»: амплитуда от реального движения кадра
    const dance = clamp((mMotion - .14) * 7, 0, 1) * act;
    danceS += (dance - danceS) * (dance > danceS ? .25 : .02);
    const shBase = P.shakeMax * shk + danceS * 2;
    const shX = shBase > .15 ? (Math.random() - .5) * shBase : 0;
    const shY = shBase > .15 ? (Math.random() - .5) * shBase : 0;
    const rotJ = danceS > .8 ? (Math.random() - .5) * .15 : 0;
    box.style.transform = `translate3d(${shX}px, ${shY + bobY}px, 0) rotateX(${rx + floatY}deg) rotateY(${ry + floatX}deg) rotateZ(${rotZ + rotJ}deg) scale(${bassScale})`;
    const screenShake = imp * 6 + flashK * 2;
    if (screenShake > .4) layout.style.transform = `translate3d(${(Math.random() - .5) * screenShake}px, ${(Math.random() - .5) * screenShake * .8}px, 0) scale(${1 + transK * .008 + flashK * .006})`;
    else layout.style.transform = transK > .01 || flashK > .01 ? `scale(${1 + transK * .008 + flashK * .006})` : '';

    const glowA = (.08 + B.energy * .07 + k * .2 + imp * .2 + flashK * .5) * act;
    box.style.boxShadow = `0 0 ${flashK * 70}px ${flashK * 20}px rgba(255,255,255,${flashK * .55 * act}), 0 0 0 1px rgba(255,255,255,.1), 0 0 ${14 + k * 42 + imp * 90}px ${4 + k * 12 + imp * 18}px ${hslS(hue, (.18 + k * .28 + imp * .28) * act)}, 0 ${6 + imp * 14}px ${38 + k * 62}px -10px rgba(${avg},${glowA * .5})`;
    mirror.style.opacity = String((.18 + B.energy * .08 + k * .15 + imp * .12) * act);

    ctx.clearRect(0, 0, innerWidth, innerHeight);
    sample(now);
    // звёздный слой (дорисовка звёзд как в PV)
    for (const s of stars) {
      s.y -= s.v * (1 + B.energy * 2); if (s.y < -8) { s.y = innerHeight + 8; s.x = Math.random() * innerWidth; }
      const tw = .3 + .7 * Math.abs(Math.sin(now * .001 + s.p));
      ctx.globalAlpha = tw * (.35 + B.energy * .3) * act;
      if (s.big) {
        ctx.strokeStyle = `rgba(255,255,255,${tw * .7})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const r = s.r * 3.2;
        for (let i = 0; i < 8; i++) { const rad = i % 2 ? r * .32 : r; const a2 = s.p + i * Math.PI / 4; ctx.lineTo(s.x + Math.cos(a2) * rad, s.y + Math.sin(a2) * rad); }
        ctx.closePath(); ctx.stroke();
        ctx.fillStyle = `rgba(${hueRgb},${tw * .1})`; ctx.fill();
      } else {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * tw, 0, 6.283); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (transK > .02) {
      const fa = transK * .16 * act;
      const gg = ctx.createRadialGradient(innerWidth * .5, innerHeight * .55, 0, innerWidth * .5, innerHeight * .55, innerWidth * .8);
      gg.addColorStop(0, `rgba(${avg},0)`); gg.addColorStop(.5, `rgba(${avg},${fa})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
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
      ctx.strokeStyle = `rgba(${hueRgb},${(w.big ? .5 : .25) * (1 - pr) * act})`; ctx.lineWidth = (w.big ? 3 : 1.4) + 6 * (1 - pr);
      ctx.strokeRect(b.left - (rr - b.width / 2), b.top - (rr - b.height / 2), rr * 2, rr * 2);
    }
    if (flashK > .02) {
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.width * (.35 + (1 - flashK) * 1.1));
      fg.addColorStop(0, `rgba(255,255,255,${flashK * .4 * act})`);
      fg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = fg; ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const s = parts[i]; s.x += s.vx; s.y += s.vy; s.vy += .05; s.life -= .022;
      if (s.life <= 0) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = s.life;
      ctx.fillStyle = s.kind === 2 ? '#ffffff' : `rgb(${hueRgb})`;
      if (s.kind === 0) ctx.fillRect(s.x, s.y, s.s * s.life * 2, s.s * s.life * 2);
      else if (s.kind === 1) ctx.fillRect(s.x, s.y, s.s * 2.2, 1.2);
      else { ctx.beginPath(); ctx.arc(s.x, s.y, s.s * s.life, 0, 6.283); ctx.fill(); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    const tb = title.getBoundingClientRect();
    if (tb.width > 40 && running) {
      const lk = (.05 + B.energy * .08 + k * .16 + imp * .16) * act;
      const tg = ctx.createRadialGradient(tb.left + tb.width / 2, tb.top + tb.height / 2, 0, tb.left + tb.width / 2, tb.top + tb.height / 2, tb.width * 1.1);
      tg.addColorStop(0, `rgba(${avg},0)`); tg.addColorStop(.6, `rgba(${avg},${lk})`); tg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = tg; ctx.fillRect(0, 0, innerWidth, innerHeight);
    }
    if (cdShow) {
      const cdt = now - cdT;
      if (cdt < 700) {
        const sc = 1 + .22 * Math.sin(Math.min(cdt / 700, 1) * Math.PI);
        cd.style.opacity = String(1 - cdt / 700); cd.style.transform = `translate(-50%,-50%) scale(${sc})`;
        cd.style.color = hslS(hue); cd.style.textShadow = `0 0 44px ${hslS(hue, .85)}`;
      } else { cdShow = 0; cd.style.opacity = '0'; }
    }
    if (!reduced && running && title.classList.contains('live')) {
      const micro = 1 + B.bass * .005 * act;
      const scat = (now - scatT) / 520;   // разъезд букв на дропе: 0→1 и обратно к 0
      const scatOn = scat >= 0 && scat < 1 ? Math.sin(scat * Math.PI) : 0;
      [...title.children].forEach((el, i) => {
        const dt = now - popT[i];
        let y = 0, rot = 0, dx = 0;
        if (dt >= 0 && dt < 600) {
          const e = Math.exp(-dt / 105);
          y = -popA[i] * e; rot = popA[i] > 24 ? (i % 2 ? 1 : -1) * e * 1.6 : 0;
        }
        if (scatOn > 0) dx = (i - (L - 1) / 2) * scatA * scatOn * (i % 2 ? 1 : .8);
        el.style.transform = `scale(${micro}) translate(${dx}px, ${y}px) rotate(${rot}deg)`;
      });
      title.style.filter = impact > .1 || flashK > .05 ? `brightness(${1 + impact * .5 + flashK * .4}) drop-shadow(0 0 ${(impact * 26 + flashK * 18)}px ${hslS(hue, .9 * act)})` : 'none';
    }
  }
  requestAnimationFrame(draw);
})();
