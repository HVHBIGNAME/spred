(() => {
  'use strict';
  const video = document.querySelector('#dance');
  const fx = document.querySelector('#fx');
  const ctx = fx.getContext('2d');
  const eq = document.querySelector('#equalizer');
  const eqCtx = eq.getContext('2d');
  const gate = document.querySelector('#gate');
  const soundBtn = document.querySelector('#soundBtn');
  const soundLabel = document.querySelector('#soundLabel');
  const playBtn = document.querySelector('#playBtn');
  const playIcon = document.querySelector('#playIcon');
  const playLabel = document.querySelector('#playLabel');
  const progressBar = document.querySelector('#progressBar');
  const currentTime = document.querySelector('#currentTime');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let audio, analyser, source, data, freq; let running = false, last = 0, lastLuma = 0, energy = 0, threshold = 0; let kick = 0, loopFade = 0;
  let particles = [], rings = [], sparks = [];
  const cutCanvas = document.createElement('canvas'); cutCanvas.width = 64; cutCanvas.height = 36;
  const cutCtx = cutCanvas.getContext('2d', { willReadFrequently: true });
  const stars = reduced ? 0 : innerWidth < 700 ? 24 : 42;
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  function resize(){const d=Math.min(devicePixelRatio||1,2);fx.width=innerWidth*d;fx.height=innerHeight*d;ctx.setTransform(d,0,0,d,0,0);}
  function seed(){particles=[];for(let i=0;i<stars;i++)particles.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:Math.random()*1.8+.35,v:Math.random()*.16+.05,p:Math.random()*6.28});}
  function initAudio(){if(audio)return;audio=new AudioContext();source=audio.createMediaElementSource(video);analyser=audio.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.72;source.connect(analyser);analyser.connect(audio.destination);data=new Uint8Array(analyser.frequencyBinCount);freq=new Uint8Array(analyser.frequencyBinCount);}
  async function start(muted){initAudio();video.muted=muted;try{await audio.resume();await video.play();}catch(e){console.warn('Playback was blocked:',e)} gate.classList.add('is-leaving');running=true; soundLabel.textContent=muted?'звук выкл.':'звук вкл.';soundBtn.setAttribute('aria-pressed',String(!muted));}
  document.querySelector('#startSound').addEventListener('click',()=>start(false)); document.querySelector('#startSilent').addEventListener('click',()=>start(true));
  soundBtn.addEventListener('click',async()=>{initAudio();video.muted=!video.muted;if(audio.state==='suspended')await audio.resume();soundLabel.textContent=video.muted?'звук выкл.':'звук вкл.';soundBtn.setAttribute('aria-pressed',String(!video.muted));});
  playBtn.addEventListener('click',async()=>{if(video.paused){initAudio();if(audio.state==='suspended')await audio.resume();await video.play();}else video.pause();});
  video.addEventListener('loadeddata',()=>video.classList.add('ready'));
  video.addEventListener('play',()=>{playIcon.textContent='Ⅱ';playLabel.textContent='пауза'}); video.addEventListener('pause',()=>{playIcon.textContent='▶';playLabel.textContent='плей'});
  video.addEventListener('timeupdate',()=>{const d=video.duration||15;progressBar.style.width=`${video.currentTime/d*100}%`;currentTime.textContent=`00:${String(Math.floor(video.currentTime)%60).padStart(2,'0')}`;if(video.currentTime<.2||video.currentTime>d-.3)loopFade=Math.max(loopFade,.1);});
  function beat(power){if(reduced)return;const x=innerWidth*(.25+Math.random()*.5),y=innerHeight*(.2+Math.random()*.7);rings.push({x,y,r:8,a:.75,w:1+power*3});for(let i=0;i<Math.round(4+power*4);i++){const ang=Math.random()*Math.PI*2; sparks.push({x,y,vx:Math.cos(ang)*(1+Math.random()*3),vy:Math.sin(ang)*(1+Math.random()*3),life:1,size:Math.random()*3+1});}}
  function cutCheck(now){if(!video.videoWidth||now-last<125)return;last=now;cutCtx.drawImage(video,0,0,64,36);const p=cutCtx.getImageData(0,0,64,36).data;let l=0;for(let i=0;i<p.length;i+=4)l+=(p[i]+p[i+1]+p[i+2])/3;l/=p.length/4;if(lastLuma&&Math.abs(l-lastLuma)>32){document.querySelector('.glitch').style.opacity='.8';document.querySelector('.flash').style.opacity='.08';setTimeout(()=>{document.querySelector('.glitch').style.opacity='0';document.querySelector('.flash').style.opacity='0'},150)}lastLuma=l;}
  function draw(now){const dt=Math.min(32,now-(draw.prev||now));draw.prev=now;ctx.clearRect(0,0,innerWidth,innerHeight);if(analyser){analyser.getByteFrequencyData(data);analyser.getByteTimeDomainData(freq);let bass=0;for(let i=2;i<14;i++)bass+=data[i];bass/=12*255;energy=energy*.88+bass*.12;threshold=threshold*.985;if(bass>Math.max(.28,threshold+.08)){threshold=bass;kick=1;beat(clamp(bass,0,1));}}kick*=.84;loopFade*=.94;video.style.filter=`saturate(${1+kick*.2})`;video.style.opacity=String(.45+Math.min(1,loopFade*7)*.55);for(const p of particles){p.y-=p.v*(1+energy*4)*dt/16;p.p+=.035;if(p.y< -5)p.y=innerHeight+5;const a=(.22+.25*Math.sin(p.p))*clamp(p.r/2,0,1);ctx.fillStyle=`rgba(255,255,255,${a})`;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();}for(let i=rings.length-1;i>=0;i--){const r=rings[i];r.r+=r.w*dt/16;r.a-=.018*dt/16;ctx.strokeStyle=`rgba(255,62,200,${r.a})`;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,Math.PI*2);ctx.stroke();if(r.a<=0)rings.splice(i,1);}for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.x+=s.vx*dt/16;s.y+=s.vy*dt/16;s.vy+=.04;s.life-=.025*dt/16;ctx.fillStyle=`rgba(255,255,255,${s.life})`;ctx.beginPath();ctx.moveTo(s.x,s.y-s.size*2);ctx.lineTo(s.x+s.size*.55,s.y-s.size*.55);ctx.lineTo(s.x+s.size*2,s.y);ctx.lineTo(s.x+s.size*.55,s.y+s.size*.55);ctx.lineTo(s.x,s.y+s.size*2);ctx.lineTo(s.x-s.size*.55,s.y+s.size*.55);ctx.lineTo(s.x-s.size*2,s.y);ctx.lineTo(s.x-s.size*.55,s.y-s.size*.55);ctx.fill();if(s.life<=0)sparks.splice(i,1);}if(!reduced)document.querySelector('h1').style.transform=`scale(${1+kick*.015})`;cutCheck(now);drawEq();requestAnimationFrame(draw);}
  function drawEq(){eqCtx.clearRect(0,0,180,34);eqCtx.fillStyle='#ff3ec8';for(let i=0;i<15;i++){const v=analyser?data[i*3]||0:0;const h=3+v/255*28;eqCtx.globalAlpha=.4+v/255*.6;eqCtx.fillRect(i*12,34-h,7,h)}eqCtx.globalAlpha=1;}
  addEventListener('resize',()=>{resize();seed()});resize();seed();requestAnimationFrame(draw); 
})();
