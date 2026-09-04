(() => {
  'use strict';

  const canvas = document.querySelector('#show');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const core = window.SpredCore;
  if (!ctx || !core) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = () => window.innerWidth < 700;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const TAU = Math.PI * 2;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let hue = 330;
  let energy = 0;
  let kick = 0;
  let last = 0;
  let colorTick = -1;
  let color = 'hsl(330, 88%, 62%)';
  let rgb = [255, 0, 0];
  let column;
  let rings = [];
  let flashes = [];
  let cuts = [];

  const hsl = (h, s, l) => `hsl(${(h + 360) % 360}, ${s}%, ${l}%)`;
  const rgbForHue = (h) => {
    const k = ((h % 360) + 360) % 360 / 60;
    const c = 0.88 * 0.62;
    const x = c * (1 - Math.abs(k % 2 - 1));
    const m = 0.62 - c / 2;
    const q = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(k) % 6];
    return q.map((v) => Math.round((v + m) * 255));
  };
  const rgba = (alpha) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    column = document.createElement('canvas');
    column.width = 4;
    column.height = 64;
    updateColumn();
  }

  function updateColumn() {
    if (!column) return;
    const columnCtx = column.getContext('2d');
    const gradient = columnCtx.createLinearGradient(0, 63, 0, 0);
    gradient.addColorStop(0, rgba(0.4));
    gradient.addColorStop(0.22, rgba(0.35));
    gradient.addColorStop(1, rgba(0));
    columnCtx.clearRect(0, 0, 4, 64);
    columnCtx.fillStyle = gradient;
    columnCtx.fillRect(0, 0, 4, 64);
  }

  function refreshColor(frame) {
    if (frame === colorTick) return;
    colorTick = frame;
    color = hsl(hue, 88, 62);
    rgb = rgbForHue(hue);
    updateColumn();
  }

  function idle(now) {
    const wave = ctx.createLinearGradient(0, 0, width, height);
    const shift = Math.sin(now * 0.00025) * 12;
    wave.addColorStop(0, `hsla(${hue + shift}, 84%, 56%, .045)`);
    wave.addColorStop(.5, 'rgba(0,0,0,0)');
    wave.addColorStop(1, `hsla(${hue - shift}, 84%, 56%, .045)`);
    ctx.fillStyle = wave;
    ctx.fillRect(0, 0, width, height);
  }

  function drawSpectrum(now) {
    const data = core.data;
    const count = mobile() ? 24 : 56;
    const beamWidth = Math.ceil(width / count);
    const source = data && data.length ? data : null;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i += 1) {
      const bin = Math.min(63, Math.floor(i * 64 / count));
      const sample = source ? (source[Math.min(source.length - 1, bin * 2)] || 0) / 255 : 0;
      const bassLift = 1 + (1 - i / count) * 0.28;
      const breathing = reduced.matches ? 1 : 1 + Math.sin(now * 0.01 + i * 0.3) * (1 + energy * 2) * 0.035;
      const beamHeight = Math.max(4, height * 0.29 * sample * bassLift * breathing + kick * height * 0.14);
      const x = i * width / count;
      ctx.globalAlpha = clamp(0.66 + sample * 0.34, 0, 1);
      ctx.drawImage(column, 0, 0, 4, 64, x, height - beamHeight, beamWidth + 1, beamHeight);
      // Тонкий частотный сдвиг, ограниченный диапазоном ±40°.
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = hsl(hue + clamp((i / Math.max(1, count - 1) - .5) * 80, -40, 40), 88, 62);
      ctx.fillRect(x, height - beamHeight, beamWidth + 1, beamHeight);
      ctx.globalAlpha = 0.62 + sample * 0.38;
      ctx.fillStyle = color;
      ctx.fillRect(x, height - Math.max(2, Math.min(4, beamWidth * 0.18)), beamWidth + 1, Math.max(2, Math.min(4, beamWidth * 0.18)));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawSpotlights() {
    if (mobile() || reduced.matches) return;
    const pulse = 0.045 + energy * 0.045 + kick * 0.02;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1;
    const left = ctx.createLinearGradient(0, 0, width * .48, height * .7);
    left.addColorStop(0, rgba(pulse));
    left.addColorStop(1, rgba(0));
    ctx.fillStyle = left;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, height * .72); ctx.lineTo(width * .49, height * .42); ctx.closePath(); ctx.fill();
    const right = ctx.createLinearGradient(width, 0, width * .52, height * .7);
    right.addColorStop(0, rgba(pulse));
    right.addColorStop(1, rgba(0));
    ctx.fillStyle = right;
    ctx.beginPath(); ctx.moveTo(width, 0); ctx.lineTo(width, height * .72); ctx.lineTo(width * .51, height * .42); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function roundedRect(x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawImpulses(now) {
    if (reduced.matches) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = rings.length - 1; i >= 0; i -= 1) {
      const ring = rings[i];
      const age = (now - ring.start) / 700;
      if (age >= 1) { rings.splice(i, 1); continue; }
      const inset = Math.min(width, height) * 0.018 + age * Math.min(width, height) * 0.018;
      ctx.strokeStyle = rgba(ring.power * .26 * (1 - age));
      ctx.lineWidth = 2 + ring.power * 1.4;
      roundedRect(inset, inset, width - inset * 2, height - inset * 2, 18);
      ctx.stroke();
    }
    for (let i = flashes.length - 1; i >= 0; i -= 1) {
      const flash = flashes[i];
      const age = (now - flash.start) / (flash.duration || 260);
      if (age >= 1) { flashes.splice(i, 1); continue; }
      const radius = Math.max(width, height) * (flash.strobe ? 1.2 : .25) * (flash.strobe ? 1 : age + .2);
      const gradient = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, radius);
      gradient.addColorStop(0, rgba(flash.power * (flash.strobe ? .05 : .08) * (1 - age)));
      gradient.addColorStop(1, rgba(0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawCuts(now) {
    if (reduced.matches) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = cuts.length - 1; i >= 0; i -= 1) {
      const cut = cuts[i];
      const age = (now - cut.start) / 450;
      if (age >= 1) { cuts.splice(i, 1); continue; }
      const y = height * (1 - age);
      const band = ctx.createLinearGradient(0, y - height * .11, 0, y + height * .11);
      band.addColorStop(0, rgba(0)); band.addColorStop(.5, rgba(.12 * (1 - age))); band.addColorStop(1, rgba(0));
      ctx.fillStyle = band;
      ctx.fillRect(0, y - height * .11, width, height * .22);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function render(now) {
    const frame = Math.floor(now / 48);
    const state = core.state || {};
    hue = Number.isFinite(state.hue) ? state.hue : hue;
    kick = clamp(Number(state.kick) || 0, 0, 1);
    energy = clamp(Number(state.energy) || 0, 0, 1);
    refreshColor(frame);
    ctx.clearRect(0, 0, width, height);

    if (reduced.matches) {
      const gradient = ctx.createLinearGradient(0, height, width, 0);
      gradient.addColorStop(0, `hsla(${hue}, 86%, 56%, .055)`);
      gradient.addColorStop(1, `hsla(${hue + 28}, 86%, 56%, .018)`);
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    } else if (!state.playing || !core.analyser) {
      idle(now);
    } else {
      drawSpotlights();
      drawSpectrum(now);
      drawCuts(now);
      drawImpulses(now);
    }
    last = now;
    window.requestAnimationFrame(render);
  }

  window.SpredFx = window.SpredFx || {};
  window.SpredFx.onBeat = ({ power = 0, x = .5, y = .5 } = {}) => {
    if (reduced.matches) return;
    const maxRings = mobile() ? 2 : 3;
    if (rings.length >= maxRings) rings.shift();
    rings.push({ start: performance.now(), power: clamp(power, 0, 1) });
    flashes.push({ start: performance.now(), x: x * width, y: y * height, power: clamp(power, 0, 1), duration: 260, strobe: false });
    if (power > .58) flashes.push({ start: performance.now(), x: width / 2, y: height / 2, power: 1, duration: 60, strobe: true });
  };
  window.SpredFx.onCut = ({ x = .5, y = .5, hue: nextHue } = {}) => {
    if (Number.isFinite(nextHue)) hue = nextHue;
    if (reduced.matches) return;
    cuts.push({ start: performance.now(), x, y });
  };
  window.SpredFx.onFrame = ({ hue: nextHue, kick: nextKick, energy: nextEnergy } = {}) => {
    if (Number.isFinite(nextHue)) hue = nextHue;
    if (Number.isFinite(nextKick)) kick = nextKick;
    if (Number.isFinite(nextEnergy)) energy = nextEnergy;
  };
  window.SpredFx.onStart = () => {};

  window.addEventListener('resize', resize, { passive: true });
  resize();
  window.requestAnimationFrame(render);
})();
