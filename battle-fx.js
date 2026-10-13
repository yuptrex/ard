/* ==========================================================================
   battle-fx.js  -  Battleground visual upgrade (v8)
   Draw-only layer. It never touches gameplay state: it only paints the arena
   and adds extra particles / flashes. game.js calls into window.BFX from
   render() and falls back to the original drawing if anything here throws.
   ========================================================================== */
(function(){
'use strict';
const TAU=6.2832;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
function R32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function mk(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
/* Graphics quality tier, chosen in Settings: 0 = Low, 1 = Medium, 2 = High (default, original look). */
const gfx=()=>window.GFXQ==null?2:window.GFXQ;
const GLOW=()=>gfx()>=1;   // skip the small decorative glow sprites (crystals/bush/pond/sigils) below Medium
const CLOUDS=()=>gfx()>=2; // drifting cloud shadows are a High-only flourish
const Q=()=>!!(window.PFQ&&window.PFQ.lq)||LITE||gfx()===0;   // low-quality flag used by the game's own perf code
const LQ=()=>LITE||!GLOW();   // drop the small decorative glow sprites: auto "lite" mode, or Graphics Quality below Medium

/* ---------------------------------------------------------------- palettes */
const PAL={
 1:{ // EMERALD COURTYARD: teal flagstone, lush grass, warm stone walls, gold trim
  fh:198,fs:36,fl:25,groove:'#07151d',
  patch:[['#2fd06b',.50],['#e3b24a',.30],['#3a8cff',.34]],
  wh:222,ws:24,wl:40,faceTop:'#2c3650',faceBot:'#121827',edgeHi:'#b9c9ea',edgeLo:'#0d1220',
  trim:'#ffc24d',trim2:'#fff0b8',flame:'#ffa63a',
  zones:['#ffb347','#5be37a','#58b8ff','#ff6b8a','#ffd84a'],
  fly:'#d9ff7a',flyN:46,rise:0,
  grassA:'#1f9a4c',grassB:'#8cffaa',rock:'#6f86a6',rockHi:'#c9dbf2',water1:'#46d2ff',water2:'#1b69c0',water3:'#d8f6ff',
  crys:['#59e8ff','#b07bff','#ff7ad1'],bar:'#ffc24d',cloud:.15,vig:[6,10,22],
  pole:'#6b5a3a',flag:['#ffc24d','#ff6b8a','#58b8ff'],flagHi:'#fff6d8'},
 2:{ // VIOLET WASTES: plum stone, magma glow, magenta trim
  fh:276,fs:30,fl:26,groove:'#0f0718',
  patch:[['#c24ee8',.46],['#ff8a3c',.38],['#3fd4cc',.32]],
  wh:290,ws:22,wl:36,faceTop:'#3a2850',faceBot:'#150c22',edgeHi:'#e0c4ff',edgeLo:'#0e0716',
  trim:'#ff6fb1',trim2:'#ffd0e6',flame:'#ff7a3a',
  zones:['#ff6fb1','#ffb347','#8f7bff','#4fe0d0','#ffd84a'],
  fly:'#ffb066',flyN:54,rise:1,
  grassA:'#b8561e',grassB:'#ffb066',rock:'#5a4a73',rockHi:'#c3a9ec',water1:'#ffd04a',water2:'#ff4a1a',water3:'#fff0c0',
  crys:['#ff6fb1','#ffb347','#8f7bff'],bar:'#ff6fb1',cloud:.18,vig:[10,4,16],
  pole:'#3a2a30',flag:['#ff6fb1','#8f7bff','#4fe0d0'],flagHi:'#ffe0f0'}
};
const pal=()=>PAL[LV==2?2:1];

/* ------------------------------------------------------------- sprite cache */
const SPR=new Map();
function glowSpr(col,sz){ // soft radial glow of any CSS colour (white-hot core)
 sz=sz||128;const key=col+'|'+sz;let c=SPR.get(key);if(c)return c;
 c=mk(sz,sz);const g=c.getContext('2d'),h=sz/2;
 g.fillStyle=col;g.fillRect(0,0,sz,sz);
 g.globalCompositeOperation='destination-in';
 const m=g.createRadialGradient(h,h,0,h,h,h);
 m.addColorStop(0,'rgba(0,0,0,1)');m.addColorStop(.25,'rgba(0,0,0,.62)');m.addColorStop(.55,'rgba(0,0,0,.22)');m.addColorStop(1,'rgba(0,0,0,0)');
 g.fillStyle=m;g.fillRect(0,0,sz,sz);
 if(SPR.size>160)SPR.clear();
 SPR.set(key,c);return c}
const hueSpr=h=>glowSpr(`hsl(${((h|0)+360)%360} 100% 62%)`);
function glowAt(c,x,y,r,a,col){if(a<=0.003)return;cx.globalAlpha=a;cx.drawImage(glowSpr(col),x-r,y-r,r*2,r*2)}

/* ------------------------------------------------------------ texture build */
let TEX={lv:0,px:0,floor:null,wall:null,fp:null,wp:null,torches:null,tl:0,map:null};
const MS=8; // colour map is baked at 1/8 resolution (soft blobs only, so it stays smooth)
function bakeFloor(P,px){
 const N=8,T=64,s=T*px,W=N*s,c=mk(W,W),g=c.getContext('2d'),r=R32(7771+P.fh);
 g.fillStyle=P.groove;g.fillRect(0,0,W,W);
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){
  const x=i*s,y=j*s,l=P.fl+(r()-.5)*8,h=P.fh+(r()-.5)*14;
  const gr=g.createLinearGradient(x,y,x+s,y+s);
  gr.addColorStop(0,`hsl(${h} ${P.fs}% ${l+3.5}%)`);gr.addColorStop(1,`hsl(${h} ${P.fs}% ${l-3}%)`);
  g.fillStyle=gr;g.beginPath();g.roundRect(x+2*px,y+2*px,s-4*px,s-4*px,7*px);g.fill();
  g.lineWidth=1.6*px;g.lineJoin='round';
  g.strokeStyle='rgba(255,255,255,.15)';g.beginPath();g.moveTo(x+4*px,y+s-8*px);g.lineTo(x+4*px,y+6*px);g.lineTo(x+s-8*px,y+4*px);g.stroke();
  g.strokeStyle='rgba(0,0,0,.30)';g.beginPath();g.moveTo(x+s-4*px,y+8*px);g.lineTo(x+s-4*px,y+s-4*px);g.lineTo(x+8*px,y+s-4*px);g.stroke();
  for(let k=0;k<26;k++){g.fillStyle=r()<.5?'rgba(255,255,255,.055)':'rgba(0,0,0,.09)';g.fillRect(x+6*px+r()*(s-12*px),y+6*px+r()*(s-12*px),(1+r()*3)*px,(1+r()*3)*px)}
  if(r()<.24){g.strokeStyle='rgba(0,0,0,.28)';g.lineWidth=1.2*px;g.beginPath();let cx0=x+s*(.25+r()*.5),cy0=y+s*(.2+r()*.2);g.moveTo(cx0,cy0);for(let k=0;k<4;k++){cx0+=(r()-.5)*22*px;cy0+=(6+r()*10)*px;g.lineTo(clamp(cx0,x+8*px,x+s-8*px),clamp(cy0,y+8*px,y+s-8*px))}g.stroke()}
  if(r()<.13){g.strokeStyle=P.trim;g.globalAlpha=.20;g.lineWidth=1.6*px;const m=s/2;g.beginPath();g.moveTo(x+m,y+14*px);g.lineTo(x+s-14*px,y+m);g.lineTo(x+m,y+s-14*px);g.lineTo(x+14*px,y+m);g.closePath();g.stroke();g.globalAlpha=1}
 }
 return c}
function bakeWall(P,px){
 const BW=32,BH=16,cols=4,rows=4,W=BW*cols*px,H=BH*rows*px,c=mk(W,H),g=c.getContext('2d'),r=R32(991+P.wh);
 g.fillStyle='#0a0d18';g.fillRect(0,0,W,H);
 for(let j=0;j<rows;j++)for(let i=-1;i<=cols;i++){
  const off=(j%2)?BW/2:0,x=(i*BW+off)*px,y=j*BH*px,l=P.wl+(r()-.5)*9,h=P.wh+(r()-.5)*10;
  const gr=g.createLinearGradient(x,y,x,y+BH*px);
  gr.addColorStop(0,`hsl(${h} ${P.ws}% ${l+5}%)`);gr.addColorStop(1,`hsl(${h} ${P.ws}% ${l-4}%)`);
  g.fillStyle=gr;g.beginPath();g.roundRect(x+px,y+px,BW*px-2*px,BH*px-2*px,2.5*px);g.fill();
  g.fillStyle='rgba(255,255,255,.13)';g.fillRect(x+1.5*px,y+px,BW*px-3*px,1.4*px);
  g.fillStyle='rgba(0,0,0,.22)';g.fillRect(x+1.5*px,y+BH*px-2.4*px,BW*px-3*px,1.4*px);
  for(let k=0;k<5;k++){g.fillStyle=r()<.5?'rgba(255,255,255,.07)':'rgba(0,0,0,.12)';g.fillRect(x+3*px+r()*(BW-8)*px,y+3*px+r()*(BH-7)*px,(1+r()*2.4)*px,(1+r()*2)*px)}
 }
 return c}
function ensure(){
 const P=pal(),lv=LV==2?2:1,px=(S*dpr>1.5)?2:1;
 if(TEX.lv===lv&&TEX.px===px&&TEX.floor)return;
 TEX.lv=lv;TEX.px=px;
 TEX.floor=bakeFloor(P,px);TEX.wall=bakeWall(P,px);
 TEX.fp=cx.createPattern(TEX.floor,'repeat');TEX.wp=cx.createPattern(TEX.wall,'repeat');
 const m=new DOMMatrix().scale(1/px);
 try{TEX.fp.setTransform(m);TEX.wp.setTransform(m)}catch(e){}
 // torch positions (cached per level from the wall list)
 const T=[];let n=0;
 for(const[x,y,w,h]of WALLS){if(Math.max(w,h)<170)continue;
  if(w>=h){T.push([x+16,y+h/2,n++],[x+w-16,y+h/2,n++])}else{T.push([x+w/2,y+16,n++],[x+w/2,y+h-16,n++])}}
 TEX.torches=T;TEX.tl=WALLS.length;
 // bake grass/sand/water patches + zone light pools once per level into a small map
 const cm=mk(Math.ceil(MW/MS),Math.ceil(MH/MS)),g=cm.getContext('2d');
 for(const q of PAT){const pc=P.patch[q.k%3];g.globalAlpha=pc[1]*.72;const r=q.r/MS;g.drawImage(glowSpr(pc[0]),q.x/MS-r,q.y/MS-r,r*2,r*2)}
 g.globalCompositeOperation='lighter';g.globalAlpha=.085;
 ZN.forEach((z,i)=>{const r=640/MS;g.drawImage(glowSpr(P.zones[i%5]),z[1]/MS-r,z[2]/MS-r,r*2,r*2)});
 TEX.map=cm}

/* -------------------------------------------------------------- state */
const flashes=[],decals=[],amb=[];
let punchZ=0,vigC=null,vigKey='',hurtT=0,LITE=0,emaDt=1/60,slowT=0;
const pulse=(now,sp,ph)=>Math.sin(now/sp+(ph||0))*.5+.5;

/* --------------------------------------------------------------- FLOOR */
function floor(now,dt,hw,hh){
 const P=pal();ensure();
 if(TEX.tl!==WALLS.length){TEX.lv=0;ensure()}
 const x0=Math.max(0,cam.x-hw-30),y0=Math.max(0,cam.y-hh-30),x1=Math.min(MW,cam.x+hw+30),y1=Math.min(MH,cam.y+hh+30);
 cx.fillStyle='#04070b';cx.fillRect(0,0,MW,MH);
 cx.fillStyle=TEX.fp;cx.fillRect(x0,y0,x1-x0,y1-y0);
 const vis=(x,y,r)=>x+r>x0&&x-r<x1&&y+r>y0&&y-r<y1;
 // baked colour patches + zone light pools (one cheap draw)
 {const sx=x0/MS,sy=y0/MS,sw=(x1-x0)/MS,sh=(y1-y0)/MS;cx.globalAlpha=1;cx.drawImage(TEX.map,sx,sy,sw,sh,x0,y0,x1-x0,y1-y0)}
 // zone names, painted into the ground
 cx.save();cx.textAlign='center';cx.font='bold 150px "Trebuchet MS",sans-serif';try{cx.letterSpacing='22px'}catch(e){}
 ZN.forEach((z,i)=>{if(!vis(z[1],z[2],700))return;cx.fillStyle='rgba(255,255,255,.055)';cx.strokeStyle=P.zones[i%5];cx.globalAlpha=.20;cx.lineWidth=3;cx.strokeText(z[0],z[1],z[2]);cx.globalAlpha=1;cx.fillText(z[0],z[1],z[2])});
 cx.restore();
 // rune rings under every zone + the big royal emblem in the middle (skipped on Low: several strokes each, every frame)
 if(gfx()>0){
  cx.save();cx.globalCompositeOperation='lighter';cx.lineCap='round';
  ZN.forEach((z,i)=>{if(!vis(z[1],z[2],200))return;rune(z[1],z[2],i==4?150:120,P.zones[i%5],now,i)});
  if(vis(MW/2,MH/2,300))emblem(MW/2,MH/2,now,P);
  cx.restore()}
 // decor
 decor(now,P,hw,hh,vis);
 // scorch marks / decals
 for(let i=decals.length-1;i>=0;i--){const d=decals[i];d.l-=dt;if(d.l<=0){decals.splice(i,1);continue}
  if(!vis(d.x,d.y,d.r))continue;const k=Math.min(1,d.l/d.m*1.6),hot=Math.max(0,d.l-(d.m-.9))/.9;
  cx.globalAlpha=.55*k;cx.drawImage(glowSpr('#000'),d.x-d.r,d.y-d.r,d.r*2,d.r*2);
  if(hot>0){cx.globalCompositeOperation='lighter';cx.globalAlpha=.7*hot;cx.drawImage(glowSpr(d.c),d.x-d.r*.8,d.y-d.r*.8,d.r*1.6,d.r*1.6);cx.globalCompositeOperation='source-over'}}
 cx.globalAlpha=1;
 // drifting cloud shadows
 const rr=R32(LV*77+5);cx.fillStyle='#000';
 for(let i=0;i<(LITE||!CLOUDS()?0:3);i++){const bx=rr()*MW,by=rr()*MH,sp=14+rr()*20,rad=330+rr()*220,x=((bx+now/1000*sp)%(MW+1400))-700,y=by+Math.sin(now/9000+i)*60;
  if(!vis(x,y,rad))continue;cx.globalAlpha=P.cloud;cx.drawImage(glowSpr('#000'),x-rad,y-rad*.7,rad*2,rad*1.4)}
 cx.globalAlpha=1;
 barrier(now,P);
 return 1}

function rune(x,y,r,col,now,i){
 cx.strokeStyle=col;cx.lineWidth=3;
 cx.globalAlpha=.22+.12*pulse(now,1600,i);cx.setLineDash([26,18]);cx.lineDashOffset=-now/60*(i%2?-1:1);cx.beginPath();cx.arc(x,y,r,0,TAU);cx.stroke();
 cx.setLineDash([]);cx.globalAlpha=.14;cx.lineWidth=2;cx.beginPath();cx.arc(x,y,r*.72,0,TAU);cx.stroke();
 cx.globalAlpha=.3;cx.lineWidth=3;const a0=now/1400*(i%2?-1:1);
 for(let k=0;k<6;k++){const a=a0+k*TAU/6;cx.beginPath();cx.moveTo(x+Math.cos(a)*r*.82,y+Math.sin(a)*r*.82);cx.lineTo(x+Math.cos(a)*r*1.1,y+Math.sin(a)*r*1.1);cx.stroke()}
 cx.globalAlpha=1}
function emblem(x,y,now,P){
 const c=P.trim;cx.strokeStyle=c;cx.lineCap='round';
 for(const[r,a,w,sp]of[[230,.26,4,1],[176,.2,2.5,-1.4],[120,.3,3,2.1]]){cx.globalAlpha=a+.08*pulse(now,1800,r);cx.lineWidth=w;cx.setLineDash(r==176?[]:[40,22]);cx.lineDashOffset=-now/50*sp;cx.beginPath();cx.arc(x,y,r,0,TAU);cx.stroke()}
 cx.setLineDash([]);cx.globalAlpha=.34;cx.lineWidth=3;cx.beginPath();
 const a0=now/2600;for(let k=0;k<8;k++){const a=a0+k*TAU/8,rr=k%2?92:140;const px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;k?cx.lineTo(px,py):cx.moveTo(px,py)}cx.closePath();cx.stroke();
 cx.globalAlpha=.22+.12*pulse(now,1300);cx.drawImage(glowSpr(c),x-190,y-190,380,380);cx.globalAlpha=1}

function decor(now,P,hw,hh,vis){
 const L2=LV==2,sw=now/1000;
 for(const d of DEC){if(!vis(d.x,d.y,50))continue;
  cx.save();cx.translate(d.x,d.y);cx.rotate(d.r);cx.scale(d.s,d.s);
  const k=d.k,ph=d.x*.013+d.y*.007;
  if(k==0){ // grass tufts / ember weeds, swaying in the wind
   cx.lineCap='round';
   for(let i=-2;i<=2;i++){const s=Math.sin(sw*1.8+ph+i*.7)*3.2,h=11+((i*7+d.x)%5+5)%5;
    cx.strokeStyle=P.grassA;cx.lineWidth=3;cx.beginPath();cx.moveTo(i*3.4,5);cx.quadraticCurveTo(i*5,-2,i*7+s,-h);cx.stroke();
    cx.strokeStyle=P.grassB;cx.lineWidth=1.4;cx.beginPath();cx.moveTo(i*3.4,3);cx.quadraticCurveTo(i*5,-3,i*7+s,-h);cx.stroke()}}
  else if(k==1){ // rocks
   cx.fillStyle='rgba(0,0,0,.35)';cx.beginPath();cx.ellipse(3,5,13,8,0,0,TAU);cx.fill();
   cx.fillStyle=P.rock;cx.beginPath();cx.ellipse(0,0,12,9,0,0,TAU);cx.fill();
   cx.fillStyle='rgba(255,255,255,.22)';cx.beginPath();cx.ellipse(-3,-3,7,4.5,-.3,0,TAU);cx.fill();
   cx.fillStyle=P.rockHi;cx.globalAlpha=.55;cx.beginPath();cx.ellipse(-4,-4,3.2,1.8,-.3,0,TAU);cx.fill();cx.globalAlpha=1;
   if(L2){cx.strokeStyle='#ff8a3c';cx.lineWidth=1.4;cx.globalAlpha=.55+.4*pulse(now,900,ph);cx.beginPath();cx.moveTo(-6,2);cx.lineTo(-1,0);cx.lineTo(3,4);cx.lineTo(8,1);cx.stroke();cx.globalAlpha=1}
   else{cx.fillStyle='#3fc46a';cx.beginPath();cx.ellipse(4,2,5,3,.4,0,TAU);cx.fill()}}
  else if(k==2){ // pond (water) / magma pool - full flow: drifting current bands, travelling ripple rings, sparkle glints
   const g=cx.createRadialGradient(0,-2,2,0,0,28);g.addColorStop(0,P.water1);g.addColorStop(1,P.water2);
   if(L2&&!LQ()){cx.globalCompositeOperation='lighter';cx.globalAlpha=.45+.2*pulse(now,700,ph);cx.drawImage(glowSpr('#ff6a22'),-62,-48,124,96);cx.globalCompositeOperation='source-over';cx.globalAlpha=1}
   cx.save();cx.beginPath();cx.ellipse(0,0,27,15,0,0,TAU);cx.clip();
   cx.fillStyle=g;cx.fillRect(-28,-16,56,32);
   // flowing current bands sweeping across the surface (the actual "moving water" look)
   for(let b=0;b<3;b++){
    const bo=((sw*.55+ph*3+b/3)%1),bx=-30+bo*60;
    cx.globalAlpha=(1-Math.abs(bo-.5)*2)*(L2?.30:.26);
    cx.fillStyle=L2?P.water3:'rgba(255,255,255,.75)';
    cx.beginPath();cx.ellipse(bx,Math.sin(b*2+ph)*3,10,4.2,.35,0,TAU);cx.fill()}
   cx.globalAlpha=1;cx.restore();
   cx.strokeStyle=L2?'#2a0a05':'rgba(210,245,255,.55)';cx.lineWidth=2.4;cx.beginPath();cx.ellipse(0,0,27,15,0,0,TAU);cx.stroke();
   // two staggered outward ripple rings for continuous travelling motion
   for(let ri=0;ri<2;ri++){
    const q=((sw*.7+ph+ri*.5)%1);cx.globalAlpha=(1-q)*.6;cx.strokeStyle=L2?'#ffe08a':'#fff';cx.lineWidth=1.4;
    cx.beginPath();cx.ellipse(0,0,6+q*18,3.5+q*9,0,0,TAU);cx.stroke()}
   cx.globalAlpha=1;
   cx.fillStyle='rgba(255,255,255,.55)';cx.beginPath();cx.ellipse(-8+Math.sin(sw+ph)*3,-4,6,1.6,0,0,TAU);cx.fill();
   if(L2){cx.fillStyle='#fff2a8';const b=(sw*1.3+ph)%1;cx.globalAlpha=1-b;cx.beginPath();cx.arc(Math.sin(ph*9)*10,4-b*8,2+b*3,0,TAU);cx.fill();cx.globalAlpha=1}
   // drifting sparkle glints riding the current
   cx.fillStyle=L2?'#ffdca0':'#fff';
   for(let si=0;si<2;si++){const so=(sw*.4+ph*5+si*.5)%1,gx=-20+so*40,ga=Math.sin(so*Math.PI);cx.globalAlpha=ga*.8;cx.beginPath();cx.arc(gx,Math.cos(si*3+ph)*5,1.3,0,TAU);cx.fill()}
   cx.globalAlpha=1}
  else if(k==5){ // waving flag on a pole - sine-warped cloth so each vertical strip ripples at a different phase
   const P2=now/1000*2.6+ph*4,FH2=16,FW=20,col=P.flag[((d.x|0)%3+3)%3];
   cx.fillStyle='rgba(0,0,0,.30)';cx.beginPath();cx.ellipse(1,10,5,2.2,0,0,TAU);cx.fill();
   cx.strokeStyle=P.pole;cx.lineWidth=2.6;cx.lineCap='round';cx.beginPath();cx.moveTo(0,11);cx.lineTo(0,-30);cx.stroke();
   cx.fillStyle=P.pole;cx.beginPath();cx.arc(0,-31,1.6,0,TAU);cx.fill();
   // waving banner: horizontal strips, each with its own phase offset, so the cloth ripples as it travels outward
   const topY=-28,amp=2.6+Math.sin(ph*5)*.4;
   cx.save();cx.translate(0,topY);
   const rows=5,rh=(FH2)/rows;
   for(let r=0;r<rows;r++){
    const ty=r*rh-FH2/2,wA=Math.sin(P2-r*.75)*amp,wB=Math.sin(P2-r*.75+.9)*amp;
    cx.fillStyle=col;cx.globalAlpha=.92;
    cx.beginPath();cx.moveTo(0+wA*.2,ty);cx.lineTo(FW+wA,ty);cx.lineTo(FW+wB,ty+rh);cx.lineTo(0+wB*.2,ty+rh);cx.closePath();cx.fill();
    cx.fillStyle=r%2?'rgba(0,0,0,.10)':'rgba(255,255,255,.16)';cx.beginPath();cx.moveTo(0+wA*.2,ty);cx.lineTo(FW+wA,ty);cx.lineTo(FW+wB,ty+rh);cx.lineTo(0+wB*.2,ty+rh);cx.closePath();cx.fill()}
   cx.globalAlpha=1;
   // emblem dot that rides the cloth's own wave so it doesn't float independently
   const mt=.5,mWA=Math.sin(P2-mt*rows*.75)*amp;
   cx.fillStyle=P.flagHi;cx.globalAlpha=.85;cx.beginPath();cx.arc(FW*.42+mWA,0,2.1,0,TAU);cx.fill();cx.globalAlpha=1;
   cx.restore()}
  else if(k==3){ // bush with blossoms / glow-fungus
   const cs=L2?['#6b2d86','#a252c4','#d98cff']:['#1d7a3e','#2ea055','#55d27a'];
   cx.fillStyle='rgba(0,0,0,.3)';cx.beginPath();cx.ellipse(3,6,18,8,0,0,TAU);cx.fill();
   [[0,0,13,0],[11,4,9,1],[-10,5,8,1],[-1,-4,7,2]].forEach(([x,y,r,c])=>{cx.fillStyle=cs[c];cx.beginPath();cx.arc(x,y,r,0,TAU);cx.fill()});
   const fc=L2?['#7dfff0','#ffe27a','#ff9ad8']:['#ff7ab8','#ffe066','#ffffff'],f=fc[((d.x|0)%3+3)%3];
   cx.fillStyle=f;for(const[x,y]of[[-5,-4],[6,1],[-9,6],[2,-8],[10,7]]){cx.beginPath();cx.arc(x,y,1.9,0,TAU);cx.fill()}
   if(L2&&!LQ()){cx.globalCompositeOperation='lighter';cx.globalAlpha=.3+.2*pulse(now,1100,ph);cx.drawImage(glowSpr('#7dfff0'),-30,-28,60,56);cx.globalCompositeOperation='source-over';cx.globalAlpha=1}}
  else if(k==4){ // crystal cluster
   const c=P.crys[((d.y|0)%3+3)%3];
   if(!LQ()){cx.globalCompositeOperation='lighter';cx.globalAlpha=.35+.25*pulse(now,1200,ph);cx.drawImage(glowSpr(c),-46,-46,92,92);cx.globalCompositeOperation='source-over';cx.globalAlpha=1}
   for(const[x,y,w,h,r]of[[-7,2,6,20,-.25],[0,0,8,28,0],[8,3,6,17,.3]]){cx.save();cx.translate(x,y);cx.rotate(r);
    cx.fillStyle=c;cx.beginPath();cx.moveTo(0,-h);cx.lineTo(w,-h*.25);cx.lineTo(w*.7,4);cx.lineTo(-w*.7,4);cx.lineTo(-w,-h*.25);cx.closePath();cx.fill();
    cx.fillStyle='rgba(255,255,255,.45)';cx.beginPath();cx.moveTo(0,-h);cx.lineTo(-w,-h*.25);cx.lineTo(-w*.7,4);cx.lineTo(-w*.1,2);cx.closePath();cx.fill();
    cx.strokeStyle='rgba(0,0,0,.45)';cx.lineWidth=1.2;cx.stroke();cx.restore()}}
  else{ // floor sigil
   cx.globalCompositeOperation='lighter';cx.strokeStyle=P.trim;cx.lineWidth=2.4;cx.globalAlpha=.16+.14*pulse(now,1500,ph);
   cx.beginPath();cx.arc(0,0,15,0,TAU);cx.stroke();cx.rotate(sw*.4);cx.beginPath();for(let i=0;i<5;i++){const a=i*TAU*.4,x=Math.cos(a)*15,y=Math.sin(a)*15;i?cx.lineTo(x,y):cx.moveTo(x,y)}cx.closePath();cx.stroke();
   cx.globalCompositeOperation='source-over';cx.globalAlpha=1}
  cx.restore()}}

function barrier(now,P){
 const bw=170,c=P.bar;cx.save();cx.globalCompositeOperation='lighter';
 const sides=[[0,0,MW,bw,0,0,0,bw],[0,MH-bw,MW,bw,0,MH,0,MH-bw],[0,0,bw,MH,0,0,bw,0],[MW-bw,0,bw,MH,MW,0,MW-bw,0]];
 cx.globalAlpha=.30+.10*pulse(now,1400);
 for(const[x,y,w,h,ax,ay,bx,by]of sides){if(x>cam.x+3000||x+w<cam.x-3000)continue;const g=cx.createLinearGradient(ax,ay,bx,by);g.addColorStop(0,c);g.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=g;cx.fillRect(x,y,w,h)}
 cx.globalAlpha=.35;cx.strokeStyle=c;cx.lineWidth=16;cx.strokeRect(6,6,MW-12,MH-12);
 cx.globalAlpha=.95;cx.lineWidth=5;cx.setLineDash([36,22]);cx.lineDashOffset=-now/35;cx.strokeRect(6,6,MW-12,MH-12);
 cx.restore()}

/* --------------------------------------------------------------- WALLS */
function walls(now,hw,hh){
 const P=pal();ensure();
 const x0=cam.x-hw-90,x1=cam.x+hw+90,y0=cam.y-hh-90,y1=cam.y+hh+90,FH=12;
 const L=[];for(const w of WALLS){if(w[0]>x1||w[0]+w[2]<x0||w[1]>y1||w[1]+w[3]<y0)continue;L.push(w)}
 // soft contact shadows
 cx.fillStyle='rgba(0,0,10,.30)';for(const[x,y,w,h]of L)cx.fillRect(x+7,y+11,w+3,h+FH+3);
 const tp=pulse(now,900);
 for(const[x,y,w,h]of L){
  // vertical face (gives the wall real height)
  let g=cx.createLinearGradient(0,y+h,0,y+h+FH);g.addColorStop(0,P.faceTop);g.addColorStop(1,P.faceBot);
  cx.fillStyle=g;cx.fillRect(x,y+h,w,FH);
  cx.fillStyle='rgba(0,0,0,.28)';for(let xx=x+20;xx<x+w-4;xx+=40)cx.fillRect(xx,y+h,1.6,FH);
  // brick top
  cx.save();cx.translate(x,y);cx.fillStyle=TEX.wp;cx.fillRect(0,0,w,h);cx.restore();
  g=cx.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'rgba(255,255,255,.26)');g.addColorStop(.35,'rgba(255,255,255,.04)');g.addColorStop(1,'rgba(0,0,12,.30)');
  cx.fillStyle=g;cx.fillRect(x,y,w,h);
  // lit edges
  cx.fillStyle=P.edgeHi;cx.globalAlpha=.85;cx.fillRect(x,y,w,2.5);cx.globalAlpha=.5;cx.fillRect(x,y,2.5,h);
  cx.fillStyle=P.edgeLo;cx.globalAlpha=.7;cx.fillRect(x+w-2.5,y,2.5,h);cx.globalAlpha=1;
  // corner pillars with rivets
  for(const[a,b]of[[x,y],[x+w-11,y],[x,y+h-11],[x+w-11,y+h-11]]){const pg=cx.createLinearGradient(a,b,a+11,b+11);pg.addColorStop(0,'rgba(255,255,255,.34)');pg.addColorStop(1,'rgba(0,0,0,.30)');cx.fillStyle=pg;cx.fillRect(a,b,11,11);cx.fillStyle=P.trim2;cx.globalAlpha=.9;cx.beginPath();cx.arc(a+5.5,b+5.5,1.7,0,TAU);cx.fill();cx.globalAlpha=1}
  // glowing trim along the base of the face
  cx.save();cx.globalCompositeOperation='lighter';
  cx.fillStyle=P.trim;cx.globalAlpha=.55+.25*tp;cx.fillRect(x+3,y+h+1,w-6,2.6);
  cx.globalAlpha=.9;cx.fillStyle=P.trim2;const off=(now/26)%46;for(let xx=x+3-46+off;xx<x+w-9;xx+=46){const a=Math.max(x+3,xx),b=Math.min(x+w-3,xx+16);if(b>a)cx.fillRect(a,y+h+1,b-a,2.6)}
  cx.globalAlpha=.06+.03*tp;cx.strokeStyle=P.trim;cx.lineWidth=9;cx.strokeRect(x-4,y-4,w+8,h+FH+8);
  cx.restore();cx.globalAlpha=1}
 // braziers
 cx.save();
 for(const[tx,ty,sd]of TEX.torches){if(tx<x0||tx>x1||ty<y0||ty>y1)continue;brazier(tx,ty,now,sd,P)}
 cx.restore()}

function brazier(x,y,now,sd,P){
 const f=Math.sin(now/90+sd*3.1)*.5+Math.sin(now/53+sd*1.7)*.5;
 cx.save();cx.translate(x,y);
 cx.fillStyle='#0c0a10';cx.beginPath();cx.arc(0,1,8.5,0,TAU);cx.fill();
 cx.strokeStyle=P.trim;cx.lineWidth=1.8;cx.beginPath();cx.arc(0,1,8.5,0,TAU);cx.stroke();
 cx.globalCompositeOperation='lighter';
 for(const[r,h,col,a]of[[8.5,25,P.flame,.7],[5.8,18,'#ff9a3a',.55],[3,11,'#ffe9b0',.7]]){
  cx.globalAlpha=a;cx.fillStyle=col;cx.beginPath();cx.moveTo(-r,2);
  cx.quadraticCurveTo(-r*.9,-h*.5+f*2,f*3.2,-h-f*2);cx.quadraticCurveTo(r*.9,-h*.5-f*2,r,2);cx.arc(0,2,r,0,Math.PI);cx.fill()}
 cx.globalAlpha=.30+.10*f;if(!LQ())cx.drawImage(glowSpr(P.flame),-125,-125,250,250);
 cx.globalAlpha=.35;cx.drawImage(glowSpr(P.flame),-24,-28,48,48);
 if(!Q()&&Math.random()<.05)parts.push({x:x+(Math.random()-.5)*8,y:y-10,vx:(Math.random()-.5)*20,vy:-40-Math.random()*40,l:.9,m:.9,c:P.flame,s:3,g:1,sh:1});
 cx.restore()}

/* --------------------------------------------------------- pads & coins */
function pads(list,tm){
 if(!list)return;cx.save();cx.globalCompositeOperation='lighter';
 for(const k of list){if(!k.on)continue;if(Math.abs(k.x-cam.x)>innerWidth/2/S+130||Math.abs(k.y-cam.y)>innerHeight/2/S+130)continue;
  const c=PKC[k.t]||'#ffe066',p=Math.sin(tm*3+k.x)*.5+.5;
  cx.globalAlpha=.30+.18*p;cx.drawImage(glowSpr(c),k.x-96,k.y-96,192,192);
  if(GN[k.t]){const g=cx.createLinearGradient(0,k.y-150,0,k.y);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,c);cx.globalAlpha=.20+.10*p;cx.fillStyle=g;cx.fillRect(k.x-20,k.y-150,40,150)}}
 cx.restore()}
function coin(x,y,now,id,big){
 cx.save();cx.globalCompositeOperation='lighter';
 cx.globalAlpha=.55;cx.drawImage(glowSpr('#ffc83a'),x-(big?34:24),y-(big?34:24),big?68:48,big?68:48);
 const t=((now/1700)+id*.37)%1;if(t<.3){const a=Math.sin(t/.3*Math.PI);cx.globalAlpha=a;cx.strokeStyle='#fff6c8';cx.lineWidth=1.6;cx.beginPath();cx.moveTo(x-9*a,y-5);cx.lineTo(x+9*a,y-5);cx.moveTo(x,y-14*a-5);cx.lineTo(x,y+14*a-5);cx.stroke()}
 cx.restore()}

/* ------------------------------------------------------------- bullets */
function bullet(b,x,y,l){
 const h=b.h,nx=b.vx/l,ny=b.vy/l,len=54;
 cx.save();cx.globalCompositeOperation='lighter';cx.lineCap='round';
 let g=cx.createLinearGradient(x,y,x-nx*len,y-ny*len);
 g.addColorStop(0,`hsla(${h},100%,68%,.85)`);g.addColorStop(.45,`hsla(${h},100%,55%,.30)`);g.addColorStop(1,`hsla(${h},100%,50%,0)`);
 cx.strokeStyle=g;cx.lineWidth=9;cx.beginPath();cx.moveTo(x,y);cx.lineTo(x-nx*len,y-ny*len);cx.stroke();
 g=cx.createLinearGradient(x,y,x-nx*len*.7,y-ny*len*.7);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(1,`hsla(${h},100%,80%,0)`);
 cx.strokeStyle=g;cx.lineWidth=3.2;cx.beginPath();cx.moveTo(x,y);cx.lineTo(x-nx*len*.7,y-ny*len*.7);cx.stroke();
 cx.globalAlpha=.9;cx.drawImage(hueSpr(h),x-19,y-19,38,38);
 cx.restore();cx.fillStyle='#fff';cx.beginPath();cx.arc(x,y,3.2,0,TAU);cx.fill()}

/* ------------------------------------------------------------- players */
function under(p,v,now){
 cx.save();cx.globalCompositeOperation='lighter';
 const me=p.id==myId;
 cx.globalAlpha=me?.5:.34;cx.drawImage(hueSpr(p.hue),v.x-56,v.y-56,112,112);
 if(p.inv>0){cx.globalAlpha=.6;cx.strokeStyle=`hsl(${p.hue} 100% 75%)`;cx.lineWidth=3;cx.beginPath();cx.arc(v.x,v.y,R+12+Math.sin(now/90)*2,0,TAU);cx.stroke()}
 cx.restore()}
function tag(p,v,now,dt){
 const w=50,h=7,x=v.x-w/2,y=v.y-R-20,hp=Math.max(0,v.hs),k=hp/100;
 v.hl=v.hl==null?hp:Math.max(hp,v.hl-55*(dt||.016));
 cx.save();
 cx.fillStyle='rgba(5,9,15,.82)';cx.beginPath();cx.roundRect(x-2,y-2,w+4,h+4,5);cx.fill();
 cx.strokeStyle='rgba(255,255,255,.2)';cx.lineWidth=1;cx.stroke();
 if(v.hl>hp){cx.fillStyle='#ffeeee';cx.globalAlpha=.85;cx.beginPath();cx.roundRect(x,y,w*v.hl/100,h,3);cx.fill();cx.globalAlpha=1}
 const g=cx.createLinearGradient(0,y,0,y+h),lo=k<=.25;
 if(lo){g.addColorStop(0,'#ff8a7a');g.addColorStop(1,'#d8321f')}else if(k<=.5){g.addColorStop(0,'#ffe27a');g.addColorStop(1,'#e8a41c')}else{g.addColorStop(0,'#8bffae');g.addColorStop(1,'#25b85c')}
 cx.fillStyle=g;if(lo)cx.globalAlpha=.75+.25*Math.sin(now/110);cx.beginPath();cx.roundRect(x,y,Math.max(2,w*k),h,3);cx.fill();cx.globalAlpha=1;
 cx.fillStyle='rgba(255,255,255,.35)';cx.fillRect(x+1,y+1,Math.max(0,w*k-2),1.8);
 cx.fillStyle='rgba(0,0,0,.4)';for(let i=1;i<4;i++)cx.fillRect(x+w*i/4-.5,y,1,h);
 cx.font='bold 12px "Trebuchet MS",sans-serif';cx.textAlign='center';cx.textBaseline='alphabetic';cx.lineJoin='round';
 cx.lineWidth=3.5;cx.strokeStyle='rgba(0,0,0,.8)';cx.strokeText(p.name,v.x,y-6);
 cx.fillStyle=p.id==myId?'#ffd25a':'#f2f7fb';cx.fillText(p.name,v.x,y-6);
 cx.restore()}

/* --------------------------------------------------- particles & effects */
function partsDraw(list,dt){
 const cap=LITE?220:[220,320,450][gfx()];if(list.length>cap)list.splice(0,list.length-cap);
 const fd=Math.pow(.93,dt*60);
 for(const q of list){
  q.l-=dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.vx*=fd;q.vy*=fd;
  if(q.vr)q.rot=(q.rot||0)+q.vr*dt;
  const k=Math.max(0,q.l/q.m);let s=q.s;
  if(q.gr)s+=q.gr*(1-k);if(q.sh)s*=k;
  if(q.g){cx.globalCompositeOperation='lighter';cx.globalAlpha=k;const r=s*2.6;cx.drawImage(glowSpr(q.c,64),q.x-r,q.y-r,r*2,r*2);cx.globalCompositeOperation='source-over'}
  else if(q.cas){cx.save();cx.translate(q.x,q.y);cx.rotate(q.rot||0);cx.globalAlpha=Math.min(1,k*2);cx.fillStyle=q.c;cx.fillRect(-q.s,-q.s*.45,q.s*2,q.s*.9);cx.fillStyle='rgba(255,255,255,.55)';cx.fillRect(-q.s,-q.s*.45,q.s*2,q.s*.3);cx.restore()}
  else if(q.rd){cx.globalAlpha=k*(q.a0==null?.5:q.a0);cx.fillStyle=q.c;cx.beginPath();cx.arc(q.x,q.y,s,0,TAU);cx.fill()}
  else{cx.globalAlpha=k;cx.fillStyle=q.c;cx.fillRect(q.x-s/2,q.y-s/2,s,s)}}
 cx.globalAlpha=1}
function ringsDraw(list,dt){
 cx.save();cx.globalCompositeOperation='lighter';
 for(const r of list){r.l-=dt;r.r+=(r.g||160)*dt;const k=Math.max(0,r.l/r.m);if(r.r<=0)continue;
  cx.strokeStyle=r.c;cx.globalAlpha=k*.28;cx.lineWidth=10*k+4;cx.beginPath();cx.arc(r.x,r.y,r.r,0,TAU);cx.stroke();
  cx.globalAlpha=k;cx.lineWidth=2+3*k;cx.beginPath();cx.arc(r.x,r.y,r.r,0,TAU);cx.stroke()}
 cx.restore()}
function textsDraw(list,dt){
 for(const q of list){q.l-=dt;q.y-=38*dt;if(q.m==null)q.m=q.l;
  const age=q.m-q.l,pop=age<.14?1+.9*(1-age/.14):1;
  cx.save();cx.translate(q.x,q.y);cx.scale(pop,pop);cx.globalAlpha=Math.min(1,q.l*2.5);
  cx.font='bold 18px "Trebuchet MS",sans-serif';cx.textAlign='center';cx.lineJoin='round';
  cx.lineWidth=4;cx.strokeStyle='rgba(0,0,0,.85)';cx.strokeText(q.t,0,0);
  cx.shadowColor=q.c;cx.shadowBlur=Q()?0:10;cx.fillStyle=q.c;cx.fillText(q.t,0,0);cx.restore()}
 cx.globalAlpha=1}

/* ambient motes: fireflies in the courtyard, rising embers in the wastes */
function ambient(now,dt,hw,hh){
 const P=pal(),n=Q()?Math.floor(P.flyN/2):P.flyN;
 while(amb.length<n)amb.push({x:cam.x+(Math.random()-.5)*hw*2.4,y:cam.y+(Math.random()-.5)*hh*2.4,ph:Math.random()*9,sp:.5+Math.random(),z:.5+Math.random()});
 amb.length=n;
 cx.save();cx.globalCompositeOperation='lighter';
 for(const a of amb){
  if(P.rise){a.y-=(16+a.z*30)*dt;a.x+=Math.sin(now/900+a.ph)*14*dt}else{a.x+=Math.cos(now/1500*a.sp+a.ph)*18*dt;a.y+=Math.sin(now/1300*a.sp+a.ph*1.3)*14*dt}
  if(a.x<cam.x-hw*1.25||a.x>cam.x+hw*1.25||a.y<cam.y-hh*1.25||a.y>cam.y+hh*1.25){a.x=cam.x+(Math.random()-.5)*hw*2.4;a.y=P.rise?cam.y+hh*1.2:cam.y+(Math.random()-.5)*hh*2.4}
  const tw=.25+.75*pulse(now,500/a.sp,a.ph),r=(2.6+a.z*3);
  cx.globalAlpha=tw*.85;cx.drawImage(glowSpr(P.fly,64),a.x-r*2,a.y-r*2,r*4,r*4)}
 cx.restore()}
function flashesDraw(dt){
 cx.save();cx.globalCompositeOperation='lighter';
 for(let i=flashes.length-1;i>=0;i--){const f=flashes[i];f.l-=dt;if(f.l<=0){flashes.splice(i,1);continue}
  const k=f.l/f.m;cx.globalAlpha=Math.min(1,k*1.3);const r=f.r*(1.15-.3*k);cx.drawImage(glowSpr(f.c),f.x-r,f.y-r,r*2,r*2)}
 cx.restore()}

/* screen-space finish: vignette, player spotlight, low-health pulse */
function post(now,dt,m,hw,hh){
 if(dt>0){emaDt+=(Math.min(dt,.1)-emaDt)*.05;if(emaDt>1/38&&!window.BFX_NOLITE){slowT+=dt;if(slowT>2.5)LITE=1}else slowT=Math.max(0,slowT-dt)}
 try{flashesDraw(dt);if(!LITE&&gfx()>0)ambient(now,dt,hw,hh)}catch(e){}
 const W=cv.width,H=cv.height,P=pal(),key=W+'x'+H+'|'+LV;
 if(vigKey!==key){
  const w=Math.max(8,W>>2),h=Math.max(8,H>>2);vigC=mk(w,h);const g=vigC.getContext('2d'),rg=g.createRadialGradient(w/2,h/2,Math.min(w,h)*.30,w/2,h/2,Math.hypot(w,h)*.55);
  const c=P.vig;rg.addColorStop(0,`rgba(${c},0)`);rg.addColorStop(.6,`rgba(${c},.20)`);rg.addColorStop(1,`rgba(${c},.78)`);g.fillStyle=rg;g.fillRect(0,0,w,h);vigKey=key}
 cx.save();cx.setTransform(1,0,0,1,0,0);
 cx.globalAlpha=1;cx.drawImage(vigC,0,0,W,H);
 if(m&&m.al&&m.hp<40){const k=(40-m.hp)/40,pl=.5+.5*Math.sin(now/(150+m.hp*6));const g=cx.createRadialGradient(W/2,H/2,Math.min(W,H)*.32,W/2,H/2,Math.hypot(W,H)*.6);g.addColorStop(0,'rgba(255,30,20,0)');g.addColorStop(1,`rgba(255,30,20,${(.20+.34*pl)*k})`);cx.fillStyle=g;cx.fillRect(0,0,W,H)}
 if(hurtT>0){hurtT=Math.max(0,hurtT-dt*2.4);const g=cx.createRadialGradient(W/2,H/2,Math.min(W,H)*.38,W/2,H/2,Math.hypot(W,H)*.6);g.addColorStop(0,'rgba(255,40,30,0)');g.addColorStop(1,`rgba(255,40,30,${.22*hurtT})`);cx.fillStyle=g;cx.fillRect(0,0,W,H)}
 cx.restore()}

function zoom(dt){punchZ*=Math.pow(.015,dt);if(punchZ<.0004)punchZ=0;return punchZ}

/* ------------------------------------------------------------- events */
const rnd=(a,b)=>a+Math.random()*(b-a);
function sparks(x,y,col,n,sp,l,s,up){
 const f=Q()?.5:1;n=Math.ceil(n*f);
 for(let i=0;i<n;i++){const a=Math.random()*TAU,v=sp*(.3+Math.random()*.9);parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-(up||0),l:l*(.6+Math.random()*.6),m:l,c:col,s:s*(.6+Math.random()*.8),g:1,sh:1})}}
function ev(e){
 const hue=e.h!=null?e.h:40,hc=`hsl(${hue} 100% 62%)`;
 switch(e.k){
 case 'shot':{
  const a=e.a,cs=Math.cos(a),sn=Math.sin(a),mx=e.x+cs*36,my=e.y+sn*36,big=e.w=='shotgun'||e.w=='rifle';
  flashes.push({x:mx,y:my,r:big?125:80,l:.10,m:.10,c:'#ffcf7a'});
  flashes.push({x:mx,y:my,r:big?60:38,l:.06,m:.06,c:'#ffffff'});
  const sh=e.w=='shotgun';
  parts.push({x:e.x+cs*8-sn*6,y:e.y+sn*8+cs*6,vx:-sn*rnd(110,200)+cs*rnd(-30,30),vy:cs*rnd(110,200)+sn*rnd(-30,30),l:.9,m:.9,c:sh?'#ff5a4a':'#ffcf6a',s:sh?4:3,cas:1,rot:rnd(0,6),vr:rnd(-22,22)});
  parts.push({x:mx,y:my,vx:cs*50+rnd(-14,14),vy:sn*50+rnd(-14,14),l:.55,m:.55,c:'#cfd8e3',s:5,gr:15,rd:1,a0:.22});
  sparks(mx,my,'#ffb54a',big?7:4,300,.22,3.2);
  if(e.id==myId)punchZ=Math.min(.06,punchZ+(sh?.012:e.w=='rifle'?.01:.0025));
  break}
 case 'hit':{
  flashes.push({x:e.x,y:e.y,r:56,l:.12,m:.12,c:hc});
  sparks(e.x,e.y,hc,7,300,.38,3.4);sparks(e.x,e.y,'#ffffff',3,380,.22,2.6);
  if(e.id==myId){hurtT=Math.min(1,hurtT+.45);punchZ=Math.min(.06,punchZ+.014)}
  break}
 case 'spark':sparks(e.x,e.y,'#ffe0a0',4,260,.22,2.6);break;
 case 'kill':{
  flashes.push({x:e.x,y:e.y,r:300,l:.28,m:.28,c:hc},{x:e.x,y:e.y,r:150,l:.18,m:.18,c:'#ffffff'});
  decals.push({x:e.x,y:e.y,r:74,l:14,m:14,c:hc});if(decals.length>34)decals.shift();
  sparks(e.x,e.y,hc,24,560,.9,4.4);sparks(e.x,e.y,'#ffffff',10,420,.5,3);
  for(let i=0;i<10;i++)parts.push({x:e.x+rnd(-12,12),y:e.y+rnd(-12,12),vx:rnd(-34,34),vy:rnd(-110,-40),l:1.3,m:1.3,c:hc,s:4,g:1,sh:1});
  parts.push({x:e.x,y:e.y,vx:0,vy:-12,l:.9,m:.9,c:'#8e99a8',s:10,gr:34,rd:1,a0:.3});
  rings.push({x:e.x,y:e.y,r:6,l:.42,m:.42,c:'#ffffff',g:760});
  if(e.ai==myId||e.bi==myId)punchZ=Math.min(.06,punchZ+.05);
  break}
 case 'pick':{
  const c=(typeof PKC!='undefined'&&PKC[e.t])||'#ffe066';
  flashes.push({x:e.x,y:e.y,r:110,l:.25,m:.25,c});
  for(let i=0;i<12;i++)parts.push({x:e.x+rnd(-18,18),y:e.y+rnd(-4,10),vx:rnd(-28,28),vy:rnd(-190,-70),l:.85,m:.85,c,s:3.6,g:1,sh:1});
  rings.push({x:e.x,y:e.y,r:10,l:.4,m:.4,c,g:230});
  break}
 case 'dash':{
  flashes.push({x:e.x,y:e.y,r:90,l:.16,m:.16,c:hc});sparks(e.x,e.y,hc,10,380,.3,3.2);
  parts.push({x:e.x,y:e.y,vx:0,vy:0,l:.45,m:.45,c:'#c9d6e6',s:9,gr:30,rd:1,a0:.2});break}
 case 'spawn':{
  flashes.push({x:e.x,y:e.y,r:200,l:.45,m:.45,c:hc});
  for(let i=0;i<10;i++){const a=i/10*TAU;parts.push({x:e.x+Math.cos(a)*50,y:e.y+Math.sin(a)*50,vx:-Math.cos(a)*90,vy:-Math.sin(a)*90,l:.5,m:.5,c:hc,s:3.4,g:1,sh:1})}
  break}
 case 'boom':{
  flashes.push({x:e.x,y:e.y,r:480,l:.4,m:.4,c:'#ffb23a'},{x:e.x,y:e.y,r:240,l:.22,m:.22,c:'#ffffff'});
  decals.push({x:e.x,y:e.y,r:150,l:20,m:20,c:'#ff7a2a'});if(decals.length>34)decals.shift();
  sparks(e.x,e.y,'#ffa23a',34,640,1,5,0);
  for(let i=0;i<9;i++)parts.push({x:e.x+rnd(-26,26),y:e.y+rnd(-26,26),vx:rnd(-60,60),vy:rnd(-80,20),l:1.4,m:1.4,c:'#59606c',s:12,gr:46,rd:1,a0:.34});
  rings.push({x:e.x,y:e.y,r:8,l:.5,m:.5,c:'#ffffff',g:900});
  break}
 case 'chest':case 'upg':{
  const c='#ffc83a';flashes.push({x:e.x,y:e.y,r:200,l:.35,m:.35,c});
  for(let i=0;i<(e.k=='chest'?26:14);i++)parts.push({x:e.x+rnd(-16,16),y:e.y,vx:rnd(-90,90),vy:rnd(-300,-90),l:1,m:1,c,s:4,g:1,sh:1});
  break}
 case 'thit':case 'rhit':sparks(e.x,e.y,hc,6,260,.3,3);break;
 case 'tdie':flashes.push({x:e.x,y:e.y,r:200,l:.22,m:.22,c:hc});sparks(e.x,e.y,hc,18,480,.7,4);break;
 }}

window.BFX={floor,walls,pads,coin,bullet,under,tag,parts:partsDraw,rings:ringsDraw,texts:textsDraw,post,zoom,ev,
 reset(){LITE=0;slowT=0;flashes.length=0;decals.length=0;amb.length=0;punchZ=0;hurtT=0}};
})();
