(() => {
  'use strict';
  const video = document.querySelector('#dance');
  const fx = document.querySelector('#fx');
  const ctx = fx.getContext('2d');
  const eq = document.querySelector('#equalizer');
  const eqCtx = eq.getContext('2d');
  const gate = document.querySelector('#gate');
  const band = document.querySelector('.band');
  const glitch = document.querySelector('.glitch');
  const flash = document.querySelector('.flash');
  const soundBtn = document.querySelector('#soundBtn');
  const soundLabel = document.querySelector('#soundLabel');
  const playBtn = document.querySelector('#playBtn');
  const playIcon = document.querySelector('#playIcon');
  const playLabel = document.querySelector('#playLabel');
  const progressBar = document.querySelector('#progressBar');
  const currentTime = document.querySelector('#currentTime');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  window.SpredCore = { state: { hue: 330, kick: 0, energy: 0, playing: false, muted: false }, analyser: null, data: null, video };
  const hook = (n, d) => { try { const f = window.SpredFx && window.SpredFx[n]; if (f) f(d); } catch (e) {} };
  let audio, analyser, source, data, freq;
  let running = false, last = 0, lastLuma = 0, energy = 0, threshold = 0;
  let kick = 0, loopFade = 0, hue = 330, targetHue = 330, prevTarget = 330, visSm = 0, visKickPulse = 0, audioBeat = false, bassPrev = 0, nextBeatAt = 0, nextVisAt = 0;
  const titleEl = document.querySelector('h1');
  let motion = { x: 32, y: 27, energy: 0 };
  let previousPixels = null;
  let particles = [], rings = [], sparks = [];
  const cutCanvas = document.createElement('canvas'); cutCanvas.width = 64; cutCanvas.height = 36;
  const cutCtx = cutCanvas.getContext('2d', { willReadFrequently: true });
  const stars = reduced ? 0 : innerWidth < 700 ? 10 : 21;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const hueCss = () => `hsl(${hue}, 88%, 62%)`;
  const hueRgb = () => { const h = hue / 60, c = .88 * .62, x = c * (1 - Math.abs(h % 2 - 1)), m = .62 - c / 2; const q = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(h) % 6]; return q.map(v => Math.round((v + m) * 255)); };
  const angDiff = (a, b) => ((b - a + 540) % 360) - 180;
  function resize() { const d = Math.min(devicePixelRatio || 1, 2); fx.width = innerWidth * d; fx.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  function seed() { particles = []; for (let i = 0; i < stars; i++) particles.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: Math.random() * 1.5 + .3, v: Math.random() * .09 + .03, p: Math.random() * 6.28 }); }
  function initAudio() { if (audio) return; audio = new AudioContext(); source = audio.createMediaElementSource(video); analyser = audio.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = .72; source.connect(analyser); analyser.connect(audio.destination); data = new Uint8Array(analyser.frequencyBinCount); freq = new Uint8Array(analyser.frequencyBinCount); const c = window.SpredCore; if (c) { c.analyser = analyser; c.data = data; c.freq = freq; } }
  async function start(muted) { initAudio(); video.muted = muted; try { await audio.resume(); await video.play(); } catch (e) { console.warn('Playback was blocked:', e); } gate.classList.add('is-leaving'); running = true; const st = window.SpredCore.state; st.playing = true; st.muted = muted; soundLabel.textContent = muted ? 'звук выкл.' : 'звук вкл.'; soundBtn.setAttribute('aria-pressed', String(!muted)); hook('onStart', { muted }); }
  document.querySelector('#startSound').addEventListener('click', () => start(false)); document.querySelector('#startSilent').addEventListener('click', () => start(true));
  soundBtn.addEventListener('click', async () => { initAudio(); video.muted = !video.muted; if (audio.state === 'suspended') await audio.resume(); soundLabel.textContent = video.muted ? 'звук выкл.' : 'звук вкл.'; soundBtn.setAttribute('aria-pressed', String(!video.muted)); });
  playBtn.addEventListener('click', async () => { if (video.paused) { initAudio(); if (audio.state === 'suspended') await audio.resume(); await video.play(); } else video.pause(); });
  video.addEventListener('loadeddata', () => video.classList.add('ready'));
  video.addEventListener('play', () => { playIcon.textContent = 'Ⅱ'; playLabel.textContent = 'пауза'; });
  video.addEventListener('pause', () => { playIcon.textContent = '▶'; playLabel.textContent = 'плей'; });
  video.addEventListener('timeupdate', () => { const d = video.duration || 15; progressBar.style.width = `${video.currentTime / d * 100}%`; currentTime.textContent = `00:${String(Math.floor(video.currentTime) % 60).padStart(2, '0')}`; if (video.currentTime < .2 || video.currentTime > d - .3) loopFade = 1; });
  function beat(power) { if (reduced) return; hook('onBeat', { power, hue, x: motion.x / 64, y: motion.y / 36 }); if (power > .45 && titleEl) { titleEl.classList.add('kick'); setTimeout(() => titleEl.classList.remove('kick'), 150); } const x = motion.x * innerWidth / 64, y = Math.max(innerHeight * .45, motion.y * innerHeight / 36); if (rings.length < (innerWidth < 700 ? 2 : 4)) rings.push({ x, y, r: 9, a: .3, w: 1.4 + power * 1.6 }); for (let i = 0; i < 1 + Math.round(power * 2); i++) sparks.push({ x, y, vx: (Math.random() - .5) * 1.8, vy: -1 - Math.random() * 2, life: 1, size: Math.random() * 2 + 1 }); }
  function cutCheck(now) {
    if (!video.videoWidth || now - last < 125) return; last = now; cutCtx.drawImage(video, 0, 0, 64, 36);
    const p = cutCtx.getImageData(0, 0, 64, 36).data; let l = 0, buckets = new Array(12).fill(0), sx = 0, sy = 0, sw = 0;
    for (let y = 0; y < 36; y++) for (let x = 0; x < 64; x++) { const i = (y * 64 + x) * 4, r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; l += (r + g + b) / 3; const s = mx ? d / mx : 0; if (s >= .18 && mx >= .12) buckets[Math.floor(((Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180 / Math.PI + 360) % 360) / 30)] += s; if (previousPixels) { const diff = Math.abs(p[i] - previousPixels[i]) + Math.abs(p[i + 1] - previousPixels[i + 1]) + Math.abs(p[i + 2] - previousPixels[i + 2]); if (diff > 55) { const w = diff / 765; sx += x * w; sy += y * w; sw += w; } } }
    l /= 2304; const maxBucket = Math.max(...buckets); if (maxBucket) targetHue = (buckets.indexOf(maxBucket) * 30 + 15) % 360; hue = (hue + angDiff(hue, targetHue) * .05 + 360) % 360; motion = sw ? { x: sx / sw, y: sy / sw, energy: clamp(sw / 230, 0, 1) } : { ...motion, energy: 0 };
    const lumaJump = lastLuma && Math.abs(l - lastLuma) > 26; const hueJump = maxBucket && Math.abs(angDiff(prevTarget, targetHue)) > 60; prevTarget = targetHue;
    visSm = visSm * .82 + motion.energy * .18; const vk = motion.energy - visSm;
    if (vk > .09 && motion.energy > .4 && now > nextVisAt && !(lumaJump || hueJump)) { nextVisAt = now + 190; visKickPulse = Math.max(visKickPulse, Math.min(1, .35 + vk * 4)); }
    const cut = lumaJump || hueJump;
    if (cut) { hook('onCut', { x: motion.x / 64, y: motion.y / 36, hue }); const bandCol = hueCss(); flash.style.background = `radial-gradient(circle at ${motion.x / 64 * 100}% ${motion.y / 36 * 100}%, ${hueCss()} 0%, transparent 60%)`; flash.style.opacity = lumaJump ? '.2' : '.13'; band.style.background = bandCol; band.style.boxShadow = `0 0 18px 4px ${bandCol}`; band.classList.remove('run'); glitch.classList.remove('run'); void band.offsetWidth; band.classList.add('run'); glitch.classList.add('run'); setTimeout(() => { flash.style.opacity = '0'; glitch.classList.remove('run'); }, 300); }
    if (motion.energy > .35 && !reduced) { const count = innerWidth < 700 ? 1 : 2; for (let i = 0; i < count; i++) sparks.push({ x: motion.x * innerWidth / 64, y: Math.max(innerHeight * .45, motion.y * innerHeight / 36), vx: (Math.random() - .5) * 1.5, vy: -1 - Math.random() * 1.8, life: 1, size: Math.random() * 2 + 1 }); }
    previousPixels = new Uint8ClampedArray(p); lastLuma = l;
  }
  function draw(now) { const dt = Math.min(32, now - (draw.prev || now)); draw.prev = now; audioBeat = false; ctx.clearRect(0, 0, innerWidth, innerHeight); cutCheck(now); if (analyser) { analyser.getByteFrequencyData(data); analyser.getByteTimeDomainData(freq); let bass = 0; for (let i = 2; i < 14; i++) bass += data[i]; bass /= 12 * 255; energy = energy * .9 + bass * .1; const rise = bass - bassPrev; bassPrev = bass; if (rise > .055 && bass > .36 && now > nextBeatAt) { nextBeatAt = now + 185; kick = 1; beat(clamp(.42 + rise * 3.5, .42, 1)); audioBeat = true; } } else { energy *= .9; } if (visKickPulse > 0 && !audioBeat) { kick = Math.max(kick, visKickPulse); beat(visKickPulse); } visKickPulse = 0; kick *= .84; loopFade *= .88; const st = window.SpredCore.state; st.hue = hue; st.kick = kick; st.energy = energy; st.playing = running && !video.paused;
 root.style.setProperty('--acc', hueCss()); const rgb = hueRgb(); hook('onFrame', { hue, kick, energy }); const alpha = .03 + energy * .07 + kick * .16; const grad = ctx.createRadialGradient(innerWidth * .72, innerHeight * .82, 0, innerWidth * .72, innerHeight * .82, innerWidth * .7); grad.addColorStop(0, `rgba(${rgb},${alpha})`); grad.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = grad; ctx.fillRect(0, 0, innerWidth, innerHeight); const grad2 = ctx.createRadialGradient(innerWidth * .45, innerHeight, 0, innerWidth * .45, innerHeight, innerWidth * .55); grad2.addColorStop(0, `rgba(${rgb},${alpha * .9})`); grad2.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = grad2; ctx.fillRect(0, 0, innerWidth, innerHeight);
    video.style.filter = `saturate(${1 + kick * .12}) brightness(${1 + kick * .06})`; video.style.transform = `scale(${1.07 + kick * .014})`; video.style.opacity = String(1 - Math.min(1, loopFade * 7) * .55);
    for (const p of particles) { p.y -= p.v * (1 + energy * 3) * dt / 16; p.p += .018; if (p.y < -5) p.y = innerHeight + 5; ctx.fillStyle = `rgba(255,248,240,${.16 + .16 * Math.sin(p.p)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.r += r.w * dt / 16; r.a -= .006 * dt / 16; ctx.strokeStyle = `rgba(${rgb},${r.a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke(); if (r.a <= 0) rings.splice(i, 1); }
    for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.x += s.vx * dt / 16; s.y += s.vy * dt / 16; s.life -= .025 * dt / 16; ctx.strokeStyle = `rgba(${rgb},${s.life * .8})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 4, s.y - s.vy * 4); ctx.stroke(); if (s.life <= 0) sparks.splice(i, 1); }
    if (!reduced) document.querySelector('h1').style.transform = `scale(${1 + kick * .006})`; drawEq(); requestAnimationFrame(draw); }
  function drawEq() { eqCtx.clearRect(0, 0, 180, 34); eqCtx.fillStyle = hueCss(); for (let i = 0; i < 15; i++) { const v = analyser ? data[i * 3] || 0 : 0; const h = 3 + v / 255 * 28; eqCtx.globalAlpha = .4 + v / 255 * .6; eqCtx.fillRect(i * 12, 34 - h, 7, h); } eqCtx.globalAlpha = 1; }
  addEventListener('resize', () => { resize(); seed(); }); resize(); seed(); requestAnimationFrame(draw);
})();