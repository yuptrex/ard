/* ============ NETWORK LAYER (Firebase Realtime Database) ============
 Rooms are identified by a 5-character code that the host's game creates for them.
 Database layout:
  rooms/<CODE>/host        host's player id (the whole room is removed automatically if the host disconnects)
  rooms/<CODE>/st          latest dynamic snapshot (JSON string, ~20 Hz, host writes / clients listen)
  rooms/<CODE>/wd          world data: pickups, chests, coins, roster (JSON string, written only when it changes)
  rooms/<CODE>/in/<id>     latest input of one client (JSON string, client writes / host listens)
 Messages are stored as JSON strings on purpose: Realtime Database drops empty arrays/objects
 and rewrites arrays as objects, which would corrupt the snapshots. */
const FB_CONFIG={apiKey:"AIzaSyAcI5-kdznUDJ0j_R3baEXZ99mErRhlfUY",authDomain:"cloud-3eacc.firebaseapp.com",
 databaseURL:"https://cloud-3eacc-default-rtdb.asia-southeast1.firebasedatabase.app",projectId:"cloud-3eacc",
 storageBucket:"cloud-3eacc.firebasestorage.app",messagingSenderId:"294209249530",appId:"1:294209249530:web:3619cee4052f8749aa2943"};
let FBdb=null;
function fbInit(){try{if(FBdb)return FBdb;if(typeof firebase=='undefined')return null;
 if(!firebase.apps.length)firebase.initializeApp(FB_CONFIG);FBdb=firebase.database();return FBdb}catch(e){return null}}
const ROOM_ALPHA='ABCDEFGHJKMNPQRSTUVWXYZ23456789',ROOM_RE=/^[A-HJ-KM-NP-Z2-9]{5}$/;
function cleanRoom(r){return String(r||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5)}
function genRoom(){const a=new Uint8Array(5);if(window.crypto&&crypto.getRandomValues)crypto.getRandomValues(a);else for(let i=0;i<5;i++)a[i]=Math.random()*256;
 let s='';for(let i=0;i<5;i++)s+=ROOM_ALPHA[a[i]%ROOM_ALPHA.length];return s}
function netNote(m,bad){const x=document.getElementById('err');if(!x)return;x.textContent=m;x.style.display='block';x.style.borderColor=bad?'#ff4a3a':'#2f4252';clearTimeout(netNote.t);netNote.t=setTimeout(()=>x.style.display='none',7000)}
function netErr(e){const c=String(e&&e.code||'').toLowerCase(),m=String(e&&e.message||e||'');
 if(c.includes('permission'))return 'Firebase rules blocked the request (permission_denied). Publish database.rules.json from this package in your Firebase console.';
 if(m=='offline')return 'Cannot reach the game servers. Your network may block Firebase \u2014 try mobile data or another network, then tap the status line to retry.';
 if(m=='noanswer')return 'Connected, but the database did not answer. Check that the Realtime Database exists in your Firebase project and that database.rules.json is published.';
 return 'Online error: '+(c||m)}
/* ---- connection watcher: starts when the page loads so the status is known before the player clicks ---- */
let fbUp=false,fbPoll=0;
function setCS(st,txt){const e=document.getElementById('cs');if(!e)return;e.dataset.s=st;e.lastElementChild.textContent=txt}
function forcePoll(){try{const I=firebase.database.INTERNAL;if(I&&I.forceLongPolling&&!fbPoll){fbPoll=1;I.forceLongPolling();FBdb.goOffline();setTimeout(()=>FBdb.goOnline(),250);setCS('wait','Connecting (compatibility mode)\u2026');return true}}catch(e){}return false}
function netBoot(){
 if(!fbInit()){setCS('bad','Firebase failed to load \u2014 check your connection or ad-blocker, then reload.');return}
 FBdb.ref('.info/connected').on('value',s=>{fbUp=!!s.val();if(fbUp)setCS('ok','Online \u2014 game servers ready');else if(!fbPoll)setCS('wait','Connecting to game servers\u2026')});
 setTimeout(()=>{if(!fbUp)forcePoll()},4500);
 setTimeout(()=>{if(!fbUp)setCS('bad','Can\u2019t reach the game servers \u2014 tap to retry')},13000);
 const cs=document.getElementById('cs');
 if(cs)cs.onclick=()=>{if(fbUp)return;setCS('wait','Retrying\u2026');try{FBdb.goOffline();setTimeout(()=>FBdb.goOnline(),200)}catch(e){}forcePoll();setTimeout(()=>{if(!fbUp)setCS('bad','Can\u2019t reach the game servers \u2014 tap to retry')},9000)}}
function waitUp(ms){return new Promise((res,rej)=>{if(fbUp)return res();const t0=Date.now(),iv=setInterval(()=>{if(fbUp){clearInterval(iv);res()}else if(Date.now()-t0>ms){clearInterval(iv);rej(new Error('offline'))}},120)})}
function withTimeout(p,ms,msg){return Promise.race([p,new Promise((_,j)=>setTimeout(()=>j(new Error(msg||'noanswer')),ms))])}
/* reserve a free 5-character code atomically: two hosts can never get the same room */
async function createRoomCode(){
 for(let i=0;i<10;i++){const c=genRoom(),ref=FBdb.ref('rooms/'+c+'/host'),sn=await ref.once('value');
  if(sn.exists())continue;await ref.set(myId);return c}
 throw new Error('Could not reserve a free room code, please try again')}
async function checkRoom(code){
 const[h,i]=await Promise.all([FBdb.ref('rooms/'+code+'/host').once('value'),FBdb.ref('rooms/'+code+'/in').once('value')]);
 if(!h.exists())return'none';if(i.numChildren()>=MAXH-1)return'full';return'ok'}
class FirebaseNet{
 constructor(code,isHost){this.host=!!isHost;this.code=code;this.q=1;this.reg=0;this.bad=0;this.seenHost=0;this.link=null;this.resend=0;this.onmsg=null;
  this.root=FBdb.ref('rooms/'+code);
  const parse=v=>{try{return JSON.parse(v)}catch(e){return null}},emit=m=>{if(m&&this.onmsg)this.onmsg(m)};
  this.cref=FBdb.ref('.info/connected');
  this.cref.on('value',s=>{const on=!!s.val(),was=this.link;this.link=on;
   if(on){this.reg=0;if(this.host&&was===false)this.reclaim()}},()=>{});
  if(this.host){
   this.reclaim();
   const ir=this.root.child('in'),h=s=>{const m=parse(s.val());if(m)emit(m)};
   ir.on('child_added',h,e=>this.fail(e));ir.on('child_changed',h,e=>this.fail(e));
  }else{
   this.root.child('st').on('value',s=>emit(parse(s.val())),e=>this.fail(e));
   this.root.child('wd').on('value',s=>emit(parse(s.val())),e=>this.fail(e));
   this.root.child('host').on('value',s=>{if(s.exists()){this.seenHost=1;emit({t:'hostup'})}else if(this.seenHost)emit({t:'gone'})},e=>this.fail(e));
  }}
 /* (re)register as the room's host; also runs after a connection drop so the room comes back by itself */
 reclaim(){this.root.child('host').set(myId).catch(e=>this.fail(e));this.root.onDisconnect().remove();this.resend=1}
 fail(e){if(this.bad)return;this.bad=1;netNote(netErr(e),1)}
 send(m,str){
  const s=str||JSON.stringify(m);
  if(m.t=='st')this.root.child('st').set(s).catch(e=>this.fail(e));
  else if(m.t=='wd')this.root.child('wd').set(s).catch(e=>this.fail(e));
  else if(m.t=='in'){const r=this.root.child('in/'+m.id);if(!this.reg){this.reg=1;r.onDisconnect().remove()}r.set(s).catch(e=>this.fail(e))}
  else if(m.t=='bye'){if(this.host)this.root.remove().catch(()=>{});else this.root.child('in/'+m.id).set(s).catch(()=>{})}}
 close(){try{this.root.off();this.cref.off()}catch(e){}}}
function makeNet(room,mode){return window.CSK_HybridNet?new CSK_HybridNet(room,mode=='host'):new FirebaseNet(room,mode=='host')}


/* ============ SHARED DATA ============ */
const MW=4800,MH=3200,R=18,TICK=1/60,WIN=15,RESP=5;
const WP={pistol:{n:'Pistol',rate:.28,dmg:22,spd:760,pel:1,spr:.02,mag:12,rel:1.1,life:1.7,len:16},
smg:{n:'SMG',rate:.065,dmg:14,spd:900,pel:1,spr:.07,mag:40,rel:1.2,life:1.6,len:20},
shotgun:{n:'Shotgun',rate:.8,dmg:13,spd:700,pel:7,spr:.26,mag:6,rel:1.9,life:.8,len:22},
rifle:{n:'Rifle',rate:.55,dmg:60,spd:1300,pel:1,spr:0,mag:5,rel:2,life:1.7,len:28},
blaster:{n:'Blaster',rate:.22,dmg:66,spd:900,pel:1,spr:.015,mag:18,rel:1,life:1.7,len:24}}; // player-only starter: about 3x a pistol
const BASE1=[[1050,650,300,40],[1050,910,300,40],[400,300,40,360],[400,1000,40,300],[1960,300,40,360],[1960,940,40,360],[700,200,300,40],[1400,1360,300,40],[700,1360,300,40],[1400,200,300,40],[250,760,160,80],[1990,760,160,80],[1150,300,100,100],[1150,1200,100,100]];
const BASE2=[[300,260,380,40],[300,260,40,300],[900,200,40,300],[1100,500,300,40],[700,800,300,40],[1300,800,40,300],[600,1200,300,40],[1000,1250,40,250],[1700,400,260,40],[1700,400,40,260],[1700,1100,300,40],[1900,700,40,300],[250,1000,100,100],[1500,1350,100,100],[1500,150,200,40]];
const PKB1=[[1200,800],[300,200],[2100,200],[300,1400],[2100,1400],[1200,150],[1200,1450],[700,800],[1700,800]],CHB1=[[600,450],[1800,1200],[900,1250]];
const PKB2=[[500,450],[1000,350],[1500,600],[800,1000],[1200,1300],[300,1400],[1800,900],[1950,300],[600,700]],CHB2=[[1000,700],[1500,1000],[400,900]];
const WALLS=[],PKP=[],CHP=[],PKTY=[],DEC=[],PAT=[],CSP=[],ZN=[];let LV=0,SEED=1337;
const SWR=38,RV0=54,PS=.72; // RV0 = starting reserve rounds, PS = pickup draw scale // a gun pad can be used from R+SWR away
const BL={pistol:.1,smg:.035,shotgun:0,rifle:.35,blaster:.1},TC=60; // BL = spread bloom per shot, TC = coin cost of a sentry turret
const PKT=['hp','hp','shield','speed','smg','shotgun','rifle'];
const PKC={ammo:'#ffe066',hp:'#5fd37a',shield:'#59b8ff',speed:'#ffd24a',smg:'#ff9a4a',shotgun:'#ff5d4a',rifle:'#c58bff',kit:'#4ae0c0'};
const BOT_DMG=.25; // bot damage multiplier (1 = same as players)
const UC=[15,30,50,75,105],newUp=()=>Object.fromEntries(Object.keys(WP).map(k=>[k,[0,0,0,0]]));
const eff=p=>{const W=WP[p.w],u=p.up[p.w];return{dmg:W.dmg*(1+.2*u[0]),rate:W.rate*(1-.09*u[1]),mag:W.mag+Math.round(W.mag*.3*u[2]),rel:W.rel*(1-.12*u[3])}};
const rnd=a=>a[Math.random()*a.length|0],cl=(v,a,b)=>Math.max(a,Math.min(b,v));
function push(p){for(const[x,y,w,h]of WALLS){const cx=cl(p.x,x,x+w),cy=cl(p.y,y,y+h),dx=p.x-cx,dy=p.y-cy,d=Math.hypot(dx,dy);
 if(d<R){if(!d)p.x+=R;else{p.x=cx+dx/d*R;p.y=cy+dy/d*R}}}p.x=cl(p.x,R,MW-R);p.y=cl(p.y,R,MH-R)}
const inWall=(x,y)=>WALLS.some(([a,b,w,h])=>x>a&&x<a+w&&y>b&&y<b+h);
const rng=()=>{SEED=SEED+0x6D2B79F5|0;let t=Math.imul(SEED^SEED>>>15,1|SEED);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
function setLevel(n){LV=n;SEED=n==1?1337:9001;for(const a of[WALLS,PKP,CHP,PKTY,DEC,PAT,CSP,ZN])a.length=0;
 const BS=n==2?BASE2:BASE1,PB=n==2?PKB2:PKB1,CB=n==2?CHB2:CHB1;
 for(const qx of[0,1])for(const qy of[0,1])for(const[x,y,w,h]of BS)WALLS.push([qx?4800-x-w:x,qy?3200-y-h:y,w,h]);
 if(n==2)WALLS.push([2100,1300,240,40],[2460,1300,240,40],[2100,1860,240,40],[2460,1860,240,40],[2100,1340,40,200],[2100,1660,40,200],[2660,1340,40,200],[2660,1660,40,200]);
 else WALLS.push([2200,1450,170,30],[2430,1450,170,30],[2200,1720,170,30],[2430,1720,170,30],[2200,1450,30,110],[2200,1640,30,110],[2570,1450,30,110],[2570,1640,30,110]);
 CHP.push([2400,1600]);
 for(const qx of[0,1])for(const qy of[0,1]){for(const[x,y]of PB)PKP.push([qx?4800-x:x,qy?3200-y:y]);for(const[x,y]of CB)CHP.push([qx?4800-x:x,qy?3200-y:y])}
 ZN.push(...(n==2?[['OUTER RING',1200,800],['SALT FLATS',3600,800],['BONE YARD',1200,2400],['IRON GATE',3600,2400],['THE KEEP',2400,1250]]:[['DUST BOWL',1200,800],['GREEN ROW',3600,800],['STEEL YARD',1200,2400],['THE PIT',3600,2400],['PLAZA',2400,1100]]));
 for(let i=0;i<650;i++){const x=rng()*MW,y=rng()*MH,k=rng()*7|0,r=rng()*6.28,sc=.7+rng()*.8;if(!inWall(x,y))DEC.push({x,y,k,r,s:sc})}
 for(let i=0;i<70;i++)PAT.push({x:rng()*MW,y:rng()*MH,r:220+rng()*380,k:rng()*3|0});
 PKP.forEach((_,i)=>PKTY.push(['hp','smg','shield','shotgun','speed','rifle','hp','shield','smg'][i%9]));
 for(let i=0;i<30;i++){const ax=150+rng()*(MW-300),ay=150+rng()*(MH-300);for(let j=0;j<6;j++){const x=ax+(rng()-.5)*120,y=ay+(rng()-.5)*120;if(!inWall(x,y))CSP.push([x|0,y|0,1+(rng()*2|0)])}}
 for(let i=0;i<50;i++){const x=100+rng()*(MW-200),y=100+rng()*(MH-200);if(!inWall(x,y))CSP.push([x|0,y|0,i%9==0?10:1+(rng()*2|0)])}}
setLevel(1);

/* ============ SIMULATION (runs only on the host / solo player) ============ */
class Sim{
 constructor(onEv){this.p={};this.b=[];this.bid=0;this.fb=0;this.win=null;this.wt=0;this.onEv=onEv;this.cn=[];this.cid=0;this.ct=0;this.tr=[];this.bm=[];this.bmid=0;this.tid=0;this.ch=[];
  this.cs=CSP.map(()=>0);CSP.forEach(([x,y,v],i)=>this.cn.push({id:++this.cid,x,y,v,l:1e9,fx:i}));
  this.pk=PKP.map(([x,y],i)=>({i,x,y,t:PKTY[i],t0:PKTY[i],on:1,rt:0}));this.cr=[];this.crid=0;this.cuid=0}
 add(id,name,hue,bot){const p={id,name,hue,bot,x:0,y:0,vx:0,vy:0,hp:100,sh:0,w:'pistol',am:12,rel:0,cd:0,dc:0,dt:0,sp:0,inv:0,al:1,rs:0,k:0,d:0,ks:0,c:0,
  in:{dx:0,dy:0,a:0,f:0,d:0,r:0},ai:{t:0,s:1,px:0,py:0,sk:0,un:0,ud:0},dn:2,dg:0,bl:0,kt:0,td:0,rv:0,aq:{},at:2};this.p[id]=p;this.spawn(p)}
 spawn(p){for(let i=0;i<40;i++){p.x=R+Math.random()*(MW-2*R);p.y=R+Math.random()*(MH-2*R);
  if(inWall(p.x,p.y))continue;const q={x:p.x,y:p.y};push(q);if(Math.hypot(q.x-p.x,q.y-p.y)>1)continue;
  if(!Object.values(this.p).some(o=>o!==p&&o.al&&Math.hypot(o.x-p.x,o.y-p.y)<350))break}
  Object.assign(p,{rv:p.bot?0:RV0,hp:100,sh:0,w:p.bot?'pistol':'blaster',am:p.bot?12:18,rel:0,cd:0,sp:0,inv:1.5,al:1,vx:0,vy:0,up:newUp(),kb:'',kw:'',dn:2,dc:0,dg:0,bl:0,kt:0,td:0,mk:0,mc:0});this.ev({k:'spawn',x:p.x,y:p.y,h:p.hue,id:p.id})}
 ev(e){this.onEv(e)}
 flushAcc(p){const a=p.aq;if(!a)return;let any=0;for(const g in a)if(a[g][0]||a[g][1])any=1;if(!any)return;p.aq={};this.ev({k:'acc',id:p.id,a})}
 spawnAmmo(){if(this.pk.filter(k=>k.t=='ammo').length>=16)return;const hs=Object.values(this.p).filter(q=>q.al&&!q.bot);
  for(let n=0;n<30;n++){let x,y;if(hs.length&&Math.random()<.5){const q=rnd(hs),a=Math.random()*6.283,r=280+Math.random()*620;x=q.x+Math.cos(a)*r;y=q.y+Math.sin(a)*r}else{x=Math.random()*MW;y=Math.random()*MH}
   x=cl(x,60,MW-60);y=cl(y,60,MH-60);if(inWall(x,y))continue;this.pk.push({i:-1,x,y,t:'ammo',on:1,rt:0,d:1,l:40});return}}
 los(a,b){for(let i=1;i<14;i++){const t=i/14;if(inWall(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t))return 0}return 1}
 // ---- loot choice: score every pickup by how much THIS bot needs it, divided into distance ----
 lootFor(p){let bt=null,bs=1e9;
  const need=k=>k.t=='ammo'?0:k.t=='hp'?(p.hp<70?1.8:0):k.t=='shield'?(p.sh<25?1.3:0):k.t=='kit'?(p.kt<2?1.3:0):k.t=='speed'?.5:k.t==p.w?0:(p.w=='pistol'||p.w=='blaster')?1.5:k.t=='rifle'?1:.2;
  for(const k of this.pk){if(!k.on)continue;const n=need(k);if(n<=0)continue;const d=Math.hypot(k.x-p.x,k.y-p.y)/n;if(d<bs){bs=d;bt=k}}
  for(const q of this.ch)if(q.on){const d=Math.hypot(q.x-p.x,q.y-p.y)/1.3;if(d<bs){bs=d;bt=q}}
  for(const q of this.cr){let n=0;for(const k of q.it)n=Math.max(n,k.t=='coin'?1.2:need(k));if(n<=0)continue;const d=Math.hypot(q.x-p.x,q.y-p.y)/n;if(d<bs){bs=d;bt=q}}
  for(const q of this.cn){const d=Math.hypot(q.x-p.x,q.y-p.y)/(q.v>=10?2:.9)-60;if(d<bs){bs=d;bt=q}}
  return bt}
 ai(p,dt){const a=p.ai,i=p.in,P=Object.values(this.p);let tg=null,bs=1e9;
  for(const o of P){if(o===p||!o.al)continue;const s=Math.hypot(o.x-p.x,o.y-p.y)*(o.hp+o.sh<35?.75:1);if(s<bs){bs=s;tg=o}}
  {let tb=tg?Math.hypot(tg.x-p.x,tg.y-p.y):1e9;for(const t of this.tr){if(t.o==p.id)continue;const d=Math.hypot(t.x-p.x,t.y-p.y);if(d<Math.min(tb,520)&&this.los(p,t)){tb=d;tg={x:t.x,y:t.y,vx:0,vy:0,hp:t.hp,sh:0,al:1}}}}
  i.f=0;i.d=0;i.r=0;i.t=0;i.u=Math.random()<.03?(Math.random()*4|0)+1:0;a.t-=dt;if(a.t<=0){a.t=.4+Math.random();a.s=Math.random()<.5?1:-1}
  // anti-stuck: if it tried to move but barely did for half a second, break off in a random direction
  a.sk-=dt;if(a.sk<=0){a.sk=.5;if(Math.hypot(p.x-a.px,p.y-a.py)<14&&Math.abs(i.dx)+Math.abs(i.dy)>0){a.un=.7;a.ud=Math.random()*6.28}a.px=p.x;a.py=p.y}
  const E=WP[p.w];let th=0;for(const o of P)if(o!==p&&o.al&&Math.hypot(o.x-p.x,o.y-p.y)<520&&this.los(p,o))th++;
  const bd=tg?Math.hypot(tg.x-p.x,tg.y-p.y):1e9,vis=tg&&this.los(p,tg),low=p.hp+p.sh*.6<42||(th>=3&&p.hp<70);let mx=0,my=0;
  // aim: lead the target by bullet travel time; sloppier at range
  if(tg){const sp=E.spd;let tt=bd/sp;tt=Math.hypot(tg.x+tg.vx*tt-p.x,tg.y+tg.vy*tt-p.y)/sp;i.a=Math.atan2(tg.y+tg.vy*tt*.85-p.y,tg.x+tg.vx*tt*.85-p.x)+(Math.random()-.5)*(.09+bd/4500)}
  const ang=tg?Math.atan2(tg.y-p.y,tg.x-p.x):0,cs=Math.cos(ang),sn=Math.sin(ang);
  if(low&&tg){ // ESCAPE: head for the nearest medkit/shield, else run away strafing; dash out of fire, drop a turret as a rear guard
   const k=this.pk.filter(q=>q.on&&(q.t=='hp'||q.t=='shield')).sort((u,v)=>Math.hypot(u.x-p.x,u.y-p.y)-Math.hypot(v.x-p.x,v.y-p.y))[0];
   if(k&&Math.hypot(k.x-p.x,k.y-p.y)<1100){const g=Math.atan2(k.y-p.y,k.x-p.x);mx=Math.cos(g);my=Math.sin(g)}else{mx=-cs-sn*a.s*.6;my=-sn+cs*a.s*.6}
   if(vis&&bd<420&&p.dn>0&&Math.random()<.06)i.d=1;
   if(vis&&bd<480&&(p.kt>0||p.c>=TC)&&p.td<=0&&Math.random()<.05)i.t=1}
  else if(tg&&bd<900){ // FIGHT
   if(bd<260){mx=-cs;my=-sn}else if(bd>(p.w=='shotgun'?340:560)){mx=cs;my=sn}
   mx-=sn*a.s*.8;my+=cs*a.s*.8;
   if(vis&&bd<560&&p.td<=0&&(p.kt>0||p.c>=TC+30)&&Math.random()<.004)i.t=1;
   if(vis&&bd<500&&p.dn>1&&Math.random()<.004)i.d=1}
  else{const t=this.lootFor(p);if(t){const g=Math.atan2(t.y-p.y,t.x-p.x);mx=Math.cos(g);my=Math.sin(g)}else if(tg){mx=cs;my=sn}}
  if(a.un>0){a.un-=dt;mx=Math.cos(a.ud);my=Math.sin(a.ud)}
  const l0=Math.hypot(mx,my);if(l0){mx/=l0;my/=l0;if(inWall(p.x+mx*54,p.y+my*54)){const sd=a.s;for(const r of[.8*sd,-.8*sd,1.57*sd,-1.57*sd,2.4*sd,-2.4*sd]){const c=Math.cos(r),s=Math.sin(r),rx=mx*c-my*s,ry=mx*s+my*c;if(!inWall(p.x+rx*54,p.y+ry*54)){mx=rx;my=ry;break}}}}
  i.dx=mx;i.dy=my;if(!tg)return;
  i.f=vis&&bd<(p.w=='rifle'?1100:p.w=='shotgun'?450:800)?1:0;
  if(!vis||bd>700)i.r=p.am<E.mag*.5?1:0}
 // ---- DEFENCE: sentry turrets. Auto-target enemies (never the owner) with line of sight, lead their movement, can be shot down ----
 deploy(p){if(p.td>0||(p.kt<1&&p.c<TC))return;const mine=this.tr.filter(t=>t.o==p.id);if(mine.length>=2)this.tr.splice(this.tr.indexOf(mine[0]),1);
  let x=p.x+Math.cos(p.in.a)*52,y=p.y+Math.sin(p.in.a)*52;if(inWall(x,y)||x<20||y<20||x>MW-20||y>MH-20){x=p.x;y=p.y}
  if(p.kt>0)p.kt--;else p.c-=TC;p.td=6;this.tr.push({id:++this.tid,o:p.id,x,y,a:p.in.a,hp:120,mh:120,l:30,cd:.4,h:p.hue});this.ev({k:'tdep',x,y,h:p.hue,id:p.id})}
 ropeAct(p){if(!p.al)return;if(p.rp){p.rp=null;p.rc=1.2;return}if(p.rc>0)return;p.rp={x:p.x,y:p.y,a:p.in.a,st:0,d:0,t:0,tg:null};this.ev({k:'rope',x:p.x,y:p.y,h:p.hue,id:p.id})}
 ropeEnd(p,cd){p.rp=null;p.rc=cd}
 ropes(dt){for(const p of Object.values(this.p)){p.rc=Math.max(0,(p.rc||0)-dt);const r=p.rp;if(!r)continue;if(!p.al){p.rp=null;continue}r.t+=dt;
  if(r.st==0){const n=Math.ceil(1700*dt/16),sl=1700*dt/n;
   for(let i=0;i<n&&r.st==0;i++){r.x+=Math.cos(r.a)*sl;r.y+=Math.sin(r.a)*sl;r.d+=sl;
    if(r.x<0||r.y<0||r.x>MW||r.y>MH||inWall(r.x,r.y)){r.st=1;r.t=0;r.x=cl(r.x,0,MW);r.y=cl(r.y,0,MH);this.ev({k:'rhit',x:r.x,y:r.y,h:p.hue});break}
    for(const q of Object.values(this.p)){if(!q.al||q.id==p.id||Math.hypot(q.x-r.x,q.y-r.y)>R+6)continue;r.st=2;r.t=0;r.tg=q.id;this.hurt(q,20,p);this.ev({k:'rhit',x:q.x,y:q.y,h:q.hue});break}
    if(r.st==0)for(const t of this.tr){if(t.o==p.id||Math.hypot(t.x-r.x,t.y-r.y)>26)continue;t.hp-=30;t.lb=p.id;r.st=3;r.t=0;this.ev({k:'rhit',x:t.x,y:t.y,h:p.hue});break}
    if(r.st==0&&r.d>=560){r.st=3;r.t=0}}}
  else if(r.st==1){const dx=r.x-p.x,dy=r.y-p.y,d=Math.hypot(dx,dy);if(d<R+8||r.t>1.2){this.ropeEnd(p,1.5);continue}
   const s=Math.min(d,950*dt),ox=p.x,oy=p.y;p.x+=dx/d*s;p.y+=dy/d*s;push(p);if(Math.hypot(p.x-ox,p.y-oy)<s*.25)this.ropeEnd(p,1.5)}
  else if(r.st==2){const q=this.p[r.tg];if(!q||!q.al||r.t>1.2){this.ropeEnd(p,1.5);continue}
   const dx=p.x-q.x,dy=p.y-q.y,d=Math.hypot(dx,dy);if(d<2*R+4){this.ropeEnd(p,1.5);continue}
   const s=Math.min(d,800*dt);q.x+=dx/d*s;q.y+=dy/d*s;push(q);r.x=q.x;r.y=q.y}
  else{const dx=p.x-r.x,dy=p.y-r.y,d=Math.hypot(dx,dy);if(d<20||r.t>.5){this.ropeEnd(p,.8);continue}const s=Math.min(d,2500*dt);r.x+=dx/d*s;r.y+=dy/d*s}}}
 bombAct(p){if(!p.al)return;const m=this.bm.find(b=>b.o==p.id&&b.st==0);if(m){this.boom(m,p);return}
  this.bm.push({id:++this.bmid,o:p.id,x:p.x,y:p.y,st:0,l:0,h:p.hue});this.ev({k:'bplace',x:p.x,y:p.y,h:p.hue,id:p.id})}
 boom(b,by){const i=this.bm.indexOf(b);if(i>=0)this.bm.splice(i,1);const RB=150;
  for(const q of Object.values(this.p)){if(!q.al)continue;const d=Math.hypot(q.x-b.x,q.y-b.y);if(d>=RB||!this.los(b,q))continue;this.hurt(q,Math.max(1,Math.round(90*(1-d/RB)*(q.id==b.o?.5:1))),by)}
  for(const t of this.tr){const d=Math.hypot(t.x-b.x,t.y-b.y);if(d<RB&&this.los(b,t)){t.hp-=Math.round(120*(1-d/RB*.5));t.lb=b.o}}
  this.ev({k:'boom',x:b.x,y:b.y,h:b.h,id:b.o})}
 bombs(dt){for(const b of this.bm.slice()){if(b.st){b.l-=dt;if(b.l<=0)this.bm.splice(this.bm.indexOf(b),1);continue}
  const p=this.p[b.o],n=p&&p.in||{},vx=n.vx||520,vy=n.vy||320,kx=n.kx!=null?n.kx:p&&p.x,ky=n.ky!=null?n.ky:p&&p.y;
  if(!p||!p.al||Math.abs(b.x-kx)>vx||Math.abs(b.y-ky)>vy){b.st=1;b.l=4;this.ev({k:'bdud',x:b.x,y:b.y,id:b.o})}}}
 turrets(dt){for(const t of this.tr){t.l-=dt;t.cd-=dt;let tg=null,bd=700;
   for(const o of Object.values(this.p)){if(!o.al||o.id==t.o||o.inv>0)continue;const d=Math.hypot(o.x-t.x,o.y-t.y);if(d<bd&&this.los(t,o)){bd=d;tg=o}}
   if(tg){const sp=820,tt=bd/sp,ta=Math.atan2(tg.y+tg.vy*tt-t.y,tg.x+tg.vx*tt-t.x),df=((ta-t.a+Math.PI)%6.2832+6.2832)%6.2832-Math.PI;t.a+=cl(df,-6*dt,6*dt);
    if(t.cd<=0&&Math.abs(df)<.12){t.cd=.17;const a=t.a+(Math.random()-.5)*.06,ow=this.p[t.o];this.b.push({id:++this.bid,x:t.x+Math.cos(a)*26,y:t.y+Math.sin(a)*26,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,o:t.o,d:9*(ow&&ow.bot?.5:1),l:1.05,h:t.h,tr:1});this.ev({k:'tshot',x:t.x,y:t.y,a,h:t.h})}}
   else t.a+=dt*.8}
  this.tr=this.tr.filter(t=>{if(t.l>0&&t.hp>0)return 1;const k=this.p[t.lb];if(t.hp<=0&&k){k.c+=15;this.ev({k:'coin',id:k.id,x:k.x,y:k.y,v:15})}this.ev({k:'tdie',x:t.x,y:t.y,h:t.h});return 0})}
 // ---- LOOT: a dead player drops their gun, some coins, and maybe a medkit / shield / turret kit ----
 drop(p){const lose=Math.min(60,p.c*.15|0);p.c-=lose;const it=[],U=()=>++this.cuid;
  if(lose>=10)it.push({u:U(),t:'coin',v:lose});
  if(p.w=='smg'||p.w=='shotgun'||p.w=='rifle'){const o={u:U(),t:p.w};if(!p.bot){o.am=p.am;o.rv=p.rv}it.push(o)}
  if(Math.random()<.6)it.push({u:U(),t:'ammo'});
  if(Math.random()<.35)it.push({u:U(),t:'hp'});if(Math.random()<.3)it.push({u:U(),t:'kit'});if(Math.random()<.2)it.push({u:U(),t:'shield'});
  if(!it.length)return;if(this.cr.length>=24)this.cr.shift();this.cr.push({id:++this.crid,x:p.x,y:p.y,l:50,it})}
 // ---- CRATES: items stay hidden inside; a player in contact opens it and takes one item at a time ----
 takeCr(p,o){if(!p.al||!o)return;const c=this.cr.find(q=>q.id==o.c);if(!c||Math.hypot(c.x-p.x,c.y-p.y)>R+SWR+30)return;const k=c.it.find(q=>q.u==o.j);if(!k)return;
  if(this.crGive(p,c,k)&&!c.it.length)c.l=Math.min(c.l,.6)}
 crGive(p,c,k){const rm=()=>{const i=c.it.indexOf(k);if(i>=0)c.it.splice(i,1)},pk=(t,n,sw)=>this.ev({k:'pick',x:c.x,y:c.y,t,id:p.id,n:n||0,sw}),t=k.t,isG=w=>w=='smg'||w=='shotgun'||w=='rifle';
  if(t=='coin'){p.c+=k.v;this.ev({k:'coin',id:p.id,x:p.x,y:p.y,v:k.v});rm();return 1}
  if(t=='hp'){if(p.hp>=100){if(p.bot||(p.mk|0)>=3)return 0;p.mk=(p.mk|0)+1;this.ev({k:'pick',x:c.x,y:c.y,t:'hp',id:p.id,st:1});rm();return 1}p.hp=Math.min(100,p.hp+40)}
  else if(t=='shield'){if(p.sh>=50)return 0;p.sh=Math.min(50,p.sh+50)}
  else if(t=='kit'){if(p.kt>=3)return 0;p.kt++}
  else if(t=='ammo'){if(p.bot)return 0;const mg=eff(p).mag,n=Math.min(Math.round(mg*1.2),mg*4-p.rv);if(n<=0)return 0;p.rv+=n;pk(t,n);rm();return 1}
  else{
   if(p.bot){if(p.w==t)return 0;p.w=t;p.am=eff(p).mag;p.rel=0;pk(t);rm();return 1}
   const w0=p.w,a0=p.am,r0=p.rv;p.w=t;const mg=eff(p).mag,ka=k.am==null?mg:k.am,kr=k.rv==null?mg*2:k.rv;
   if(w0==t&&ka+kr<=a0+r0){p.w=w0;return 0}
   p.am=Math.min(ka,mg);p.rv=kr;p.rel=0;
   if(isG(w0)){k.t=w0;k.am=a0;k.rv=r0;pk(t,0,w0)}else{pk(t);rm()}return 1}
  pk(t);rm();return 1}
 crStep(dt){this.cr=this.cr.filter(c=>c.it.length>0&&(c.l-=dt)>0);
  for(const p of Object.values(this.p)){if(!p.bot||!p.al)continue;for(const c of this.cr){if(Math.hypot(c.x-p.x,c.y-p.y)>R+26)continue;for(const k of c.it.slice())this.crGive(p,c,k)}}}
 hurt(p,d,by){if(!p.al||p.inv>0||this.win)return;const s=Math.min(p.sh,d);p.sh-=s;p.hp-=d-s;this.ev({k:'hit',x:p.x,y:p.y,h:p.hue,id:p.id,by:by.id,d:Math.round(d)});
  if(p.hp<=0){const ps=p.ks;p.al=0;p.rs=RESP;p.kb=by.id;p.kw=by.w;p.d++;p.ks=0;let fb=0;if(by!==p){by.k++;by.ks++;if(!this.fb){this.fb=1;fb=1}}
   this.drop(p);this.flushAcc(p);for(let n=0;n<4;n++)this.cn.push({id:++this.cid,x:cl(p.x+(Math.random()-.5)*60,30,MW-30),y:cl(p.y+(Math.random()-.5)*60,30,MH-30),v:3+Math.min(by.ks,3),l:25});
   this.ev({k:'kill',x:p.x,y:p.y,h:p.hue,ah:by.hue,a:by.name,b:p.name,w:by.w,ai:by.id,bi:p.id,ks:by.ks,ps:ps,fb:fb,mp:by!==p&&by.k==WIN-1?1:0});
   if(by.k>=WIN&&!this.win){this.win={name:by.name,hue:by.hue,id:by.id};this.wt=5;for(const q of Object.values(this.p))this.flushAcc(q);this.ev({k:'win',id:by.id})}}}
 step(dt){
  if(this.win)return;
  for(const p of Object.values(this.p)){
   if(!p.al){p.rs-=dt;if(p.rs<=0)this.spawn(p);continue}
   if(p.bot)this.ai(p,dt);const i=p.in,W=WP[p.w],E=eff(p);
   if(i.u){const s=i.u-1,u=p.up[p.w];if(s>=0&&s<4&&u[s]<5&&p.c>=UC[u[s]]){p.c-=UC[u[s]];u[s]++;if(s==2)p.am=eff(p).mag;this.ev({k:'upg',id:p.id,x:p.x,y:p.y,s,l:u[s]})}i.u=0}
   if(i.o&&i.o.length){const oq=i.o;i.o=[];for(const o of oq)this.takeCr(p,o)}
   if(!p.bot){p.at-=dt;if(p.at<=0){p.at=3;this.flushAcc(p)}}p.inv-=dt;p.sp-=dt;p.td-=dt;p.cd-=dt;p.dg-=dt;p.bl=Math.max(0,p.bl-dt*1.8);if(p.dn<2){p.dc-=dt;if(p.dc<=0){p.dn++;p.dc=1.6}}if(i.t){i.t=0;this.deploy(p)}if(i.b){i.b=0;this.bombAct(p)}if(i.q){i.q=0;this.ropeAct(p)}
   if(i.d&&p.dn>0&&p.dg<=0){if(p.dn==2)p.dc=1.6;p.dn--;p.dg=.25;p.inv=Math.max(p.inv,.18);p.dt=.14;const l=Math.hypot(i.dx,i.dy),ux=l?i.dx/l:Math.cos(i.a),uy=l?i.dy/l:Math.sin(i.a);p.vx=ux*820;p.vy=uy*820;this.ev({k:'dash',x:p.x,y:p.y,h:p.hue,id:p.id})}
   if(p.dt>0)p.dt-=dt;else{const sp=250*(p.sp>0?1.4:1)*(p.hp<30?1.15:1),f=Math.min(1,12*dt);p.vx+=(i.dx*sp-p.vx)*f;p.vy+=(i.dy*sp-p.vy)*f}
   p.x+=p.vx*dt;p.y+=p.vy*dt;push(p);
   if(p.rel>0){p.rel-=dt;if(p.rel<=0){if(p.bot)p.am=E.mag;else{const n=Math.max(0,Math.min(E.mag-p.am,p.rv));p.am+=n;p.rv-=n}}}
   else if((p.bot||p.rv>0)&&((i.r&&p.am<E.mag)||p.am<=0)){p.rel=E.rel;this.ev({k:'rel',x:p.x,y:p.y,id:p.id,w:p.w,r:E.rel})}
   if(i.f&&p.cd<=0&&p.am>0&&p.rel<=0){p.cd=E.rate;p.am--;const shT=p.bot?null:{g:p.w,h:0};if(shT)(p.aq[p.w]||(p.aq[p.w]=[0,0]))[0]++;
    const SPR=W.spr*(1+p.bl*1.5)*(Math.hypot(p.vx,p.vy)<40?.6:1);for(let n=0;n<W.pel;n++){const a=i.a+(Math.random()-.5)*SPR*2;this.b.push({id:++this.bid,x:p.x+Math.cos(i.a)*(R+W.len),y:p.y+Math.sin(i.a)*(R+W.len),vx:Math.cos(a)*W.spd,vy:Math.sin(a)*W.spd,o:p.id,d:E.dmg*(p.bot?(LV==2?.4:BOT_DMG):1),l:W.life,h:p.hue,sh:shT})}
    p.bl=Math.min(1,p.bl+(BL[p.w]||.08));p.vx-=Math.cos(i.a)*60;p.vy-=Math.sin(i.a)*60;this.ev({k:'shot',id:p.id,x:p.x,y:p.y,a:i.a,w:p.w,h:p.hue})}
   if(!p.bot&&p.al&&(p.mk|0)>0){p.mc=(p.mc||0)-dt;if(p.hp<=30&&p.mc<=0){p.mk--;p.mc=.7;p.hp=Math.min(100,p.hp+40);this.ev({k:'pick',x:p.x,y:p.y,t:'hp',id:p.id,au:1})}}const gw=!p.bot&&i.g&&!p.gl;p.gl=i.g?1:0;let sw=null;
   if(gw){let bd=1e9;for(const k of this.pk){if(!k.on||!(k.t=='smg'||k.t=='shotgun'||k.t=='rifle'))continue;const d=Math.hypot(k.x-p.x,k.y-p.y);if(d<=R+SWR&&d<bd){bd=d;sw=k}}}
   for(const k of this.pk){if(!k.on)continue;let old='',en=0,oa=0,orv=0,stp=0;
    if(!p.bot&&(k.t=='smg'||k.t=='shotgun'||k.t=='rifle')){if(k!==sw)continue}else if(Math.hypot(k.x-p.x,k.y-p.y)>R+14)continue;
    if(k.t=='hp'){if(p.hp>=100){if(p.bot||(p.mk|0)>=3)continue;p.mk=(p.mk|0)+1;stp=1}else p.hp=Math.min(100,p.hp+(k.d?40:100))}else if(k.t=='shield'){if(p.sh>=50)continue;p.sh=Math.min(50,p.sh+50)}else if(k.t=='kit'){if(p.kt>=3)continue;p.kt++}
    else if(k.t=='ammo'){if(p.bot)continue;const mg=eff(p).mag,n=Math.min(Math.round(mg*1.2),mg*4-p.rv);if(n<=0)continue;p.rv+=n;en=n}
    else if(k.t=='speed')p.sp=8;else if(p.bot){if(p.w==k.t&&p.am>=eff(p).mag*.8&&!k.d)continue;p.w=k.t;p.am=eff(p).mag;p.rel=0}
    else{const w0=p.w,a0=p.am,r0=p.rv;p.w=k.t;const mg=eff(p).mag,ka=k.am==null?mg:k.am,kr=k.rv==null?mg*2:k.rv;if(w0==k.t&&ka+kr<=a0+r0){continue}old=w0;oa=a0;orv=r0;p.am=Math.min(ka,mg);p.rv=kr;p.rel=0}
    if(!p.bot&&(old=='smg'||old=='shotgun'||old=='rifle')){const nt=k.t;k.t=old;k.am=oa;k.rv=orv;if(k.d)k.l=Math.max(k.l,20);this.ev({k:'pick',x:k.x,y:k.y,t:nt,id:p.id,sw:old});continue}
    if(k.d)k.l=0;else k.rt=14;k.on=0;this.ev({k:'pick',x:k.x,y:k.y,t:k.t,id:p.id,n:en,st:stp})}}
  this.crStep(dt);
  this.amT=(this.amT||0)-dt;if(this.amT<=0){this.amT=2.5+Math.random()*2;this.spawnAmmo()}
  for(const k of this.pk){if(k.d){k.l-=dt;continue}if(!k.on){k.rt-=dt;if(k.rt<=0){k.on=1;if(k.t0)k.t=k.t0;k.am=k.rv=null}}}this.pk=this.pk.filter(k=>!k.d||k.l>0);
  this.cs.forEach((t,i)=>{if(t>0){this.cs[i]-=dt;if(this.cs[i]<=0)this.cn.push({id:++this.cid,x:CSP[i][0],y:CSP[i][1],v:CSP[i][2],l:1e9,fx:i})}});
  for(const c of this.ch){if(!c.on){c.rt-=dt;if(c.rt<=0)c.on=1;continue}for(const p of Object.values(this.p)){if(!p.al||Math.hypot(p.x-c.x,p.y-c.y)>R+24)continue;const v=25+(Math.random()*20|0);p.c+=v;c.on=0;c.rt=40;if(!p.bot)p.rv=Math.min(eff(p).mag*4,p.rv+Math.round(eff(p).mag*.8));if(Math.random()<.5)p.sh=Math.min(50,p.sh+25);if(Math.random()<.35&&p.kt<3)p.kt++;this.ev({k:'chest',id:p.id,x:c.x,y:c.y,v});
   for(let n=0;n<5;n++)this.cn.push({id:++this.cid,x:c.x+(Math.random()-.5)*90,y:c.y+(Math.random()-.5)*90,v:2,l:20});break}}
  this.cn=this.cn.filter(c=>{c.l-=dt;if(c.l<=0)return 0;let t=null,bd=110;for(const p of Object.values(this.p))if(p.al){const d=Math.hypot(p.x-c.x,p.y-c.y);if(d<bd){bd=d;t=p}}
   if(t){if(bd<R+8){if(c.fx!=null)this.cs[c.fx]=45;t.c+=c.v;this.ev({k:'coin',id:t.id,x:t.x,y:t.y,v:c.v});return 0}const q=320*dt/bd;c.x+=(t.x-c.x)*q;c.y+=(t.y-c.y)*q}return 1});
  this.turrets(dt);this.bombs(dt);this.ropes(dt);this.b=this.b.filter(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;b.l-=dt;
   if(b.l<=0||b.x<0||b.y<0||b.x>MW||b.y>MH||inWall(b.x,b.y)){if(b.l>0)this.ev({k:'spark',x:b.x,y:b.y,h:b.h});return 0}
   for(const t of this.tr){if(t.o==b.o||t.hp<=0)continue;const sx=b.x-b.vx*dt,sy=b.y-b.vy*dt,ex=b.x-sx,ey=b.y-sy,L=ex*ex+ey*ey||1,u=cl(((t.x-sx)*ex+(t.y-sy)*ey)/L,0,1);if(Math.hypot(sx+ex*u-t.x,sy+ey*u-t.y)>24)continue;t.hp-=b.d;t.lb=b.o;this.ev({k:'thit',x:t.x,y:t.y,h:b.h,by:b.o});return 0}for(const p of Object.values(this.p)){if(!p.al||p.id==b.o||Math.hypot(p.x-b.x,p.y-b.y)>R+3)continue;if(b.sh&&!b.sh.h){b.sh.h=1;const o=this.p[b.o];if(o&&o.aq)(o.aq[b.sh.g]||(o.aq[b.sh.g]=[0,0]))[1]++}this.hurt(p,b.d,this.p[b.o]||p);return 0}return 1})}
 snap(){return{p:Object.values(this.p).map(p=>({id:p.id,name:p.name,hue:p.hue,x:p.x|0,y:p.y|0,vx:p.vx|0,vy:p.vy|0,hp:p.hp,sh:p.sh,w:p.w,am:p.am,rel:p.rel,dc:p.dc,dt:p.dt,sp:p.sp,inv:p.inv,al:p.al,k:p.k,d:p.d,c:p.c,ul:p.up[p.w],rs:Math.ceil(Math.max(0,p.rs)),rf:+Math.max(0,p.rs).toFixed(2),kb:p.kb||'',kw:p.kw||'',a:p.in.a,dn:p.dn,bl:+p.bl.toFixed(2),kt:p.kt,mk:p.mk|0,td:Math.max(0,+p.td.toFixed(1)),rc:+(p.rc||0).toFixed(1),rv:p.rv|0,sq:p.sq|0,ia:p.sat?Math.min(999,Math.round(performance.now()-p.sat)):0,pg:p.pg|0})),
  b:this.b.map(b=>({x:b.x|0,y:b.y|0,vx:b.vx|0,vy:b.vy|0,h:b.h,i:b.id,o:b.o,r:b.tr?1:0})),k:this.pk.map(k=>({x:k.x,y:k.y,t:k.t,on:k.on,am:k.am,rv:k.rv})),h:this.ch.map(c=>({x:c.x,y:c.y,on:c.on})),cr:this.cr.map(c=>({id:c.id,x:c.x|0,y:c.y|0,it:c.it.map(i=>({u:i.u,t:i.t,am:i.am,rv:i.rv,v:i.v}))})),n:this.cn.map(c=>({x:c.x|0,y:c.y|0,v:c.v,id:c.id})),w:this.win?{...this.win,t:Math.max(0,this.wt)}:null,t:this.tr.map(t=>({id:t.id,x:t.x|0,y:t.y|0,a:+t.a.toFixed(2),hp:t.hp,mh:t.mh,h:t.h,o:t.o,l:t.l})),rp:Object.values(this.p).filter(p=>p.rp).map(p=>({o:p.id,x:p.rp.x|0,y:p.rp.y|0,s:p.rp.st,h:p.hue,g:p.rp.tg||''})),bm:this.bm.map(b=>({id:b.id,x:b.x|0,y:b.y|0,o:b.o,st:b.st,l:+b.l.toFixed(1),h:b.h})),lv:LV}}
}

/* ============ CLIENT ============ */
const cv=document.getElementById('c'),cx=cv.getContext('2d',{alpha:false}),$=id=>document.getElementById(id);
/* 90fps: when the governor drops to a low-quality tier, canvas shadows/glows (very slow on GPUs) are switched off */
var PFQ={lq:0};try{const _sb=Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,'shadowBlur'),_sc=Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,'shadowColor');
Object.defineProperty(cx,'shadowBlur',{configurable:true,get(){return _sb.get.call(cx)},set(v){_sb.set.call(cx,PFQ.lq?0:v)}});
Object.defineProperty(cx,'shadowColor',{configurable:true,get(){return _sc.get.call(cx)},set(v){_sc.set.call(cx,PFQ.lq?'transparent':v)}})}catch(e){}
let upq=0,upOpen=false,cc=0,dpr=1,S=1,UIS=1,sim=null,net=null,myId='p'+Math.random().toString(36).slice(2,8),myName='Player',myHue=Math.random()*360|0;
let snap={p:[],b:[],k:[],w:null},snapAt=0,netEv=[],views={},parts=[],rings=[],texts=[],shake=0,flash=0,hitm=0,mute=false,t0=0;
const cam={x:MW/2,y:MH/2},keys={},M={x:0,y:0,down:false},ST={mv:null,aim:null,fire:null,dash:0,rel:0};
let paused=false,lockId='',selLv=1,beams=[],conf=[],hpS=100,healAt=-1e9,liveAt=-1e9,deadSince=0,wasAlive=null,winT=0,confDone=0,specId=null,vsLoadShown=0;
let rScale=1;
function rs(){dpr=Math.max(.5,Math.min(devicePixelRatio||1,2)*rScale);cv.width=Math.max(1,Math.round(innerWidth*dpr));cv.height=Math.max(1,Math.round(innerHeight*dpr));cv.style.width=innerWidth+'px';cv.style.height=innerHeight+'px';S=Math.min(innerWidth/1000,innerHeight/620);UIS=Math.max(.64,Math.min(1,Math.min(innerWidth/980,innerHeight/560)));try{document.documentElement.style.setProperty("--uis",UIS.toFixed(3));if(typeof uisApply=="function")uisApply()}catch(e){}}
addEventListener('resize',rs);rs();

/* ===== SOUND ENGINE: decoded sample bank, per-sound mix, distance + stereo placement ===== */
const SV={laser:.55,cannon:.8,sniper:.85,mag:.8,drums:.62,reload:.5,hitmarker:.5,hurt:.9,impact:.55,ricochet:.35,kill:.85,killconfirm:.7,death:.9,
 dash:.5,weapon:.6,heal:.6,shield:.6,speed:.55,coin:.38,chest:.75,upgrade:.65,spawn:.45,respawn:.7,tick:.5,heart:.8,ui:.5,
 victory:.9,defeat:.85,matchpoint:.6,firstblood:.85,streak2:.65,streak3:.75,streak4:.85,shutdown:.75,revenge:.75};
let AC,MG,SB={},act=0,cnt={};
/* The 2 MB sound bank is loaded only after login (boot-gate.js). Decode it once it exists AND the audio context exists, then drop the base64 text to free RAM. */
function decodeBank(){const B=window.SFX_B64;if(!AC||!B)return;window.SFX_B64=null;
 const G1=['laser','cannon','sniper','mag'],rk=k=>G1.includes(k)?0:k=='drums'?2:1;
 for(const k of Object.keys(B).sort((a,b)=>rk(a)-rk(b))){try{const s=atob(B[k]),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);
  const pr=AC.decodeAudioData(u.buffer,b=>{SB[k]=b},()=>{});if(pr&&pr.catch)pr.catch(()=>{})}catch(e){}}}
window.CSK_decodeSounds=decodeBank;
function audioInit(){
 if(window.CSK_PRE)return;   /* nobody signed in yet: no audio engine, no sound bank */
 if(AC){if(AC.state=='suspended')AC.resume();decodeBank();return}
 try{AC=new(window.AudioContext||window.webkitAudioContext)({latencyHint:"interactive"});MG=AC.createGain();MG.gain.value=.9;
  const cp=AC.createDynamicsCompressor();cp.threshold.value=-12;cp.knee.value=14;cp.ratio.value=4;cp.attack.value=.003;cp.release.value=.18;MG.connect(cp);cp.connect(AC.destination);
  AC.onstatechange=()=>{if(AC&&(AC.state=='suspended'||AC.state=='interrupted')){try{AC.resume()}catch(e){}}};
  try{const wb=AC.createBuffer(1,1,22050),ws=AC.createBufferSource();ws.buffer=wb;ws.connect(AC.destination);ws.start(0)}catch(e){}   // wake the audio hardware now, not on the first shot
  decodeBank();
 }catch(e){AC=null}}
function sfx(n,o){o=o||{};const b=SB[n];if(mute||!AC||!b)return;const vol=o.vol==null?1:o.vol,bk=n.replace(/\d$/,'');if(vol<(o.low?.06:.02))return;if(o.low&&(act>18||(cnt[bk]||0)>=3))return;
 const s=AC.createBufferSource();s.buffer=b;s.playbackRate.value=(o.rate||1)*(o.j===0?1:1+(Math.random()-.5)*(o.j||.06));
 const g=AC.createGain();g.gain.value=(SV[n]??SV[n.slice(0,-1)]??1)*vol;let last=s;
 if(o.lp){const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=o.lp;last.connect(f);last=f}
 last.connect(g);last=g;
 if(o.pan&&AC.createStereoPanner){const p=AC.createStereoPanner();p.pan.value=cl(o.pan,-1,1);last.connect(p);last=p}
 last.connect(MG);act++;if(o.low)cnt[bk]=(cnt[bk]||0)+1;s.onended=()=>{act--;if(o.low)cnt[bk]--};const t=AC.currentTime+(o.d||0);if(o.dur){const v=g.gain.value;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.004);g.gain.setValueAtTime(v,t+Math.max(.005,o.dur-.02));g.gain.linearRampToValueAtTime(0,t+o.dur)}s.start(o.d||o.off||o.dur?t:0,o.off||0,o.dur)}
/* where a sound at (x,y) sits relative to the player: loudness, stereo pan, muffling with distance */
function sp(x,y){const m=me();if(!m)return{vol:.5};const dx=x-m.x,dy=y-m.y,d=Math.hypot(dx,dy),k=Math.max(0,1-d/1050);
 return{vol:k*k*.85,pan:cl(dx/650,-1,1)*.8,lp:d>260?cl(9500-d*6.5,1400,9500):0}}
const mine_=id=>id==myId?{vol:1}:null;
/* gun -> [sample, pitch, level]. cannon = shotgun, short laser = SMG, shell-casing crack = sniper rifle; pistol and blaster reuse laser/cannon pitched to their own character */
const GS={pistol:['laser',1.22,.95],smg:['laser',1,1],shotgun:['cannon',1,1],rifle:['sniper',1,1],blaster:['cannon',1.32,.9]};
function gunSnd(e){const g=GS[e.w]||GS.pistol,o=e.id==myId?{vol:1}:Object.assign(sp(e.x,e.y),{low:1});o.vol*=g[2];o.rate=g[1];o.j=.03;sfx(g[0],o)}
/* reload: the magazine file is 4 separate clicks (mag out, mag in, rack, seat) with silence between. Each click is scheduled on the audio clock, spread over the weapon's real reload time, so the last click lands exactly when the reload finishes, with no pitch change */
const MSEG=[[.015,.2],[.34,.47],[1.335,1.545],[1.955,2.045]];
function reloadSnd(e){const b=SB.mag;if(mute||!AC||!b)return;
 const o=e.id==myId?{vol:.95}:Object.assign(sp(e.x,e.y),{low:1});if(o.vol<(o.low?.06:.02))return;
 if(o.low&&(act>18||(cnt.mag||0)>=2))return;
 const T=Math.max(.3,e.r||(WP[e.w]?WP[e.w].rel:1.5)),s0=MSEG[0][0],L=MSEG[MSEG.length-1],k=Math.min(1.6,Math.max(.2,(T-(L[1]-L[0]))/(L[0]-s0))),rate=e.w=='shotgun'?.92:1;
 const g=AC.createGain();g.gain.value=SV.mag*o.vol;let head=g,tail=g;
 if(o.lp){const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=o.lp;f.connect(g);head=f}
 if(o.pan&&AC.createStereoPanner){const p=AC.createStereoPanner();p.pan.value=cl(o.pan,-1,1);g.connect(p);tail=p}
 tail.connect(MG);const t0=AC.currentTime,now=t0+.003;let n=MSEG.length;act++;if(o.low)cnt.mag=(cnt.mag||0)+1;
 MSEG.forEach(([a,z])=>{const src=AC.createBufferSource();src.buffer=b;src.playbackRate.value=rate;src.connect(head);
  src.start(Math.max(now,t0+(a-s0)*k-.012),Math.max(0,a-.012),z-a+.024);
  src.onended=()=>{if(--n==0){act--;if(o.low)cnt.mag--;try{g.disconnect()}catch(x){}}}})}
/* ===== BATTLE DRUMS: intensity meter FI (0..1) rises with gunfire, hits, kills; drums fire at random moments while the fight is hot ===== */
let FI=0;const MU={src:null,g:null,end:0,pend:0,next:0};
function fightEv(e){let a=0;const k=e.k;
 if(k=='shot')a=e.id==myId?.07:.08*near(e.x,e.y);
 else if(k=='hit')a=e.id==myId?.22:e.by==myId?.16:.03*near(e.x,e.y);
 else if(k=='kill')a=(e.bi==myId||e.ai==myId)?.35:.15*near(e.x,e.y);
 else if(k=='boom')a=.25*near(e.x,e.y);
 if(a)FI=Math.min(1,FI+a)}
function musicStop(){const s=MU.src,g=MU.g;if(!s)return;MU.src=null;try{const t=AC.currentTime;g.gain.cancelScheduledValues(t);g.gain.setValueAtTime(g.gain.value,t);g.gain.linearRampToValueAtTime(0,t+.2);s.stop(t+.22)}catch(x){}}
function musicPlay(v){const b=SB.drums;if(!b||!AC)return;const s=AC.createBufferSource(),g=AC.createGain(),t=AC.currentTime,d=b.duration,lv=SV.drums*v;
 s.buffer=b;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(lv,t+.03);g.gain.setValueAtTime(lv,t+d-.4);g.gain.linearRampToValueAtTime(0,t+d);
 s.connect(g);g.connect(MG);s.start(t);MU.src=s;MU.g=g;MU.end=performance.now()+d*1000;s.onended=()=>{if(MU.src===s)MU.src=null;try{g.disconnect()}catch(x){}}}
function musicTick(dt,now){FI=Math.max(0,FI-dt*.1);const m=me();
 if(mute||!AC||!SB.drums||!m||!m.al||paused||snap.w||window.AR_DR===false){if(MU.src)musicStop();MU.pend=0;if(!m)FI=0;return}
 if(m.hp<30&&FI<.4&&FI>.15)FI=Math.min(.45,FI+dt*.2);
 if(MU.src){if(now>MU.end+80)MU.src=null;return}
 if(FI<.4){if(FI<.3)MU.pend=0;return}
 if(!MU.pend){if(now>=MU.next)MU.pend=now+400+Math.random()*2400;return}
 if(now>=MU.pend){MU.pend=0;if(FI>=.3){musicPlay(.55+FI*.45);MU.next=now+(FI>.8?4500+Math.random()*4000:7000+Math.random()*9000)}}}
function pickSnd(e){sfx({hp:'heal',shield:'shield',speed:'speed',ammo:'reload'}[e.t]||'weapon',e.id==myId?{vol:1}:Object.assign(sp(e.x,e.y),{low:1}))}
let coinN=0,coinT=0;
function coinSnd(){return;const n=performance.now();coinN=n-coinT<450?Math.min(coinN+1,10):0;coinT=n;sfx('coin',{rate:Math.pow(2,coinN*.5/12),j:.02})}
let tickN=0,beatT=0;
['pointerdown','touchstart','touchend','click','keydown'].forEach(ev=>addEventListener(ev,audioInit,{passive:true}));
const me=()=>snap.p.find(p=>p.id==myId);
const near=(x,y)=>{const m=me();return m?Math.max(0,1-Math.hypot(m.x-x,m.y-y)/900):.5};
function burst(x,y,h,n,sp,l,sz){n=Math.ceil(n*(window.AR_FX===undefined?1:window.AR_FX));for(let i=0;i<n;i++){const a=Math.random()*6.28,s=sp*(.3+Math.random());parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l,m:l,c:h==null?'#ffd9a0':`hsl(${h} 95% 62%)`,s:sz*(.5+Math.random()),g:window.BFX?1:0,sh:1})}}
function onEv(e){try{fightEv(e)}catch(x){}
 try{window.BFX&&BFX.ev(e)}catch(x){}
 if(sim&&net){e._t=Math.round(performance.now());if(CHEAP[e.k])evc.push(e);else{e._i=++evSeq;evq.push(e)}}
 const v=near(e.x||0,e.y||0);
 if(e.k=='shot'){parts.push({x:e.x,y:e.y,vx:Math.cos(e.a+1.57)*120+Math.random()*40,vy:Math.sin(e.a+1.57)*120,l:.5,m:.5,c:'#ffcf6a',s:2.5});if(views[e.id]){views[e.id].rc=1;views[e.id].fl=.07}burst(e.x+Math.cos(e.a)*40,e.y+Math.sin(e.a)*40,null,4,200,.15,3);rings.push({x:e.x+Math.cos(e.a)*36,y:e.y+Math.sin(e.a)*36,r:4,l:.08,m:.08,c:'#fff'});
  const w=e.w;gunSnd(e);if(e.id==myId)shake=Math.max(shake,w=='shotgun'?5:1.5)}
 else if(e.k=='hit'){if(views[e.id])views[e.id].hf=.1;if(e.by==myId||e.id==myId)(window.AR_DMG!==false)&&texts.push({x:e.x+Math.random()*20-10,y:e.y-24,t:'-'+e.d,c:e.id==myId?'#ff6a5f':'#fff',l:.7});burst(e.x,e.y,e.h,10,260,.4,3);if(e.id==myId)sfx('hurt',{j:.03});else sfx('impact',Object.assign(sp(e.x,e.y),{low:1}));if(e.by==myId){hitm=.15;sfx('hitmarker',{vol:.9,j:.03})}if(e.id==myId){flash=.45;shake=Math.max(shake,8)}}
 else if(e.k=='spark'){burst(e.x,e.y,null,5,180,.25,2);{const s=sp(e.x,e.y);if(s.vol>.15&&Math.random()<.5)sfx('ricochet',Object.assign(s,{low:1}))}}
 else if(e.k=='kill'){burst(e.x,e.y,e.h,40,420,.8,4);rings.push({x:e.x,y:e.y,r:10,l:.5,m:.5,c:`hsl(${e.h} 90% 62%)`,g:260});if(e.bi!=myId)sfx('kill',Object.assign(sp(e.x,e.y),{low:1}));shake=Math.max(shake,e.bi==myId||e.ai==myId?10:0);
  killFeed(e);killCast(e);
  
  rings.push({x:e.x,y:e.y,r:4,l:.7,m:.7,c:'#fff',g:480});
  if(e.bi==myId){flash=.85;shake=Math.max(shake,16);sfx('death',{vol:1,j:0})}}
 else if(e.k=='pick'){burst(e.x,e.y,null,14,200,.5,3);pickSnd(e);if(GN[e.t])pickGunFx(e);if(e.t=='ammo'&&e.id==myId)texts.push({x:e.x,y:e.y-20,t:'+'+(e.n|0)+' AMMO',c:'#ffe066',l:.9});
  if(e.t=='hp'&&e.au&&e.id==myId)texts.push({x:e.x,y:e.y-26,t:'AUTO-HEAL +40',c:'#7dffa6',l:1.2});if(e.t=='hp'&&e.st){if(e.id==myId)texts.push({x:e.x,y:e.y-20,t:'+1 MEDKIT STORED',c:'#7dffa6',l:1.2})}else if(e.t=='hp'){const w=views[e.id];if(w)w.heal=1;
   rings.push({x:e.x,y:e.y,r:8,l:.6,m:.6,c:'#5fd37a',g:220},{x:e.x,y:e.y,r:4,l:.45,m:.45,c:'#d6ffe2',g:130});
   for(let i=0;i<9;i++){texts.push({x:e.x+(Math.random()-.5)*60,y:e.y-Math.random()*16,t:'+',c:'#7dffa6',l:.7+Math.random()*.5});parts.push({x:e.x+(Math.random()-.5)*40,y:e.y+8,vx:(Math.random()-.5)*40,vy:-90-Math.random()*120,l:.8,m:.8,c:'#7dffa6',s:4})}
   if(e.id==myId){healAt=performance.now()}}}
 else if(e.k=='dash'){burst(e.x,e.y,e.h,12,160,.3,3);sfx('dash',e.id==myId?{vol:1}:Object.assign(sp(e.x,e.y),{low:1}))}
 else if(e.k=='spawn'){rings.push({x:e.x,y:e.y,r:10,l:.5,m:.5,c:`hsl(${e.h} 90% 62%)`,g:90});if(e.id==myId||performance.now()-t0>2500)sfx(e.id==myId?'respawn':'spawn',e.id==myId?{vol:1,j:0}:Object.assign(sp(e.x,e.y),{low:1}));
  if(views[e.id])views[e.id].born=.5;
  rings.push({x:e.x,y:e.y,r:80,l:.4,m:.4,c:'#fff',g:-190},{x:e.x,y:e.y,r:130,l:.5,m:.5,c:`hsl(${e.h} 95% 70%)`,g:-250});
  beams.push({x:e.x,y:e.y,l:.7,m:.7,h:e.h});
  for(let i=0;i<14;i++)parts.push({x:e.x+(Math.random()-.5)*50,y:e.y+10,vx:(Math.random()-.5)*30,vy:-120-Math.random()*160,l:.7,m:.7,c:`hsl(${e.h} 95% 75%)`,s:3});}
 else if(e.k=='coin'){if(e.id==myId){0&&texts.push({x:e.x,y:e.y-26,t:'+'+e.v,c:GOLD,l:.8});coinSnd()}}
 else if(e.k=='upg'){burst(e.x,e.y,null,16,220,.5,3);rings.push({x:e.x,y:e.y,r:10,l:.5,m:.5,c:GOLD,g:200});if(e.id==myId){sfx('upgrade',{vol:1,j:.02});0&&texts.push({x:e.x,y:e.y-30,t:['DAMAGE','FIRE RATE','MAGAZINE','RELOAD'][e.s]+' LV '+e.l,c:GOLD,l:1.2})}}
 else if(e.k=='chest'){burst(e.x,e.y,null,40,380,.9,4);rings.push({x:e.x,y:e.y,r:10,l:.6,m:.6,c:GOLD,g:320});sfx('chest',e.id==myId?{vol:1,j:.02}:Object.assign(sp(e.x,e.y),{low:1}));if(e.id==myId)0&&texts.push({x:e.x,y:e.y-34,t:'CHEST +'+e.v,c:GOLD,l:1.4})}
 else if(e.k=='rel'){reloadSnd(e)}
 else if(e.k=='thit'){burst(e.x,e.y,e.h,6,200,.25,3);if(e.by==myId){hitm=.15;sfx('hitmarker',{vol:.9,j:.03})}else sfx('impact',Object.assign(sp(e.x,e.y),{low:1}))}
 else if(e.k=='rope'){sfx('dash',e.id==myId?{vol:.7}:Object.assign(sp(e.x,e.y),{low:1}))}
 else if(e.k=='rhit'){burst(e.x,e.y,e.h,12,220,.35,3);rings.push({x:e.x,y:e.y,r:4,l:.25,m:.25,c:'#7ad0ff',g:120});sfx('impact',Object.assign(sp(e.x,e.y),{vol:.5}))}
 else if(e.k=='bplace'){rings.push({x:e.x,y:e.y,r:6,l:.4,m:.4,c:'#ff8a3a',g:120});sfx('reload',e.id==myId?{vol:1}:Object.assign(sp(e.x,e.y),{low:1}))}
 else if(e.k=='bdud'){rings.push({x:e.x,y:e.y,r:6,l:.5,m:.5,c:'#7a8794',g:90});if(e.id==myId)msgFlash('Bomb disconnected - out of range')}
 else if(e.k=='boom'){burst(e.x,e.y,35,60,520,.9,5);burst(e.x,e.y,null,30,300,.6,4);rings.push({x:e.x,y:e.y,r:10,l:.4,m:.4,c:'#ffb02e',g:350},{x:e.x,y:e.y,r:10,l:.3,m:.3,c:'#ff5a2a',g:300});const o=e.id==myId?{vol:1}:sp(e.x,e.y);sfx('impact',o);sfx('cannon',Object.assign({},o,{rate:.7,j:.04}));shake=Math.max(shake,e.id==myId?14:8)}
 else if(e.k=='tdep'){rings.push({x:e.x,y:e.y,r:8,l:.5,m:.5,c:'#4ae0c0',g:200});burst(e.x,e.y,null,14,200,.5,3);sfx('weapon',e.id==myId?{vol:1}:Object.assign(sp(e.x,e.y),{low:1}))}
 else if(e.k=='tshot'){burst(e.x+Math.cos(e.a)*30,e.y+Math.sin(e.a)*30,null,2,160,.1,2);sfx('laser',Object.assign(sp(e.x,e.y),{low:1,j:.05,rate:1.1}))}
 else if(e.k=='tdie'){burst(e.x,e.y,e.h,26,320,.6,4);rings.push({x:e.x,y:e.y,r:8,l:.4,m:.4,c:'#fff',g:300});sfx('kill',Object.assign(sp(e.x,e.y),{low:1}))}
 else if(e.k=='win'){clearCast();sfx(e.id==myId?'victory':'defeat',{vol:1,j:0})}}
let bq=[],bBusy=0,bTok=0,myKiller='';
const SK=['','','DOUBLE KILL','TRIPLE KILL','RAMPAGE','DOMINATING','UNSTOPPABLE'];
function clearCast(){bq=[];bBusy=0;bTok++;$('bc').innerHTML=''}
function cast(t,s,h,big,sn,sv){bq.push({t,s,h,big,sn,sv});if(bq.length>3)bq.splice(0,bq.length-3);if(!bBusy)nextCast()}
function nextCast(){const c=bq.shift(),el=$('bc');if(!c){bBusy=0;return}bBusy=1;const id=++bTok;el.innerHTML='';
 const d=document.createElement('div');d.className='bcard'+(c.big?' big':'');d.style.setProperty('--h',c.h);
 const a=document.createElement('b');a.textContent=c.t;d.append(a);if(c.s){const s=document.createElement('span');s.textContent=c.s;d.append(s)}el.append(d);if(c.sn)sfx(c.sn,{vol:c.sv==null?1:c.sv,j:0});
 setTimeout(()=>{if(id==bTok)d.classList.add('out')},1600);setTimeout(()=>{if(id==bTok){d.remove();nextCast()}},2000)}
function killFeed(e){const f=$('kf'),d=document.createElement('div'),self=e.ai==e.bi,mine=e.ai==myId&&!self,died=e.bi==myId;
 d.className='kr'+(mine?' mine':died?' died':'');
 const mk=(tg,t,h)=>{const s=document.createElement(tg);s.textContent=t;if(h!=null)s.style.color=`hsl(${h} 85% 70%)`;return s};
 if(self)d.append(mk('span',e.b,e.h),mk('i','Fell'));
 else{d.append(mk('span',e.a,e.ah));if(e.ks>=3)d.append(mk('em','\u00d7'+e.ks));d.append(mk('i',(WP[e.w]||{n:'?'}).n),mk('span',e.b,e.h))}
 f.prepend(d);while(f.children.length>4)f.lastChild.remove();
 setTimeout(()=>d.classList.add('out'),4600);setTimeout(()=>d.remove(),5000)}
function killCast(e){const self=e.ai==e.bi,mine=e.ai==myId&&!self;
 if(e.bi==myId)myKiller=e.ai;
 if(self)return;
 const rev=mine&&myKiller!==''&&e.bi==myKiller;if(rev)myKiller='';
 if(mine)sfx('killconfirm',{j:.02});
 const st='streak'+Math.min(4,Math.max(2,e.ks)),sv=mine?1:.55;
 if(e.ps>=3)cast('SHUTDOWN',e.a+' ended '+e.b+"'s streak",195,1,'shutdown',sv);
 else if(e.fb)cast('FIRST BLOOD',e.a+' eliminated '+e.b,4,1,'firstblood',mine?1:.7);
 else if(e.ks>=3||(mine&&e.ks>=2))cast(SK[Math.min(e.ks,6)],e.a,e.ah,e.ks>=4,st,sv);
 else if(rev)cast('REVENGE',e.b,30,0,'revenge',1);
 else if(mine)cast('ELIMINATED',e.b,e.ah);
 if(e.mp)cast('MATCH POINT',mine?'One kill from victory':e.a+' is one kill from victory',42,0,'matchpoint',mine?1:.6)}

/* ---- key bindings (PC): two slots per action, saved in localStorage 'ar-keys' ---- */
const KDEF={up:['KeyW','ArrowUp'],down:['KeyS','ArrowDown'],left:['KeyA','ArrowLeft'],right:['KeyD','ArrowRight'],dash:['ShiftLeft','Space'],fire:['KeyJ','Enter'],reload:['KeyR',''],swap:['KeyF',''],turret:['KeyE',''],bomb:['KeyB',''],rope:['KeyQ',''],up1:['Digit1',''],up2:['Digit2',''],up3:['Digit3',''],up4:['Digit4',''],board:['Tab',''],pause:['KeyP',''],mute:['KeyM','']};
let KB={};
function kbLoad(){let j=null;try{j=JSON.parse(localStorage.getItem('ar-keys'))}catch(e){}
 KB={};for(const a in KDEF){const v=j&&Array.isArray(j[a])&&j[a].length==2&&j[a].every(c=>typeof c=='string'&&c.length<24)?j[a]:KDEF[a];KB[a]=v.slice()}}
function kbSave(){try{localStorage.setItem('ar-keys',JSON.stringify(KB))}catch(e){}}
function kbSet(a,sl,c){let moved='';if(c)for(const o in KB)for(let i=0;i<2;i++)if(KB[o][i]===c&&!(o==a&&i==sl)){KB[o][i]='';moved=o}KB[a][sl]=c;kbSave();kbHints();return moved}
function kbReset(){try{localStorage.removeItem('ar-keys')}catch(e){}kbLoad();kbHints()}
const kd=a=>KB[a].some(c=>c&&keys[c]),kis=(a,c)=>!!c&&KB[a].includes(c);
const KN={ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',ShiftLeft:'L-Shift',ShiftRight:'R-Shift',ControlLeft:'L-Ctrl',ControlRight:'R-Ctrl',AltLeft:'L-Alt',AltRight:'R-Alt',Space:'Space',Tab:'Tab',Enter:'Enter',CapsLock:'Caps',Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Backslash:'\\'};
const kname=c=>!c?'—':/^Key[A-Z]$/.test(c)?c[3]:/^Digit\d$/.test(c)?c[5]:/^Numpad/.test(c)?'Num'+c.slice(6):KN[c]||c;
const KL=a=>kname(KB[a].find(Boolean)||'');
function kbHints(){const el=document.getElementById('hk');if(!el)return;const mv=['up','left','down','right'].map(KL);
 const H=[[mv.every(x=>x.length==1)?mv.join(''):mv.join('/'),'Move'],[KL('fire'),'Fire (auto-aim)'],[KL('dash'),'Dash'],[KL('reload'),'Reload'],[KL('swap'),'Swap gun'],[KL('turret'),'Sentry'],[KL('bomb'),'Bomb'],[KL('rope'),'Grapple'],[KL('board'),'Scores']];
 el.innerHTML=H.map(h=>'<span><b>'+h[0]+'</b>'+h[1]+'</span>').join('')}
kbLoad();
setTimeout(kbHints,0);
/* ---- input ---- */
addEventListener('keydown',e=>{keys[e.code]=1;if(window.KBL)return;if(kis('board',e.code)){e.preventDefault();$('sb').hidden=false}if(kis('mute',e.code))mute=!mute;if((e.code=='Escape'||kis('pause',e.code))&&$('ed').hidden)setPause(!paused);for(let n=1;n<5;n++)if(kis('up'+n,e.code))upq=n;if(e.code=='Space'||e.code=='Tab')e.preventDefault()});
addEventListener('keyup',e=>{keys[e.code]=0;if(kis('board',e.code))$('sb').hidden=true});
cv.addEventListener('mousemove',e=>{M.x=e.clientX;M.y=e.clientY});cv.addEventListener('mousedown',e=>{if(e.sourceCapabilities&&e.sourceCapabilities.firesTouchEvents)return;const h=upHit(e.clientX,e.clientY);if(h){upq=h;return}M.down=true;M.x=e.clientX;M.y=e.clientY});addEventListener('mouseup',()=>M.down=false);
cv.addEventListener('contextmenu',e=>e.preventDefault());
/* mouse: wheel swaps the gun you're standing on; right-click fires/releases the grapple rope */
let wheelCd=0;cv.addEventListener('wheel',e=>{e.preventDefault();const now=performance.now();if(now<wheelCd)return;wheelCd=now+180;if(window.SWK&&!paused)swq=1},{passive:false});
cv.addEventListener('mousedown',e=>{if(e.button==2&&!paused){e.preventDefault();rpq=1}});
/* ---- touch button layout: positions are saved as fractions of the screen + a size scale, in localStorage ('ar-layout') ----
   Layouts are authored on one device's aspect ratio but can be loaded on any other. A raw fraction (x*W, y*H) does not
   preserve "distance from the nearest edge" across very different aspect ratios, so after remapping, a button can end up
   clipped off-screen or stacked on top of a neighbour. LYRAD gives each button's on-screen radius so we can (1) keep every
   button's full circle inside the current safe area regardless of aspect ratio, and (2) push apart any pair that ends up
   overlapping after that remap — run every time a layout is loaded or the viewport changes. */
let LY=null,LYO=1;
const cp=o=>JSON.parse(JSON.stringify(o)),
LYRAD0={fire:56,dash:34,rel:28,trt:30,bmb:30,rpb:30,joy:60,opn:34,swa:30,lot:44},LYRAD=Object.assign({},LYRAD0),
DEF=()=>{const W=innerWidth,H=innerHeight,u=UIS;return{fire:{x:(W-88*u)/W,y:(H-100*u)/H,s:1},dash:{x:(W-205*u)/W,y:(H-62*u)/H,s:1},rel:{x:(W-48*u)/W,y:(H-210*u)/H,s:1},trt:{x:(W-175*u)/W,y:(H-150*u)/H,s:1},bmb:{x:(W-285*u)/W,y:(H-120*u)/H,s:1},rpb:{x:(W-285*u)/W,y:(H-195*u)/H,s:1},joy:{x:Math.max(95*u,W*.12)/W,y:(H-100*u)/H,s:1},opn:{x:.5,y:(H-215*u)/H,s:1},swa:{x:.5,y:(H-145*u)/H,s:1},lot:{x:.5,y:Math.max(.22,92*u/H),s:1}}};
function uisApply(){for(const k in LYRAD0)LYRAD[k]=LYRAD0[k]*UIS}uisApply();
/* CSS env() safe-area insets (notches, home indicator, rounded corners) as pixels, cached + refreshed on resize */
let LYSAFE={t:0,r:0,b:0,l:0};
function lySafeRead(){try{if(!document.body){LYSAFE={t:0,r:0,b:0,l:0};return}const px=v=>{const n=parseFloat(v);return isFinite(n)?n:0};
 const probe=document.createElement('div');probe.style.cssText='position:fixed;inset:0;padding:env(safe-area-inset-top,0) env(safe-area-inset-right,0) env(safe-area-inset-bottom,0) env(safe-area-inset-left,0);visibility:hidden;pointer-events:none';
 document.body.appendChild(probe);const s=getComputedStyle(probe);LYSAFE={t:px(s.paddingTop),r:px(s.paddingRight),b:px(s.paddingBottom),l:px(s.paddingLeft)};probe.remove()}catch(e){LYSAFE={t:0,r:0,b:0,l:0}}}
/* keep every button's full circle (radius*scale, plus a touch margin) inside the safe area on THIS device.
   If a button still can't fit at its saved scale (very small/cramped screen), shrink it rather than let it clip. */
function lyFit(obj){const W=innerWidth,H=innerHeight,mg=10;
 for(const k in obj){const l=obj[k];if(!l)continue;
  const base=LYRAD[k]||30,maxR=Math.max(14,Math.min((W-LYSAFE.l-LYSAFE.r)/2-mg,(H-LYSAFE.t-LYSAFE.b)/2-mg));
  if(base*(l.s||1)+mg>maxR)l.s=Math.max(.5,(maxR-mg)/base);
  const r=base*(l.s||1)+mg,
   minX=Math.min(.45,(LYSAFE.l+r)/W),maxX=Math.max(.55,1-(LYSAFE.r+r)/W),
   minY=Math.min(.55,(LYSAFE.t+r+40)/H),maxY=Math.max(.6,1-(LYSAFE.b+r)/H);
  l.x=cl(l.x,minX,maxX);l.y=cl(l.y,minY,maxY)}
 return obj}
/* after fitting to the new aspect ratio, pull apart any two buttons whose circles now overlap.
   Keys are sorted first so results are deterministic (same input layout -> same output every time, no jitter). */
function lySeparate(obj){lySafeRead();const W=innerWidth,H=innerHeight,mn=Math.min(W,H),keys=Object.keys(obj).sort();
 lyFit(obj);
 for(let pass=0;pass<8;pass++){let moved=false;
  for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
   const a=obj[keys[i]],b=obj[keys[j]];if(!a||!b)continue;
   const ra=((LYRAD[keys[i]]||30)*(a.s||1))/mn,rb=((LYRAD[keys[j]]||30)*(b.s||1))/mn,
    ax=a.x*W/mn,ay=a.y*H/mn,bx=b.x*W/mn,by=b.y*H/mn,
    dx=bx-ax,dy=by-ay,d=Math.hypot(dx,dy)||.0001,need=ra+rb+.02;
   if(d<need){moved=true;const push=(need-d)/2,ux=dx/d,uy=dy/d;
    a.x=a.x-ux*push*mn/W;a.y=a.y-uy*push*mn/H;
    b.x=b.x+ux*push*mn/W;b.y=b.y+uy*push*mn/H}}
  if(!moved)break;lyFit(obj)}
 return lyFit(obj)}
function loadLY(){try{const j=JSON.parse(localStorage.getItem('ar-layout')),d=DEF();if(j&&j.b){LY={};for(const k in d){const l=j.b[k];LY[k]=l&&isFinite(l.x)&&isFinite(l.y)?{x:cl(+l.x,.03,.97),y:cl(+l.y,.03,.97),s:cl(+l.s||1,.5,1.8)}:d[k]}LYO=cl(+j.o||1,.25,1);lySeparate(LY)}}catch(e){}}
let saveLYq=0;function saveLY(){saveLYq=1}
function saveLYflush(){if(!saveLYq)return;saveLYq=0;try{const j={b:LY,o:LYO,t:Date.now()};localStorage.setItem('ar-layout',JSON.stringify(j));if(window.ARA&&ARA.saveLayout)ARA.saveLayout(j)}catch(e){}}
window.AR_LYAPPLY=j=>{try{localStorage.setItem('ar-layout',JSON.stringify(j))}catch(e){}loadLY()};setInterval(saveLYflush,250);addEventListener('pagehide',saveLYflush);addEventListener('visibilitychange',()=>{if(document.hidden)saveLYflush()});
/* re-fit (never re-save) whenever the viewport itself changes size/rotates, so a layout made on one device still looks right if this same device's window changes. Debounced since rotation can fire several resize events in a row. */
let lyFitT=0;addEventListener('resize',()=>{clearTimeout(lyFitT);lyFitT=setTimeout(()=>{if(LY)lySeparate(LY)},120)});
loadLY();
const lay=k=>(LY&&LY[k])||DEF()[k],
BG=(k,r)=>{const l=lay(k);return{x:l.x*innerWidth,y:l.y*innerHeight,r:r*l.s*UIS,s:l.s}},
JB=()=>BG('joy',60),
B=()=>({fire:BG('fire',56),dash:BG('dash',34),rel:BG('rel',28),trt:BG('trt',30),bmb:BG('bmb',30),rpb:BG('rpb',30)});
cv.addEventListener('touchstart',e=>{e.preventDefault();ST.on=1;const b=B();for(const t of e.changedTouches){const x=t.clientX,y=t.clientY,q={id:t.identifier,sx:x,sy:y,x,y},h=k=>Math.hypot(x-b[k].x,y-b[k].y)<b[k].r+10;
 const uh=upHit(x,y);if(uh)upq=uh;else if(h('fire'))ST.fire=t.identifier;else if(h('dash'))ST.dash=1;else if(h('rel'))ST.rel=1;else if(h('trt'))ST.trt=1;else if(h('bmb'))bmq=1;else if(h('rpb'))rpq=1;else if((x<innerWidth/2||Math.hypot(x-JB().x,y-JB().y)<JB().r*2)&&!ST.mv){const j=JB();ST.mv={id:t.identifier,sx:j.x,sy:j.y,x,y}}}},{passive:false});
cv.addEventListener('touchmove',e=>{e.preventDefault();for(const t of e.changedTouches)for(const k of['mv','aim'])if(ST[k]&&ST[k].id==t.identifier){ST[k].x=t.clientX;ST[k].y=t.clientY}},{passive:false});
const te=e=>{for(const t of e.changedTouches){if(ST.fire==t.identifier)ST.fire=null;for(const k of['mv','aim'])if(ST[k]&&ST[k].id==t.identifier)ST[k]=null}};cv.addEventListener('touchend',te);cv.addEventListener('touchcancel',te);
const wrapA=a=>((a+Math.PI)%6.2832+6.2832)%6.2832-Math.PI,losc=(a,b)=>{for(let i=1;i<14;i++){const t=i/14;if(inWall(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t))return 0}return 1};
function msgFlash(t){const m=$('msg');m.textContent=t;clearTimeout(msgFlash.h);msgFlash.h=setTimeout(()=>{if(m.textContent==t)m.textContent=''},1500)}
/* aim: lead the target by bullet travel time, then choose targets by distance + angle off the cursor, strongly preferring ones in line of sight and sticking to the locked one */
function leadAng(m,t){const s=WP[m.w].spd,dx=t.x-m.x,dy=t.y-m.y;let tt=Math.hypot(dx,dy)/s;for(let i=0;i<2;i++)tt=Math.hypot(dx+t.vx*tt,dy+t.vy*tt)/s;return Math.atan2(dy+t.vy*tt,dx+t.vx*tt)}
function pickTarget(m,ang,cone,maxd){let best=null,bs=1e9;for(const p of snap.p){if(p.id==m.id||!p.al||p.inv>.2)continue;const d=Math.hypot(p.x-m.x,p.y-m.y);if(d>maxd)continue;const da=Math.abs(wrapA(leadAng(m,p)-ang));if(da>cone)continue;const s=d*(1+da*2)+(losc(m,p)?0:700)-(p.id==lockId?200:0);if(s<bs){bs=s;best=p}}
 for(const t of snap.t||[]){if(t.o==m.id)continue;const q={id:'T'+t.id,x:t.x,y:t.y,vx:0,vy:0},d=Math.hypot(q.x-m.x,q.y-m.y);if(d>maxd)continue;const da=Math.abs(wrapA(Math.atan2(q.y-m.y,q.x-m.x)-ang));if(da>cone)continue;const s=d*(1+da*2)*1.3+(losc(m,q)?0:700)-(q.id==lockId?200:0);if(s<bs){bs=s;best=q}}return best}
let lastA=0,face=0;
/* Touch: the character faces where the left stick points. While FIRE is held it turns to the nearest enemy and shoots at it. */
let bmq=0,rpq=0,swq=0,crq=[];addEventListener('keydown',e=>{if(kis('swap',e.code)&&!window.KBL&&!e.repeat&&!paused&&!(document.activeElement&&document.activeElement.tagName=='INPUT'))swq=1});addEventListener("keydown",e=>{if(kis('rope',e.code)&&!window.KBL&&!e.repeat&&!paused&&!(document.activeElement&&document.activeElement.tagName=="INPUT"))rpq=1});addEventListener("keydown",e=>{if(kis('bomb',e.code)&&!window.KBL&&!e.repeat&&!paused&&!(document.activeElement&&document.activeElement.tagName=="INPUT"))bmq=1});
function bombOf(o){return(snap.bm||[]).find(b=>b.o==o&&b.st==0)}
function readInput(){let dx=0,dy=0,f=0,d=0,r=0,t=0,g=0,mvOn=0;const m=views[myId],mp=me();if(paused)return{dx:0,dy:0,a:lastA,f:0,d:0,r:0,u:0,t:0,vx:innerWidth/2/S,vy:innerHeight/2/S,kx:cam.x,ky:cam.y};
 if(ST.on){
  if(ST.mv){const x=ST.mv.x-ST.mv.sx,y=ST.mv.y-ST.mv.sy,l=Math.hypot(x,y);if(l>4){const m=Math.pow(Math.min(1,(l-4)/(46*JB().s*UIS)),.85);dx=x/l*m;dy=y/l*m;face=Math.atan2(y,x);mvOn=1}}
  f=ST.fire!=null?1:0;
  {const tg=f&&mp&&mp.al?pickTarget(mp,lastA,7,1250):null;if(tg){lockId=tg.id;lastA=leadAng(mp,tg)}else{lockId='';if(mvOn)lastA=face}}
  d=ST.dash;r=ST.rel;t=ST.trt|0;ST.dash=ST.rel=ST.trt=0}
 else{dx=(kd('right')?1:0)-(kd('left')?1:0);dy=(kd('down')?1:0)-(kd('up')?1:0);
  mvOn=(dx||dy)?1:0;if(mvOn)face=Math.atan2(dy,dx);
  f=(M.down||kd('fire'))?1:0;
  {const tg=f&&mp&&mp.al?pickTarget(mp,lastA,7,1250):null;if(tg){lockId=tg.id;lastA=leadAng(mp,tg)}else{lockId='';if(mvOn)lastA=face}}
  d=kd('dash')?1:0;r=kd('reload')?1:0;t=kd('turret')?1:0;g=kd('swap')?1:0}
 if(swq){g=1;swq=0}
 const u=upq;upq=0;const b=bmq,q=rpq;bmq=rpq=0;return{dx,dy,a:lastA,f,d,r,u,t,g,b,q,o:crq.splice(0),vx:innerWidth/2/S,vy:innerHeight/2/S,kx:cam.x,ky:cam.y}}


/* ============ NETCODE (host-authoritative, Firebase relay) ============
 HOST   runs the simulation on a Worker-driven clock (keeps running when its tab is hidden), broadcasts:
          st  dynamic snapshot ~20 Hz  (players, bullets, turrets, ropes, bombs, win, events) - compact rows
          wd  world data, written only when it changes (pickups, chests, coins, roster)
 CLIENT sends inputs ~30 Hz. One-shot actions (bomb / rope / upgrade) travel in an acknowledged edge queue,
        so they can never be lost or fired twice. Reliable events carry ids and are re-sent until every client
        has acknowledged them. The client draws: itself from local prediction (+ soft server reconciliation),
        everyone else interpolated ~100 ms in the past from a timestamped snapshot buffer. */
const MAXH=8,CHEAP={spark:1,shot:1,tshot:1,hit:1,thit:1,rel:1,dash:1,coin:1},
 PF=['id','x','y','vx','vy','a','hp','sh','w','am','rel','dc','dt','sp','inv','al','k','d','c','ul','rf','kb','kw','dn','bl','kt','td','rc','sq','ia','pg','le','rv','mk'];
const nz=v=>v>0?Math.round(v*100)/100:0,nr1=v=>Math.round(v*10)/10,nr2=v=>Math.round(v*100)/100,nr3=v=>Math.round(v*1000)/1000;
let evq=[],evc=[],evSeq=0,qSeq=0,wdLast='',wdAt=-1e9,hSend=0,hAcc=0,tickT=0,started=0,tickCnt=0,tickW=null,roomCode='';
const NW={k:[],h:[],n:[],cr:[],R:{},lv:0}; // world data received by a client
const NC={buf:[],off:0,offS:[],ivl:50,jit:10,lastRt:0,delay:130,lastQ:-1,lastEv:0,got:0,q:[],gone:0,goneAt:0,rtt:0,A:null,B:null,f:0,ext:0,rT:0};
const PR={on:0,x:0,y:0,vx:0,vy:0,dtm:0,dg:0,dn:2,dashAt:-1e9,ph:[],lcd:0,ps:[],rt:-1e9,rd:0,rq:0}; // local prediction of my own player
const IDLE={dx:0,dy:0,a:0,f:0,d:0,r:0,t:0,g:0,b:0,q:0,u:0};
let curInp=IDLE,pend=[],eseq=0,nseq=0,sendAt=0,lastSig='',sentAt={},latchU={};

/* ---------- compact wire format ---------- */
function packP(p){return[p.id,nr1(p.x),nr1(p.y),Math.round(p.vx||0),Math.round(p.vy||0),nr3(p.a||0),nr1(p.hp),nr1(p.sh),p.w,p.am,nz(p.rel),nz(p.dc),nz(p.dt),nz(p.sp),nz(p.inv),p.al,p.k,p.d,p.c,p.ul,p.rf,p.kb,p.kw,p.dn,p.bl,p.kt,p.td,p.rc,p.sq|0,p.ia|0,p.pg|0,p.le|0,p.rv|0,p.mk|0]}
function unpackP(r,R){const o={};for(let i=0;i<PF.length;i++)o[PF[i]]=r[i];const q=R[o.id];o.rs=Math.ceil(o.rf||0);o.name=q?q[0]:'Player';o.hue=q?q[1]:200;o.bot=q?q[2]:0;return o}
function unpackSnap(m){const p=m.P.map(r=>unpackP(r,NW.R)),pm={};for(const o of p)pm[o.id]=o;
 return{p,pm,b:m.B.map(a=>({i:a[0],x:a[1],y:a[2],vx:a[3],vy:a[4],h:a[5],o:a[6],r:a[7]})),t:m.tr||[],rp:m.rp||[],bm:m.bm||[],w:m.w||null,lv:m.lv,k:NW.k,h:NW.h,n:NW.n,cr:NW.cr}}
function applyWorld(m){NW.k=m.K.map(a=>({x:a[0],y:a[1],t:a[2],on:a[3],am:a[4],rv:a[5]}));NW.h=m.H.map(a=>({x:a[0],y:a[1],on:a[2]}));NW.n=m.N.map(a=>({id:a[0],x:a[1],y:a[2],v:a[3]}));NW.cr=(m.C||[]).map(a=>({id:a[0],x:a[1],y:a[2],it:a[3].map(b=>({u:b[0],t:b[1],am:b[2],rv:b[3],v:b[4]}))}));NW.R=m.R||{};NW.lv=m.lv||0;
 snap.k=NW.k;snap.h=NW.h;snap.n=NW.n;snap.cr=NW.cr;for(const p of snap.p){const q=NW.R[p.id];if(q){p.name=q[0];p.hue=q[1];p.bot=q[2]}}}

/* ---------- worker clock: keeps hosts and clients alive in a background tab ---------- */
function startTicker(){if(tickW)return;
 let fbk=0;const fb=()=>{if(fbk)return;fbk=1;if(tickW&&tickW.terminate)try{tickW.terminate()}catch(e){}tickW=setInterval(netTick,16)};
 try{const u=URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},16)'],{type:'text/javascript'}));tickW=new Worker(u);tickW.onmessage=netTick;tickW.onerror=fb;
  setTimeout(()=>{if(!tickCnt)fb()},800)}catch(e){fb()}}
function netTick(){if(!net||!started)return;tickCnt++;const now=performance.now();let dt=(now-tickT)/1000;tickT=now;if(!(dt>0))return;if(dt>.25)dt=.25;
 if(sim)hostTick(now,dt);else clientTick(now,dt)}

/* ---------- HOST ---------- */
function humanList(){const a=[];for(const id in sim.p){const p=sim.p[id];if(!p.bot&&id!=myId)a.push(p)}return a}
function hostTick(now,dt){
 hAcc+=dt;let n=0;const m=sim.p[myId];
 while(hAcc>=TICK&&n<15){if(m)m.in=readInput();sim.step(TICK);hAcc-=TICK;n++}
 if(n>=15)hAcc=0;
 let nh=0;
 for(const id in sim.p){const p=sim.p[id];if(p.bot||id==myId)continue;
  if(p.seen&&now-p.seen>5000){delete sim.p[id];continue}
  if(p.seen&&now-p.seen>600){const i=p.in;i.dx=i.dy=0;i.f=0;i.d=0}   // input stream stalled: stand still instead of running on
  nh++}
 snap=sim.snap();snapAt=now;
 if(!nh){evq.length=0;evc.length=0}
 hSend+=dt;if(hSend>=(nh?(net.snapDt||.05):1)){hSend=0;sendDyn(now)}
 if(now-wdAt>=350||net.resend){sendWorld(now,!!net.resend);net.resend=0}
 netStatus(now)}
function hostIn(m){
 if(!m.id||m.id==myId||typeof m.id!='string'||m.id.length>24)return;
 let p=sim.p[m.id];
 if(!p){if(humanList().length>=MAXH)return;sim.add(m.id,String(m.name||'Player').slice(0,12),(+m.hue||0)%360,0);p=sim.p[m.id];p.lastE=0;p.sq=0;p.ea=0}
 const n=m.n|0;if(n&&n<=(p.sq|0))return;                       // stale or duplicated input
 const prev=p.in||{},ip=m.inp||{},c=(v,a,b)=>Math.max(a,Math.min(b,+v||0));
 let eb=0,eq=0,eu=0;const eo=[];
 if(Array.isArray(m.ed))for(const e of m.ed){if(e&&e.i>(p.lastE|0)){p.lastE=e.i;if(e.k=='b')eb=1;else if(e.k=='q')eq=1;else if(e.k=='u')eu=e.v|0;else if(e.k=='o')eo.push({c:e.c|0,j:e.j|0})}}
 p.in={dx:c(ip.dx,-1,1),dy:c(ip.dy,-1,1),a:+ip.a||0,f:ip.f?1:0,d:ip.d?1:0,r:ip.r?1:0,t:ip.t?1:0,g:ip.g?1:0,
  b:(prev.b||eb)?1:0,q:(prev.q||eq)?1:0,u:prev.u||eu||0,o:(prev.o||[]).concat(eo).slice(-8),vx:+ip.vx>0?c(ip.vx,200,2400):520,vy:+ip.vy>0?c(ip.vy,150,1400):320,kx:isFinite(+ip.kx)&&ip.kx!=null?+ip.kx:p.x,ky:isFinite(+ip.ky)&&ip.ky!=null?+ip.ky:p.y};
 const now=performance.now();p.seen=now;p.sat=now;p.sq=n;p.pg=m.ct|0;p.ea=m.ea|0;if(m.name)p.name=String(m.name).slice(0,12)}
function sendDyn(now){
 let minAck=1e15;for(const p of humanList())if((p.ea|0)<minAck)minAck=p.ea|0;
 evq=evq.filter(e=>now-e._t<2500&&e._i>minAck);if(evq.length>60)evq=evq.slice(-60);
 if(evc.length>60)evc=evc.slice(-60);
 const s=snap;for(const p of s.p){const q=sim.p[p.id];p.le=q&&q.lastE|0}
 net.send({t:'st',q:qSeq++,T:Math.round(now),ei:evSeq,lv:LV,P:s.p.map(packP),B:s.b.map(b=>[b.i,nr1(b.x),nr1(b.y),Math.round(b.vx),Math.round(b.vy),b.h,b.o,b.r]),tr:s.t,rp:s.rp,bm:s.bm,w:s.w,E:evq,C:evc});
 evc=[]}
function sendWorld(now,force){
 const s=snap,R={};for(const id in sim.p){const p=sim.p[id];R[id]=[p.name,p.hue,p.bot?1:0]}
 const j=JSON.stringify({t:'wd',lv:LV,K:s.k.map(k=>[k.x,k.y,k.t,k.on,k.am,k.rv]),H:s.h.map(c=>[c.x,c.y,c.on]),N:s.n.map(c=>[c.id,c.x,c.y,c.v]),C:(s.cr||[]).map(c=>[c.id,c.x,c.y,c.it.map(i=>[i.u,i.t,i.am,i.rv,i.v])]),R});
 if(j===wdLast&&!force)return;wdLast=j;wdAt=now;net.send({t:'wd'},j)}
function hostRecv(m){
 if(m.t=='in')hostIn(m);
 else if(m.t=='bye'){if(m.id&&m.id!=myId){delete sim.p[m.id];try{net.root.child('in/'+m.id).remove()}catch(e){}}}}

/* ---------- CLIENT: receive ---------- */
function predRel(m,now){if(now-PR.rt<PR.rd+250)return;const E=eff({w:m.w,up:{[m.w]:m.ul||[0,0,0,0]}});PR.rt=now;PR.rd=E.rel*1000;PR.rq++;onEv({k:'rel',x:PR.x,y:PR.y,id:myId,w:m.w,r:E.rel})}
function qev(e){
 if(e.k=='rel'&&e.id==myId){if(performance.now()-PR.rt>3000)PR.rq=0;if(PR.rq>0){PR.rq--;return}}
 if(e.k=='shot'&&e.id==myId&&PR.ps.length){PR.ps.shift();return}      // already played locally when I pulled the trigger
 if(e.id==myId||e.by==myId||e.bi==myId||e.ai==myId)onEv(e);else NC.q.push(e)}
function clientRecv(m){
 const now=performance.now(),N=NC;
 if(m.t=='wd'){applyWorld(m);return}
 if(m.t=='gone'){N.gone=1;N.goneAt=now;return}
 if(m.t=='hostup'){N.gone=0;return}
 if(m.t!='st'||!m.P)return;
 if(m.q<=N.lastQ)return;N.lastQ=m.q;N.gone=0;
 const s=unpackSnap(m);
 const gap=N.lastRt?now-N.lastRt:50;N.lastRt=now;
 N.ivl+=(Math.min(gap,500)-N.ivl)*.1;N.jit+=(Math.abs(gap-N.ivl)-N.jit)*.1;{const tg=Math.max(net&&net.fast?60:90,Math.min(320,N.ivl*1.6+N.jit*2.5));N.delay+=Math.max(-1,Math.min(6,tg-N.delay))}   // slewed: a sudden change would visibly shift everyone
 N.offS.push(now-m.T);if(N.offS.length>150)N.offS.shift();let o=1e15;for(const v of N.offS)if(v<o)o=v;N.off=N.buf.length?N.off+Math.max(-1,Math.min(1,o-N.off)):o;
 N.buf.push({T:m.T,rt:now,s,pm:s.pm});if(N.buf.length>40)N.buf.shift();
 const mp=s.pm[myId];
 if(mp){mp.hx=mp.x;mp.hy=mp.y;mp.hvx=mp.vx;mp.hvy=mp.vy;
  if(pend.length)pend=pend.filter(e=>e.i>(mp.le|0));
  if(mp.pg){const r=now-mp.pg-(mp.ia||0);if(r>0&&r<5000)N.rtt=N.rtt?N.rtt+(r-N.rtt)*.2:r}
  reconcile(mp,now);
  if(PR.on){mp.x=PR.x;mp.y=PR.y;mp.vx=PR.vx;mp.vy=PR.vy}}
 snap=s;snapAt=now;
 if(!N.got){N.got=1;N.lastEv=m.ei|0}
 if(m.E)for(const e of m.E)if(e._i>N.lastEv){N.lastEv=e._i;qev(e)}
 if(m.C)for(const e of m.C)qev(e);
 if(N.q.length>300)N.q.splice(0,N.q.length-300)}

/* ---------- CLIENT: draw others interpolated, release due events ---------- */
function netFrame(now){
 const N=NC,b=N.buf;if(!b.length)return;
 N.rT=now-N.off-N.delay;
 let i=b.length-1;while(i>0&&b[i].T>N.rT)i--;
 N.A=b[i];N.B=b[i+1]||null;
 N.f=N.B?Math.max(0,Math.min(1,(N.rT-N.A.T)/Math.max(1,N.B.T-N.A.T))):0;
 N.ext=N.B?0:Math.max(0,Math.min(.25,(N.rT-N.A.T)/1000));
 if(N.q.length){const keep=[];for(const e of N.q){if(e._t<=N.rT)onEv(e);else keep.push(e)}N.q=keep}}
function netPos(p){
 const N=NC,A=N.A;
 if(p.id==myId&&PR.on)return{x:PR.x,y:PR.y,a:lastA};
 if(!A)return{x:p.x,y:p.y,a:p.a};
 const a=A.pm[p.id];if(!a)return{x:p.x,y:p.y,a:p.a};
 const b=N.B&&N.B.pm[p.id];
 if(b&&b.al==a.al&&Math.abs(b.x-a.x)+Math.abs(b.y-a.y)<500){const f=N.f;return{x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,a:a.a+wrapA(b.a-a.a)*f}}
 return{x:a.x+a.vx*N.ext,y:a.y+a.vy*N.ext,a:a.a}}
function clientBullets(now){
 const N=NC,A=N.A,L=N.buf[N.buf.length-1];if(!A||!L)return snap.b;const out=[];
 const da=Math.max(0,Math.min(.25,(N.rT-A.T)/1000)),dl=Math.max(0,Math.min(.15,(now-L.rt)/1000));
 for(const b of A.s.b)if(!(b.o==myId&&!b.r))out.push({x:b.x+b.vx*da,y:b.y+b.vy*da,vx:b.vx,vy:b.vy,h:b.h});
 for(const b of L.s.b)if(b.o==myId&&!b.r)out.push({x:b.x+b.vx*dl,y:b.y+b.vy*dl,vx:b.vx,vy:b.vy,h:b.h});   // my own shots: newest data, no delay
 return out}

/* ---------- CLIENT: send inputs ---------- */
function latch(k,v,now){if(v)latchU[k]=now+120;return(v||now<(latchU[k]||0))?1:0}
function clientTick(now,dt){
 const inp=readInput();
 if(inp.b)pend.push({i:++eseq,k:'b'});if(inp.q)pend.push({i:++eseq,k:'q'});if(inp.u)pend.push({i:++eseq,k:'u',v:inp.u});if(inp.o&&inp.o.length)for(const o of inp.o)pend.push({i:++eseq,k:'o',c:o.c,j:o.j});
 inp.b=inp.q=inp.u=0;inp.d=latch('d',inp.d,now);inp.r=latch('r',inp.r,now);inp.t=latch('t',inp.t,now);inp.g=latch('g',inp.g,now);
 if(pend.length>24)pend.splice(0,pend.length-24);
 curInp=inp;
 const sig=nr2(inp.dx)+','+nr2(inp.dy)+','+nr2(inp.a)+','+inp.f+inp.d+inp.r+inp.t+inp.g;
 if(now-sendAt>=(net&&net.fast?15:33)&&!(sig===lastSig&&!pend.length&&now-sendAt<250)){
  sendAt=now;lastSig=sig;const n=++nseq;sentAt[n]=now;delete sentAt[n-150];
  net.send({t:'in',id:myId,name:myName,hue:myHue,n,ct:Math.round(now),ea:NC.lastEv,
   inp:{dx:nr2(inp.dx),dy:nr2(inp.dy),a:nr3(inp.a),f:inp.f,d:inp.d,r:inp.r,t:inp.t,g:inp.g,vx:Math.round(inp.vx),vy:Math.round(inp.vy),kx:Math.round(inp.kx),ky:Math.round(inp.ky)},ed:pend})}
 netStatus(now)}

/* ---------- CLIENT: predict my own movement ---------- */
function histAt(t){const h=PR.ph,n=h.length;if(!n||t<h[0].t-30)return null;if(t>=h[n-1].t)return h[n-1];
 for(let i=n-1;i>0;i--)if(h[i-1].t<=t){const a=h[i-1],b=h[i],f=(t-a.t)/Math.max(1,b.t-a.t);return{x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f}}
 return h[0]}
function reconcile(mp,now){
 if(!PR.on||!mp.al)return;const st=sentAt[mp.sq];if(st==null||!(mp.sq>0))return;
 const h=histAt(st+(mp.ia||0));if(!h)return;
 const ex=mp.hx-h.x,ey=mp.hy-h.y,e=Math.hypot(ex,ey);if(e<5)return;
 const k=e>300?1:e>45?.4:.15,cx_=ex*k,cy_=ey*k;
 PR.x+=cx_;PR.y+=cy_;for(const q of PR.ph){q.x+=cx_;q.y+=cy_}
 if(e>300){PR.vx=mp.hvx;PR.vy=mp.hvy}
 push(PR)}
function clientPredict(now,dt){
 const m=me();
 if(!m||!m.al){PR.on=0;PR.ph.length=0;return}
 if(m.hx==null){m.hx=m.x;m.hy=m.y;m.hvx=m.vx;m.hvy=m.vy}
 const forced=(snap.rp||[]).some(r=>(r.o==myId&&r.s==1)||(r.g==myId&&r.s==2));
 if(!PR.on){PR.x=m.hx;PR.y=m.hy;PR.vx=m.hvx;PR.vy=m.hvy;PR.dtm=0;PR.dg=0;PR.dn=m.dn;PR.ph.length=0;PR.on=1;PR.lcd=0}
 const inp=curInp||IDLE;
 if(forced){const ag=Math.min(.15,(now-snapAt)/1000);PR.x=m.hx+m.hvx*ag;PR.y=m.hy+m.hvy*ag;PR.vx=m.hvx;PR.vy=m.hvy}
 else{
  PR.dg-=dt;
  if(now-PR.dashAt>NC.rtt+150)PR.dn=m.dn;else PR.dn=Math.min(PR.dn,m.dn);
  if(inp.d&&PR.dn>0&&PR.dg<=0){PR.dn--;PR.dg=.25;PR.dtm=.14;PR.dashAt=now;const l=Math.hypot(inp.dx,inp.dy),ux=l?inp.dx/l:Math.cos(inp.a),uy=l?inp.dy/l:Math.sin(inp.a);PR.vx=ux*820;PR.vy=uy*820}
  if(PR.dtm>0)PR.dtm-=dt;
  else{const sp=250*(m.sp>0?1.4:1)*(m.hp<30?1.15:1),f=Math.min(1,12*dt);PR.vx+=(inp.dx*sp-PR.vx)*f;PR.vy+=(inp.dy*sp-PR.vy)*f}
  PR.x+=PR.vx*dt;PR.y+=PR.vy*dt;push(PR)}
 PR.ph.push({t:now,x:PR.x,y:PR.y});if(PR.ph.length>100)PR.ph.shift();
 // instant firing feedback (sound, muzzle flash, recoil); the bullet itself still comes from the host
 PR.lcd-=dt;while(PR.ps.length&&now-PR.ps[0]>1200)PR.ps.shift();
 if(inp.f&&!paused&&PR.lcd<=0&&WP[m.w]){const used=PR.ps.filter(t=>now-t<NC.rtt+150).length;
  if(m.am-used>0&&!(m.rel>0)&&!snap.w){PR.lcd=eff({w:m.w,up:{[m.w]:m.ul||[0,0,0,0]}}).rate;PR.ps.push(now);
   PR.vx-=Math.cos(inp.a)*60;PR.vy-=Math.sin(inp.a)*60;onEv({k:'shot',id:myId,x:PR.x,y:PR.y,a:inp.a,w:m.w,h:myHue});if(m.am-used-1<=0&&m.rv>0)predRel(m,now)}}
 if(inp.r&&!paused&&!snap.w&&!(m.rel>0)&&m.rv>0&&m.am<eff({w:m.w,up:{[m.w]:m.ul||[0,0,0,0]}}).mag)predRel(m,now);
 m.x=PR.x;m.y=PR.y;m.vx=PR.vx;m.vy=PR.vy}

/* ---------- connection status ---------- */
let stT=0,stMsg='';
function setMsg(t){const e=$('msg');if(t){if(t!==stMsg||e.textContent!==t){stMsg=t;e.textContent=t}}else if(stMsg){if(e.textContent===stMsg)e.textContent='';stMsg=''}}
function netStatus(now){if(now-stT<400)return;stT=now;let t='';const N=NC;
 if(!sim){
  if(!N.buf.length)t=now-t0>9000?'No response from the host. Check the room code, or ask them to create the room again.':'Connecting to room '+roomCode+'\u2026';
  else if(N.gone)t=now-N.goneAt>15000?'The host left the room. Use BACK TO HOME to leave.':'Host connection lost \u2014 waiting for it to come back\u2026';
  else if(net&&net.link===false)t='You are offline \u2014 reconnecting\u2026';
  else if(now-snapAt>2500)t='Connection unstable\u2026'}
 else if(net&&net.link===false)t='You are offline \u2014 reconnecting\u2026';
 setMsg(t);
 const rc=$('rc');if(rc){let n=0;if(sim)n=1+humanList().length;else for(const p of snap.p)if(!p.bot)n++;
  rc.textContent='ROOM '+roomCode+' \u00b7 '+n+' online'+(!sim&&N.rtt?' \u00b7 '+Math.round(N.rtt)+' ms'+(net&&net.path?' \u00b7 '+net.path:''):'')}}

/* ---- session ---- */
function start(mode,room){try{window.BFX&&BFX.reset()}catch(x){}audioInit();setTimeout(()=>sfx('ui',{j:0}),80);myName=$('nm').value.trim().slice(0,12)||'Player';try{localStorage.setItem('ar-name',myName)}catch(e){}try{ARA.profile()}catch(e){}
 $('menu').style.display='none';$('pz').hidden=false;pzPos();t0=performance.now();
 if('ontouchstart' in window||(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches))ST.on=1;
 if('ontouchstart' in window){try{const d=document.documentElement,pr=(d.requestFullscreen||d.webkitRequestFullscreen).call(d);Promise.resolve(pr).then(()=>screen.orientation.lock('landscape')).catch(()=>{})}catch(e){}}
 
 if(mode!='join'){setLevel(selLv);if(selLv==2)setTimeout(()=>cast('LEVEL 2','Fortress \u2014 sentry turrets online [E]',200,1),700);sim=new Sim(onEv);sim.add(myId,myName,myHue,0);const nb=mode=='solo'?9:0;for(let i=0;i<nb;i++)sim.add('bot'+i,rnd(['Rex','Vix','Kai','Nox','Zed','Ace','Bolt','Jinx']),Math.random()*360|0,1)}
 if(mode!='solo'){roomCode=room;net=makeNet(room,mode);net.onmsg=m=>{if(sim)hostRecv(m);else clientRecv(m)};
   addEventListener('beforeunload',()=>net.send({t:'bye',id:myId}));$('rc').hidden=false;tickT=performance.now();started=1;startTicker()}
  $('msg').textContent=mode=='join'?'Connecting to room '+room+'\u2026':mode=='host'?'Room '+room+' is ready \u2014 tap the code at the top to copy it and send it to your friends':'';
 requestAnimationFrame(frame)}
try{$('nm').value=localStorage.getItem('ar-name')||''}catch(e){}
function pickLv(n){selLv=n;$('l1').classList.toggle('on',n==1);$('l2').classList.toggle('on',n==2);sfx('ui',{j:0})}$('l1').onclick=()=>pickLv(1);$('l2').onclick=()=>pickLv(2);
selLv=Math.random()<.5?1:2; /* map is random: no map buttons on the home screen */
try{localStorage.removeItem('ar-auto')}catch(e){}   /* no more auto-start of level 2 after a win: Back to Home just goes home */
$('home').onclick=()=>{sfx('ui',{j:0});try{net&&net.send({t:'bye',id:myId})}catch(e){}setTimeout(()=>location.reload(),160)};$('solo').onclick=()=>start('solo');function goOnline(mode){audioInit();
  if(!fbInit()){netNote('Could not load Firebase. Check your internet connection and reload.',1);return}
  const busy=b=>{$('host').disabled=b;$('join').disabled=b};
  if(mode=='host'){busy(1);$('msg').textContent='';waitUp(9000).then(()=>withTimeout(createRoomCode(),9000)).then(c=>{busy(0);start('host',c)}).catch(e=>{busy(0);netNote(netErr(e),1)});return}
  const code=cleanRoom($('rm').value);
  if(!ROOM_RE.test(code)){netNote(code.length<5?'Enter the 5-character room code from the host.':'Room codes never contain I, L, O, 0 or 1 \u2014 check the code and try again.',1);$('rm').focus();return}
  busy(1);waitUp(9000).then(()=>withTimeout(checkRoom(code),9000)).then(r=>{busy(0);
   if(r=='none')netNote('Room '+code+' was not found. Check the code, or ask the host to create the room first.',1);
   else if(r=='full')netNote('Room '+code+' is full ('+MAXH+' players).',1);
   else start('join',code)}).catch(e=>{busy(0);netNote(netErr(e),1)})}
$('host').onclick=()=>goOnline('host');$('join').onclick=()=>goOnline('join');netBoot();
$('rm').oninput=e=>{e.target.value=cleanRoom(e.target.value)};$('rm').onkeydown=e=>{if(e.key=='Enter')goOnline('join')};
try{const q=new URLSearchParams(location.search).get('room');if(q)$('rm').value=cleanRoom(q)}catch(e){}
$('rc').onclick=()=>{const u=/^https?:/.test(location.protocol)?location.origin+location.pathname+'?room='+roomCode:'',t=u||roomCode;
  const ok=()=>msgFlash(u?'Invite link copied':'Room code '+roomCode+' copied');
  try{navigator.clipboard.writeText(t).then(ok,()=>msgFlash('Room code: '+roomCode))}catch(e){msgFlash('Room code: '+roomCode)}};

/* ---- layout editor: drag a button to move it, pick it and use Size to scale it; every change is saved to localStorage at once ---- */
const EDK=[['joy','MOVE','#c9d4dc88',60],['fire','FIRE','#ff5d4acc',56],['dash','DASH','#ffb02ecc',34],['rel','RELOAD','#59b8ffcc',28],['trt','TURRET','#4ae0c0cc',30],['bmb','BOMB','#ff7a3acc',30],['rpb','ROPE','#7ad0ffcc',30],['opn','OPEN','#ffb02ecc',34],['swa','SWAP','#c58bffcc',30],['lot','LOOT LIST','#ffd24acc',44]],ec=$('ec'),ex=ec.getContext('2d');
let edSel='fire',edDrag=null;
const edPos=k=>{const l=LY[k],d=EDK.find(q=>q[0]==k);return{x:l.x*innerWidth,y:l.y*innerHeight,r:d[3]*l.s*UIS}};
function edSync(){$('esz').value=Math.round(LY[edSel].s*100);$('eop').value=Math.round(LYO*100);$('en').textContent=EDK.find(q=>q[0]==edSel)[1]+' selected \u2013 drag to move'}
function edDraw(){if(ec.width!=innerWidth||ec.height!=innerHeight){ec.width=innerWidth;ec.height=innerHeight}const W=ec.width,H=ec.height;
 ex.globalAlpha=1;ex.fillStyle='#0b1015';ex.fillRect(0,0,W,H);ex.strokeStyle='#1a2530';ex.lineWidth=1;ex.beginPath();for(let x=0;x<W;x+=50){ex.moveTo(x,0);ex.lineTo(x,H)}for(let y=0;y<H;y+=50){ex.moveTo(0,y);ex.lineTo(W,y)}ex.stroke();
 ex.fillStyle='#ffffff10';ex.font='bold 22px "Trebuchet MS",sans-serif';ex.textAlign='center';ex.fillText('GAME SCREEN',W/2,H/2);
 for(const d of EDK){const p=edPos(d[0]);ex.globalAlpha=LYO;ex.fillStyle=d[2];ex.beginPath();ex.arc(p.x,p.y,p.r,0,6.28);ex.fill();ex.lineWidth=2;ex.strokeStyle='#fff';ex.stroke();
  if(d[0]=='joy'){ex.fillStyle='#fff8';ex.beginPath();ex.arc(p.x,p.y,p.r*.37,0,6.28);ex.fill()}
  ex.globalAlpha=1;ex.fillStyle='#fff';ex.font='bold '+Math.max(10,p.r*.28|0)+'px "Trebuchet MS",sans-serif';ex.textBaseline='middle';ex.fillText(d[1],p.x,d[0]=='joy'?p.y+p.r+14:p.y);ex.textBaseline='alphabetic';
  if(d[0]==edSel){ex.strokeStyle='#ffb02e';ex.lineWidth=4;ex.setLineDash([8,6]);ex.beginPath();ex.arc(p.x,p.y,p.r+8,0,6.28);ex.stroke();ex.setLineDash([])}}}
function edOpen(){loadLY();LY=Object.assign(DEF(),cp(LY||{}));$('ed').hidden=false;edSync();edDraw()}
let edRAF=0;function edDrawSoon(){if(edRAF)return;edRAF=requestAnimationFrame(()=>{edRAF=0;edDraw()})}
ec.onpointerdown=e=>{let best=null,bd=1e9;for(const d of EDK){const p=edPos(d[0]),q=Math.hypot(e.clientX-p.x,e.clientY-p.y);if(q<p.r+14&&q<bd){bd=q;best=d[0]}}
 if(best){edSel=best;edDrag={k:best,ox:e.clientX-LY[best].x*innerWidth,oy:e.clientY-LY[best].y*innerHeight};try{ec.setPointerCapture(e.pointerId)}catch(x){}edSync();edDrawSoon()}};
ec.onpointermove=e=>{if(!edDrag)return;const l=LY[edDrag.k];l.x=cl((e.clientX-edDrag.ox)/innerWidth,.04,.96);l.y=cl((e.clientY-edDrag.oy)/innerHeight,.2,.96);edDrawSoon()};
ec.onpointerup=ec.onpointercancel=()=>{if(edDrag){edDrag=null;saveLY()}};
$('esz').oninput=()=>{LY[edSel].s=cl(+$('esz').value/100,.5,1.8);saveLY();edDrawSoon()};
$('eop').oninput=()=>{LYO=cl(+$('eop').value/100,.25,1);saveLY();edDrawSoon()};
$('ers').onclick=()=>{LY=DEF();LYO=1;saveLY();edSync();edDrawSoon();sfx('ui',{j:0})};
$('eok').addEventListener('pointerdown',e=>{e.preventDefault();$('ed').hidden=true;saveLYflush();sfx('ui',{j:0})});
$('set').addEventListener('pointerdown',e=>{e.preventDefault();sfx('ui',{j:0});edOpen()});
addEventListener('resize',()=>{if(!$('ed').hidden)edDrawSoon()});
/* ---- pause menu: solo really stops the match; in hosted / joined rooms the match keeps running (you just stand still) ---- */
function pzPos(){const W=innerWidth,bw=Math.max(120,Math.min(280,W/UIS-520));$('pz').style.left=(W/2+bw*UIS/2+14*UIS)+'px'}addEventListener('resize',()=>{try{if(!$('pz').hidden)pzPos()}catch(e){}});
function setPause(v){if(v==paused||(!sim&&!net))return;paused=v;const solo=sim&&!net;$('pm').hidden=!v;$('pn').textContent=solo?'Game stopped':'Room '+roomCode+' \u2014 the match keeps running while you are paused';
 if(v){for(const k in keys)keys[k]=0;M.down=false;ST.fire=null;ST.mv=null;ST.dash=ST.rel=ST.trt=0;upq=0}
 try{if(solo&&AC)v?AC.suspend():AC.resume()}catch(e){}}
const fastTap=(el,fn)=>{el.addEventListener('pointerdown',e=>{e.preventDefault();fn()})};
fastTap($('pz'),()=>{sfx('ui',{j:0});setPause(true)});fastTap($('pr'),()=>{sfx('ui',{j:0});setPause(false)});fastTap($('pl'),()=>{sfx('ui',{j:0});edOpen()});
fastTap($('ph'),()=>{try{net&&net.send({t:'bye',id:myId})}catch(e){}setTimeout(()=>location.reload(),60)});
addEventListener('resize',pzPos);document.addEventListener('visibilitychange',()=>{if(document.hidden&&sim&&!net)setPause(true)});
let last=0,acc=0,sT=0,iT=0,AGE=0,F60=1,snapOk=0;
/* ---- quality lock (replaces the old adaptive "90 fps governor") ----
   The old governor lowered render resolution (100% -> 50%) and switched off glows/shadows whenever frames ran
   slow. That is what made text turn blurry on mobile Chrome. Quality is now LOCKED: resolution scale is always
   1.0 (full device pixel ratio, capped at 2) and glows/shadows are always on. perfGov() is kept as a stub so
   existing calls and the FPS read-out still work, but it never changes quality. */
const PERF={tiers:[1],ti:0,buf:[],last:0,hold:0,bad:0,good:0,noUp:0,upAt:0,disp:1e9};
function perfTier(){}
function perfGov(){}
function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;try{perfGov(now)}catch(x){}try{musicTick(dt,now)}catch(x){}
  if(sim&&!net){if(paused){acc=0;AGE=0}else{acc+=dt;const m=sim.p[myId];let stp=0;while(acc>=TICK){if(m)m.in=readInput();sim.step(TICK);acc-=TICK;stp=1}
   if(stp||!snapOk){snap=sim.snap();snapAt=now;snapOk=1}   /* build a snapshot only when the 60 Hz sim actually advanced */
   AGE=acc}}                                                /* leftover time since the last sim step: used to extrapolate so motion is smooth at 90 Hz */
  else{AGE=0;if(net&&!sim)clientPredict(now,dt)}   // rooms: the host simulation and the input/network loop run on the worker clock (netTick)
  render(sim&&paused&&!net?0:dt,now);requestAnimationFrame(frame)}

/* ---- render ---- */
function render(dt,now){if(snap.lv&&snap.lv!=LV)setLevel(snap.lv);if(!sim&&net)netFrame(now);
 const age=AGE,fdt=dt>0?dt:1/60,f60=fdt*60,K4=1-Math.pow(.6,f60),K5=1-Math.pow(.5,f60);F60=f60;
 for(const p of snap.p){let v=views[p.id];if(!v)v=views[p.id]={x:p.x,y:p.y,tr:[]};
  let nq=null;if(!sim&&net){nq=netPos(p);v.x=nq.x;v.y=nq.y}else{const tx=p.x+p.vx*age,ty=p.y+p.vy*age;if(Math.hypot(tx-v.x,ty-v.y)>200)v.x=tx,v.y=ty;else{v.x+=(tx-v.x)*K4;v.y+=(ty-v.y)*K4}}
  v.ph=(v.ph||0)+Math.hypot(p.vx,p.vy)*dt*.04;v.rc=Math.max(0,(v.rc||0)-dt*9);v.hf=Math.max(0,(v.hf||0)-dt);v.fl=Math.max(0,(v.fl||0)-dt);v.born=Math.max(0,(v.born||0)-dt);v.heal=Math.max(0,(v.heal||0)-dt*1.2);v.hs=v.hs==null||p.hp<v.hs?p.hp:Math.min(p.hp,v.hs+120*dt);
  {const pa=nq?nq.a:p.a;v.a=v.a==null?pa:v.a+((((pa-v.a+Math.PI)%6.2832)+6.2832)%6.2832-Math.PI)*K5}
  if(p.al&&Math.hypot(p.vx,p.vy)>150&&Math.random()<.25)parts.push({x:v.x-Math.cos(v.a)*6+(Math.random()-.5)*14,y:v.y+14+(Math.random()-.5)*6,vx:(Math.random()-.5)*30,vy:(Math.random()-.5)*30,l:.45,m:.45,c:'#cfdcea',s:3,gr:9,rd:1,a0:.22});
  if(p.dt>0&&p.al){v.tr.push({x:v.x,y:v.y,l:.25})}v.tr=v.tr.filter(t=>(t.l-=dt)>0)}
 const m=me(),mv=views[myId];
 let ft=null,lp=.15;specId=null;
 if(m&&m.al)ft=mv;
 else if(m){const kp=snap.p.find(q=>q.id==m.kb);let tp=kp&&kp.al?kp:null;
  if(!tp){let bd=1e9;const rf=kp||m;for(const q of snap.p)if(q.al&&q.id!=myId){const d=Math.hypot(q.x-rf.x,q.y-rf.y);if(d<bd){bd=d;tp=q}}}
  if(tp){specId=tp.id;ft=views[tp.id]}lp=.07}
 if(ft){const lq=1-Math.pow(1-lp,f60);cam.x+=(ft.x-cam.x)*lq;cam.y+=(ft.y-cam.y)*lq}
 const hw=innerWidth/2/S,hh=innerHeight/2/S;cam.x=cl(cam.x,Math.min(hw,MW/2),Math.max(MW-hw,MW/2));cam.y=cl(cam.y,Math.min(hh,MH/2),Math.max(MH-hh,MH/2));
 shake*=Math.pow(.85,f60);if(shake<.4)shake=0;flash=Math.max(0,flash-dt);hitm=Math.max(0,hitm-dt);
 cx.setTransform(1,0,0,1,0,0);cx.fillStyle='#070a0d';cx.fillRect(0,0,cv.width,cv.height);
 const sx=(Math.random()-.5)*shake*(window.AR_SHK===undefined?1:window.AR_SHK),sy=(Math.random()-.5)*shake*(window.AR_SHK===undefined?1:window.AR_SHK);
 const SZ=S*(1+(window.BFX?BFX.zoom(dt):0));cx.setTransform(dpr*SZ,0,0,dpr*SZ,dpr*(innerWidth/2-cam.x*SZ+sx),dpr*(innerHeight/2-cam.y*SZ+sy));
 let bf=0;try{bf=window.BFX?BFX.floor(now,dt,hw,hh):0}catch(x){bf=0;if(!window.__bfE){window.__bfE=1;console.error('BFX floor',x)}}
 if(!bf){const g=cx.createRadialGradient(MW/2,MH/2,300,MW/2,MH/2,3000);g.addColorStop(0,LV==2?'#241c22':'#17212b');g.addColorStop(1,LV==2?'#150f14':'#0f161d');cx.fillStyle=g;cx.fillRect(0,0,MW,MH);
 for(const q of PAT){if(Math.abs(q.x-cam.x)>hw+q.r||Math.abs(q.y-cam.y)>hh+q.r)continue;const gg=cx.createRadialGradient(q.x,q.y,0,q.x,q.y,q.r),c=['19,38,27','52,44,24','24,38,54'][q.k];gg.addColorStop(0,`rgba(${c},.8)`);gg.addColorStop(1,`rgba(${c},0)`);cx.fillStyle=gg;cx.fillRect(q.x-q.r,q.y-q.r,q.r*2,q.r*2)}
 for(const d of DEC){if(Math.abs(d.x-cam.x)>hw+40||Math.abs(d.y-cam.y)>hh+40)continue;cx.save();cx.translate(d.x,d.y);cx.rotate(d.r);cx.scale(d.s,d.s);
  if(d.k==0){cx.strokeStyle='#2f5a3a';cx.lineWidth=2;cx.beginPath();for(let i=-1;i<2;i++){cx.moveTo(i*4,4);cx.quadraticCurveTo(i*6,-4,i*9,-10)}cx.stroke()}
  else if(d.k==1){cx.fillStyle='#2b3743';cx.beginPath();cx.ellipse(0,0,11,8,0,0,6.28);cx.fill();cx.fillStyle='#3a4856';cx.beginPath();cx.ellipse(-2,-2,6,4,0,0,6.28);cx.fill()}
  else if(d.k==2){cx.fillStyle='#1c3a52';cx.beginPath();cx.ellipse(0,0,26,14,0,0,6.28);cx.fill();cx.strokeStyle='#3a6a8a55';cx.lineWidth=2;cx.stroke()}
  else if(d.k==3){cx.fillStyle='#1b3324';for(const[x,y,r]of[[0,0,12],[10,4,9],[-9,5,8]]){cx.beginPath();cx.arc(x,y,r,0,6.28);cx.fill()}cx.fillStyle='#24462f';cx.beginPath();cx.arc(-2,-3,6,0,6.28);cx.fill()}
  else if(d.k==4){cx.strokeStyle='#ffb02e30';cx.lineWidth=5;cx.beginPath();cx.moveTo(-22,8);cx.lineTo(0,-8);cx.lineTo(22,8);cx.stroke()}
  else if(d.k==5){cx.strokeStyle='#5a4a3a';cx.lineWidth=2;cx.beginPath();cx.moveTo(0,10);cx.lineTo(0,-28);cx.stroke();cx.fillStyle='#b23a3a88';cx.beginPath();cx.moveTo(0,-28);cx.lineTo(16,-24);cx.lineTo(0,-18);cx.closePath();cx.fill()}
  else{cx.strokeStyle='#3a4856';cx.lineWidth=3;cx.beginPath();cx.arc(0,0,14,0,6.28);cx.stroke();cx.beginPath();cx.moveTo(-14,0);cx.lineTo(14,0);cx.moveTo(0,-14);cx.lineTo(0,14);cx.stroke()}
  cx.restore()}
 cx.fillStyle='#ffffff0a';cx.font='bold 120px "Trebuchet MS",sans-serif';cx.textAlign='center';for(const z of ZN)cx.fillText(z[0],z[1],z[2]);
 cx.strokeStyle='#1d2935';cx.lineWidth=1;cx.beginPath();for(let x=0;x<=MW;x+=100){cx.moveTo(x,0);cx.lineTo(x,MH)}for(let y=0;y<=MH;y+=100){cx.moveTo(0,y);cx.lineTo(MW,y)}cx.stroke();
 cx.strokeStyle='#ffb02e55';cx.lineWidth=6;cx.setLineDash([30,20]);cx.strokeRect(3,3,MW-6,MH-6);cx.setLineDash([]);}
 let wd=0;if(bf){try{BFX.walls(now,hw,hh);wd=1}catch(x){if(!window.__bfE2){window.__bfE2=1;console.error('BFX walls',x)}}}
 if(!wd){for(const[x,y,w,h]of WALLS){if(x>cam.x+hw+60||x+w<cam.x-hw-60||y>cam.y+hh+60||y+h<cam.y-hh-60)continue;
  cx.fillStyle='#000a';cx.fillRect(x+8,y+10,w,h);cx.fillStyle='#2a3947';cx.fillRect(x,y,w,h);
  cx.strokeStyle='#202d3a';cx.lineWidth=1;cx.beginPath();for(let yy=y+14,r=0;yy<y+h;yy+=14,r++){cx.moveTo(x,yy);cx.lineTo(x+w,yy);for(let xx=x+(r%2?12:0)+24;xx<x+w;xx+=24){cx.moveTo(xx,yy-14);cx.lineTo(xx,yy)}}cx.stroke();
  cx.fillStyle='#4a6075';cx.fillRect(x,y,w,4);cx.fillStyle='#ffb02e55';for(let xx=x+4;xx<x+w-8;xx+=20)cx.fillRect(xx,y+h-5,9,3);
  cx.fillStyle='#6f889c';for(const[a,b]of[[x+5,y+8],[x+w-5,y+8],[x+5,y+h-8],[x+w-5,y+h-8]]){cx.beginPath();cx.arc(a,b,1.8,0,6.28);cx.fill()}
  cx.strokeStyle='#5a748a';cx.lineWidth=2;cx.strokeRect(x,y,w,h)}}
 const tm=now/1000;
 if(bf)try{BFX.pads(snap.k,tm)}catch(x){}
 for(const k of snap.k)pickupArt(k,tm);

 for(const q of snap.cr||[])crateArt(q,now,q.id==crNear);
 cx.globalAlpha=1;for(const n of snap.n||[]){const sx=Math.cos(now/260+n.id),y=n.y+Math.sin(now/300+n.id)*2;if(bf)try{BFX.coin(n.x,y,now,n.id,n.v>=10)}catch(x){}cx.fillStyle='#ffc83a30';cx.beginPath();cx.arc(n.x,y,15,0,6.28);cx.fill();cx.fillStyle='#0005';cx.beginPath();cx.ellipse(n.x+2,n.y+9,6,2.5,0,0,6.28);cx.fill();n.v>=10?gem(n.x,y,sx):coin(n.x,y,n.v>3?10:8,Math.abs(sx)*.9+.1)}
 for(const b of(!sim&&net?clientBullets(now):snap.b)){const x=b.x+b.vx*age,y=b.y+b.vy*age,l=Math.hypot(b.vx,b.vy);if(bf&&l>0){BFX.bullet(b,x,y,l)}else{cx.strokeStyle=`hsl(${b.h} 95% 75%)`;cx.lineWidth=4;cx.lineCap='round';cx.beginPath();cx.moveTo(x,y);cx.lineTo(x-b.vx/l*28,y-b.vy/l*28);cx.stroke();cx.fillStyle='#fff';cx.beginPath();cx.arc(x,y,3,0,6.28);cx.fill()}}
 if(lockId){const q=snap.p.find(p=>p.id==lockId)||(snap.t||[]).find(t=>'T'+t.id==lockId);if(q){cx.strokeStyle='#ff4a3a';cx.lineWidth=2;cx.setLineDash([6,5]);cx.lineDashOffset=-now/50;cx.beginPath();cx.arc((views[q.id]||q).x,(views[q.id]||q).y,R+12,0,6.28);cx.stroke();cx.setLineDash([])}}
 for(const t of snap.t||[])turretArt(t,now,m);for(const b of snap.bm||[])bombArt(b,now,m);for(const r of snap.rp||[])ropeArt(r,now);
 for(const p of snap.p){const v=views[p.id];if(!p.al){corpse(v,p);continue}
  if(bf)BFX.under(p,v,now);
  for(const t of v.tr){cx.globalAlpha=t.l*1.5;cx.fillStyle=`hsl(${p.hue} 90% 62%)`;cx.beginPath();cx.arc(t.x,t.y,R,0,6.28);cx.fill()}
  cx.globalAlpha=p.inv>0&&((now/90)|0)%2?.45:1;
  let bs=1;if(v.born>0){const k=1-v.born/.5;bs=Math.max(.05,1+2.70158*Math.pow(k-1,3)+1.70158*Math.pow(k-1,2));cx.save();cx.translate(v.x,v.y);cx.scale(bs,bs);cx.translate(-v.x,-v.y)}
  drawChar(p,v,now);if(bs!=1)cx.restore();cx.globalAlpha=1;
  if(v.heal>0){cx.strokeStyle=`rgba(125,255,166,${v.heal})`;cx.lineWidth=4;cx.beginPath();cx.arc(v.x,v.y,R+8+(1-v.heal)*34,0,6.28);cx.stroke();cx.fillStyle=`rgba(95,211,122,${v.heal*.28})`;cx.beginPath();cx.arc(v.x,v.y,R+6,0,6.28);cx.fill()}
  if(m&&!m.al&&!snap.w&&p.id==m.kb){cx.strokeStyle='#ff4a3a';cx.lineWidth=3;cx.setLineDash([8,6]);cx.lineDashOffset=-now/40;cx.beginPath();cx.arc(v.x,v.y,R+16+Math.sin(now/120)*3,0,6.28);cx.stroke();cx.setLineDash([]);}
  if(p.rel>0){cx.strokeStyle='#fff';cx.lineWidth=3;cx.beginPath();cx.arc(v.x,v.y,R+13,-1.57,-1.57+6.28*(1-p.rel/WP[p.w].rel));cx.stroke()}
  if(bf)BFX.tag(p,v,now,dt);else{cx.fillStyle='#000a';cx.fillRect(v.x-22,v.y-R-18,44,6);cx.fillStyle=v.hs>50?'#5fd37a':v.hs>25?'#ffcf4a':'#ff6a5f';cx.fillRect(v.x-22,v.y-R-18,44*Math.max(0,v.hs)/100,6);
  cx.fillStyle='#e8eef2';cx.font='12px "Trebuchet MS",sans-serif';cx.textAlign='center';cx.textBaseline='alphabetic';cx.fillText(p.name,v.x,v.y-R-24)}}
 if(bf)BFX.rings(rings,dt);else{for(const r of rings){r.l-=dt;r.r+=(r.g||160)*dt;cx.globalAlpha=Math.max(0,r.l/r.m);cx.strokeStyle=r.c;cx.lineWidth=3;cx.beginPath();cx.arc(r.x,r.y,Math.max(0,r.r),0,6.28);cx.stroke()}}rings=rings.filter(r=>r.l>0);
 cx.save();cx.globalCompositeOperation='lighter';for(const b of beams){b.l-=dt;const k=Math.max(0,b.l/b.m),w=36*(k+.3),g=cx.createLinearGradient(0,b.y-320,0,b.y);g.addColorStop(0,`hsla(${b.h},95%,70%,0)`);g.addColorStop(1,`hsla(${b.h},95%,70%,${.6*k})`);cx.fillStyle=g;cx.fillRect(b.x-w/2,b.y-320,w,320)}cx.restore();beams=beams.filter(b=>b.l>0);
 if(bf)BFX.parts(parts,dt);else{for(const q of parts){q.l-=dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.vx*=.93;q.vy*=.93;cx.globalAlpha=Math.max(0,q.l/q.m);cx.fillStyle=q.c;cx.fillRect(q.x-q.s/2,q.y-q.s/2,q.s,q.s)}}cx.globalAlpha=1;parts=parts.filter(q=>q.l>0);
if(bf)BFX.texts(texts,dt);else{for(const q of texts){q.l-=dt;q.y-=38*dt;cx.globalAlpha=Math.min(1,q.l*2.5);cx.fillStyle=q.c;cx.strokeStyle='#000b';cx.lineWidth=3;cx.font='bold 17px "Trebuchet MS",sans-serif';cx.textAlign='center';cx.strokeText(q.t,q.x,q.y);cx.fillText(q.t,q.x,q.y)}}texts=texts.filter(q=>q.l>0);cx.globalAlpha=1;
 if(bf)try{BFX.post(now,dt,m,hw,hh)}catch(x){if(!window.__bfE3){window.__bfE3=1;console.error('BFX post',x)}}
 try{flyDraw(dt)}catch(x){}try{swapUI(m,mv)}catch(x){}try{crUI(m,mv)}catch(x){}
 hud(m,now,dt)}

/* ============ GUN PADS: swap prompt, pick animation ============ */
const GN={smg:1,shotgun:1,rifle:1},SWMX=(()=>{const m={dps:0,rng:0,mag:0};for(const w in WP){const a=WP[w];m.dps=Math.max(m.dps,a.dmg*a.pel/a.rate);m.rng=Math.max(m.rng,a.spd*a.life);m.mag=Math.max(m.mag,a.mag)}return m})();
let swUntil=0,swSig='',swEl=null,swBt=null,flys=[];window.SWK=null;
const GPIC={
smg:'<svg viewBox="0 0 64 28" aria-hidden="true"><g stroke="#000" stroke-opacity=".55" stroke-width="1.2" stroke-linejoin="round"><rect x="3" y="9" width="7" height="8" rx="1.8" fill="#4a5865"/><rect x="8" y="7" width="48" height="11" rx="3" fill="#2b343d"/><rect x="14" y="7" width="38" height="3.6" fill="#4a5865" stroke="none"/><rect x="20" y="17" width="9" height="10" rx="1.6" fill="#161c22"/><rect x="55" y="9" width="6" height="7" rx="1.6" style="fill:var(--c)" stroke="none"/></g></svg>',
shotgun:'<svg viewBox="0 0 64 28" aria-hidden="true"><g stroke="#000" stroke-opacity=".55" stroke-width="1.2" stroke-linejoin="round"><rect x="2" y="6" width="20" height="14" rx="3.5" fill="#8a5a30"/><rect x="18" y="9" width="42" height="8" rx="2.2" fill="#2b343d"/><rect x="32" y="7" width="14" height="12" rx="2" fill="#4a5865"/><rect x="58" y="10" width="4" height="6" rx="1.2" style="fill:var(--c)" stroke="none"/></g></svg>',
rifle:'<svg viewBox="0 0 64 28" aria-hidden="true"><g stroke="#000" stroke-opacity=".55" stroke-width="1.2" stroke-linejoin="round"><rect x="1" y="9" width="9" height="10" rx="2.5" fill="#4a5865"/><rect x="6" y="10" width="54" height="7" rx="2.2" fill="#2b343d"/><rect x="14" y="10" width="40" height="2.6" fill="#4a5865" stroke="none"/><rect x="22" y="2.5" width="22" height="6.5" rx="2.2" fill="#7b4aa8"/><rect x="42" y="2.5" width="2.8" height="6.5" fill="#88ccff" stroke="none"/><rect x="14" y="17" width="7" height="9" rx="1.5" fill="#161c22"/><rect x="58" y="11" width="4" height="5" rx="1.2" style="fill:var(--c)" stroke="none"/></g></svg>'};
function gunIc(t){return GPIC[t]||AB_IC.gun}
const gunStat=a=>({dps:a.dmg*a.pel/a.rate,rng:a.spd*a.life,mag:a.mag});
function swapHTML(k,m){const nw=WP[k.t],cur=WP[m.w]||WP.pistol,sw=!!GN[m.w],A=gunStat(cur),B=gunStat(nw),key=ST.on?'TAP':(KB.swap.find(Boolean)?kname(KB.swap.find(Boolean)):'TAP');
 const rows=[['DAMAGE / SEC','dps'],['RANGE','rng'],['MAGAZINE','mag']].map(([l,q])=>{const d=B[q]/A[q]-1,c=d>.03?'up':d<-.03?'dn':'eq';
  return '<div class="swr"><span>'+l+'</span><div class="bt"><i class="a" style="width:'+Math.round(A[q]/SWMX[q]*100)+'%"></i><i class="b '+c+'" style="width:'+Math.round(B[q]/SWMX[q]*100)+'%"></i></div><em class="'+c+'">'+(c=='up'?'▲':c=='dn'?'▼':'=')+'</em></div>'}).join('');
 return '<div class="card"><div class="in"><div class="hd"><span class="gpic">'+gunIc(k.t)+(key=='TAP'?'':'<kbd>'+key+'</kbd>')+'</span><div><b>'+(sw?'SWAP ':'PICK UP ')+'<span class="gn">'+nw.n.toUpperCase()+'</span></b><small>'+(sw?'Your '+cur.n+' stays on the pad':'Replaces your '+cur.n)+'</small></div></div><div class="vs"><span class="f">'+cur.n+'</span><i>'+(sw?'⇄':'→')+'</i><span class="t">'+nw.n+'</span></div>'+rows+'<div class="swa">AMMO IN THIS GUN <b>'+(k.am==null?nw.mag:k.am)+'</b><i>+'+(k.rv==null?nw.mag*2:k.rv)+'</i></div></div></div>'}
function swapUI(m,mv){
 try{lyPlace(document.getElementById('swb'),'swa')}catch(e){}
 if(!swEl){swEl=document.getElementById('swp');swBt=document.getElementById('swb');const dn=e=>{e.preventDefault();e.stopPropagation();swq=1;swUntil=performance.now()+300;swBt.classList.add('press');setTimeout(()=>swBt.classList.remove('press'),160)};swBt.addEventListener('pointerdown',dn);swBt.addEventListener('contextmenu',e=>e.preventDefault())}
 let k=null;
 if(m&&m.al&&mv&&!paused&&!snap.w&&performance.now()>swUntil){let bd=1e9;const mg=eff({w:m.w,up:{[m.w]:m.ul||[0,0,0,0]}}).mag;
  for(const q of snap.k){if(!q.on||!GN[q.t])continue;const d=Math.hypot(q.x-mv.x,q.y-mv.y);if(d<R+SWR-6&&d<bd){if(q.t==m.w&&(q.am==null?WP[q.t].mag:q.am)+(q.rv==null?WP[q.t].mag*2:q.rv)<=m.am+(m.rv|0))continue;bd=d;k=q}}}
 window.SWK=k;
 if(!k){if(swSig){swSig='';swEl.classList.add('off');swBt.classList.add('off')}return}
 const sig=k.t+'|'+m.w+'|'+KB.swap.join()+'|'+(ST.on?1:0);
 if(sig!==swSig){swSig=sig;swEl.innerHTML=swapHTML(k,m);swEl.classList.remove('off');const kc=KB.swap.find(Boolean);swBt.innerHTML=abHTML(gunIc(k.t),'Swap','for <span class="gn">'+WP[k.t].n+'</span>',ST.on||!kc?'':kname(kc)).replace('class="ab-ic"','class="ab-ic gp"');swBt.classList.toggle('tch',!!ST.on);swBt.style.setProperty('--c',PKC[k.t]);swBt.classList.remove('off')}
 const x=(k.x-cam.x)*S+innerWidth/2,y=(k.y-cam.y)*S+innerHeight/2-30*S;
 swEl.style.setProperty('--c',PKC[k.t]);
 swEl.style.transform='translate3d('+Math.round(Math.min(innerWidth-120,Math.max(120,x)))+'px,'+Math.round(Math.max(170,y))+'px,0)'}

/* ============ LOOT CRATES: touch a crate -> OPEN button -> item list -> tap one item to take it ============ */
const CRN={hp:'MEDKIT',shield:'SHIELD',kit:'TURRET KIT',ammo:'AMMO',coin:'COINS'},CRG={hp:'✚',shield:'◆',kit:'▲',ammo:'≡',coin:'●',smg:'➤',shotgun:'➤',rifle:'➤'},CRC=Object.assign({coin:'#ffc83a'},PKC);
let crOpen=0,crNear=0,crSig='',crEl=null,crBt=null,crM=null;const crHide={};
const crVis=(q,now)=>q.it.filter(i=>!(crHide[i.u]>now));
function crMag(m){return eff({w:m.w,up:{[m.w]:m.ul||[0,0,0,0]}}).mag}
function crFull(i,m){const t=i.t;if(t=='hp')return m.hp>=100&&(m.mk|0)>=3;if(t=='shield')return m.sh>=50;if(t=='kit')return m.kt>=3;if(t=='ammo')return(m.rv|0)>=crMag(m)*4;
 if(WP[t]&&t==m.w)return(i.am==null?WP[t].mag:i.am)+(i.rv==null?WP[t].mag*2:i.rv)<=m.am+(m.rv|0);return false}
function crateNear(m,mv,now){if(!m||!m.al||!mv||paused||snap.w)return null;let bd=1e9,k=null;
 for(const q of snap.cr||[]){const d=Math.hypot(q.x-mv.x,q.y-mv.y);if(d<R+34&&d<bd&&crVis(q,now).length){bd=d;k=q}}return k}
function crTake(q,i){crq.push({c:q.id,j:i.u});if(net&&!sim)crHide[i.u]=performance.now()+1400;sfx('ui',{j:0});crSig=''}
var AB_IC={
 crate:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M3.5 8.5 12 4l8.5 4.5v8L12 21l-8.5-4.5z"/><path d="M3.5 8.5 12 13l8.5-4.5M12 13v8"/></svg>',
 swap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/></svg>',
 hp:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="7" width="17" height="13" rx="3"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M12 10.5v6M9 13.5h6"/></svg>',
 shield:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8 19.6 6v5.6c0 4.6-3.1 8-7.6 9.7-4.5-1.7-7.6-5.1-7.6-9.7V6z"/></svg>',
 kit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 4 20.5 19h-17z"/><circle cx="12" cy="14.2" r="1.7" fill="currentColor" stroke="none"/></svg>',
 ammo:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 21v-9.5L9 7.5l2.5 4V21zM12.5 21v-6l2.2-3.5 2.3 3.5v6z"/></svg>',
 coin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none"/></svg>',
 gun:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 10.5h12.2l1.8-2h5v5.2h-5.6l-1 2.3h-3.2l-.8 3.5H6.6l1-3.5H2.5z"/></svg>'};
function abHTML(ic,l,s,k){return'<span class="ab"><span class="ab-i"><span class="ab-ic">'+ic+'</span><span class="ab-tx"><b>'+l+'</b><small>'+s+'</small></span>'+(k?'<kbd>'+k+'</kbd>':'')+'<i class="ab-sh"></i></span></span>'}
function crTile(i,m,n){const t=i.t,w=WP[t],full=crFull(i,m);let d='';
 if(w)d=(i.am==null?w.mag:i.am)+' + '+(i.rv==null?w.mag*2:i.rv);else if(t=='hp')d='+40 HP';else if(t=='shield')d='+50 shield';else if(t=='kit')d='+1 kit';else if(t=='ammo')d='+'+Math.round(crMag(m)*1.2)+' rounds';else if(t=='coin')d='+'+i.v+' coins';
 return'<div class="ci'+(full?' full':'')+'" data-u="'+i.u+'" style="--c:'+(CRC[t]||'#ffb02e')+';--n:'+(n|0)+'"><i>'+(AB_IC[w?'gun':t]||AB_IC.crate)+'</i><b>'+(CRN[t]||(w?w.n.toUpperCase():t))+'</b><small>'+(full?'Already full':d)+'</small></div>'}
function lyPlace(el,k){const l=lay(k),s=innerWidth+'|'+innerHeight+'|'+l.x+'|'+l.y+'|'+l.s+'|'+UIS;if(el._ly===s)return;el._ly=s;
 el.classList.add('lyx');el.style.left=l.x*innerWidth+'px';el.style.top=l.y*innerHeight+'px';el.style.setProperty('--ls',l.s*UIS)}
function crUI(m,mv){
 if(!crEl){crEl=$('crp');crBt=$('crb');
  crBt.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();if(crNear){crOpen=crNear;crSig='';sfx('ui',{j:0})}});
  crBt.addEventListener('contextmenu',e=>e.preventDefault());
  crEl.addEventListener('pointerdown',e=>{e.stopPropagation();const t=e.target.closest&&e.target.closest('.ci,.cx,.ta');if(!t)return;e.preventDefault();
   if(t.classList.contains('cx')){crOpen=0;crSig='';sfx('ui',{j:0});return}
   if(t.classList.contains('ta')){const q=(snap.cr||[]).find(c=>c.id==crNear);if(q&&crM)for(const it of crVis(q,performance.now()))if(!WP[it.t]&&!crFull(it,crM))crTake(q,it);return}
   const q=(snap.cr||[]).find(c=>c.id==crNear);if(!q)return;const it=q.it.find(x=>x.u==+t.dataset.u);if(it)crTake(q,it)});
  crEl.addEventListener('contextmenu',e=>e.preventDefault())}
 lyPlace(crBt,'opn');lyPlace(crEl,'lot');crM=m;
 const now=performance.now(),q=crateNear(m,mv,now);crNear=q?q.id:0;
 if(!q){crOpen=0;crSig='';crEl.classList.add('off');crBt.classList.add('off');return}
 const vis=crVis(q,now);
 if(crOpen!=q.id){ // in contact, crate still closed: show the OPEN button
  crEl.classList.add('off');
  const sig='b'+q.id+'|'+vis.length+'|'+KB.swap.join()+'|'+(ST.on?1:0);
  if(sig!==crSig){crSig=sig;const kc=KB.swap.find(Boolean);
   crBt.style.setProperty('--c',crBest(vis));crBt.innerHTML=abHTML(AB_IC.crate,'Open','Supply crate · '+vis.length+(vis.length==1?' item':' items'),ST.on||!kc?'':kname(kc));
   crBt.classList.toggle('tch',!!ST.on)}
  crBt.classList.remove('off');return}
 crBt.classList.add('off');
 const sig='p'+q.id+'|'+vis.map(i=>i.u+i.t+(crFull(i,m)?1:0)).join();
 if(sig!==crSig){crSig=sig;
  const tk=vis.filter(i=>!WP[i.t]&&!crFull(i,m)).length;crEl.style.setProperty('--c',crBest(vis));
  crEl.innerHTML='<div class="ch"><span class="chi">'+AB_IC.crate+'</span><span class="cht"><b>Supply crate</b><small>Tap an item to take it</small></span>'+(tk>1?'<button class="ta" type="button">Take all '+tk+'</button>':'')+'<button class="cx" type="button">Done</button></div><div class="cg">'+vis.map((i,n)=>crTile(i,m,n)).join('')+'</div>'}
 crEl.classList.remove('off')}
addEventListener('keydown',e=>{if(kis('swap',e.code)&&!window.KBL&&!e.repeat&&!paused&&crNear&&!window.SWK&&!(document.activeElement&&document.activeElement.tagName=='INPUT')){crOpen=crOpen==crNear?0:crNear;crSig=''}});
function crBest(vis){for(const i of vis)if(WP[i.t])return CRC[i.t]||'#ffb02e';for(const t of['shield','kit','hp','ammo','coin'])if(vis.some(i=>i.t==t))return CRC[t]||'#ffb02e';return'#ffb02e'}
function crateArt(q,now,near){const ph=Math.sin(now/300+q.id),n=q.it.length,c=crBest(q.it),bob=Math.sin(now/450+q.id)*1.1;
 cx.save();cx.translate(q.x,q.y);
 // soft coloured glow on the floor + a faint light column, tinted by the best item inside
 cx.fillStyle=c;for(const[r,a]of[[40,.05],[30,.07],[20,.1]]){cx.globalAlpha=a+.02*ph;cx.beginPath();cx.arc(0,3,r,0,6.28);cx.fill()}
 for(let k=0;k<7;k++){cx.globalAlpha=.07*(1-k/7)*(1+.3*ph);cx.fillRect(-7+k*.6,-10-k*9,14-k*1.2,9)}
 cx.globalAlpha=1;cx.scale(1.9,1.9);
 cx.fillStyle='#0006';cx.beginPath();cx.ellipse(1,8.5,9,3,0,0,6.28);cx.fill();
 cx.translate(0,-bob*.5);
 cx.lineWidth=1.4;cx.strokeStyle='#0d1319';
 cx.fillStyle='#3a4a58';rr(-8,-5,16,12,2.5);cx.fill();cx.stroke();                 // body
 cx.fillStyle='#27333e';cx.fillRect(-7.2,1.2,14.4,1.3);                              // seam
 cx.fillStyle='#566b7c';rr(-8.6,-8,17.2,5,2);cx.fill();cx.stroke();                  // lid
 cx.globalAlpha=.85+.15*ph;cx.fillStyle=c;cx.fillRect(-6,-6.9,12,1.1);cx.globalAlpha=1; // lid light strip
 cx.fillStyle='#8aa0b1';for(const[x,y]of[[-6,-3.6],[6,-3.6],[-6,5],[6,5]]){cx.beginPath();cx.arc(x,y,.9,0,6.28);cx.fill()}
 cx.fillStyle=c;cx.strokeStyle='#0d1319';cx.lineWidth=1;cx.beginPath();cx.moveTo(0,-1.2);cx.lineTo(3,1.8);cx.lineTo(0,4.8);cx.lineTo(-3,1.8);cx.closePath();cx.fill();cx.stroke(); // emblem
 const m=Math.min(n,5);cx.fillStyle=c;for(let k=0;k<m;k++){cx.beginPath();cx.arc((k-(m-1)/2)*3.4,11,1.1,0,6.28);cx.fill()} // one pip per item inside
 if(near){cx.globalAlpha=.6+.35*ph;cx.strokeStyle=c;cx.lineWidth=1.7;const w=14,h=12,l=5;
  for(const[sx,sy]of[[-1,-1],[1,-1],[1,1],[-1,1]]){cx.beginPath();cx.moveTo(sx*w,sy*(h-l));cx.lineTo(sx*w,sy*h);cx.lineTo(sx*(w-l),sy*h);cx.stroke()}}
 cx.restore()}
function eqToast(t,old){const el=document.getElementById('eqp');if(!el)return;
 el.innerHTML='<div class="in" style="--c:'+PKC[t]+'"><i class="bd"></i><div><b>'+WP[t].n+'</b><small>'+(old?'SWAPPED · '+WP[old].n+' LEFT ON THE PAD':'EQUIPPED')+'</small></div></div>'}
function sparkle(x,y,c,n,up){for(let i=0;i<n;i++){const a=Math.random()*6.28,s=60+Math.random()*180;parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-(up?90:0),l:.5+Math.random()*.4,m:.9,c,s:2+Math.random()*3})}}
function pickGunFx(e){const c=PKC[e.t],v=views[e.id],mine=e.id==myId;
 flys.push({id:e.id,t:e.t,c,x0:e.x,y0:e.y,live:1,l:.52,m:.52,r0:-.22});
 if(e.sw&&v)flys.push({id:e.id,t:e.sw,c:PKC[e.sw],x0:v.x,y0:v.y,ex:e.x,ey:e.y,live:0,l:.5,m:.5,r0:v.a||0});
 rings.push({x:e.x,y:e.y,r:6,l:.6,m:.6,c,g:300},{x:e.x,y:e.y,r:2,l:.4,m:.4,c:'#ffffff',g:170});
 sparkle(e.x,e.y,c,16,1);
 if(mine){swUntil=performance.now()+300;shake=Math.max(shake,3.5);eqToast(e.t,e.sw)}}
function flyDraw(dt){if(!flys.length)return;
 for(const f of flys){f.l-=dt;const v=views[f.id];if(!v){f.l=0;continue}
  const u=Math.min(1,Math.max(0,1-f.l/f.m)),e=u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2,ex=f.live?v.x:f.ex,ey=f.live?v.y:f.ey,
  mx=(f.x0+ex)/2,my=Math.min(f.y0,ey)-60-Math.abs(ex-f.x0)*.12,t=e,x=(1-t)*(1-t)*f.x0+2*(1-t)*t*mx+t*t*ex,y=(1-t)*(1-t)*f.y0+2*(1-t)*t*my+t*t*ey;
  const sc=f.live?1.55-.8*e:1.15-.25*e,rot=f.r0+e*(f.live?9.4:-6.3),al=1-Math.max(0,(e-.82)/.18),F=PKF[f.t];
  if(f.l>0&&Math.random()<.9)parts.push({x,y,vx:(Math.random()-.5)*50,vy:(Math.random()-.5)*50,l:.32,m:.32,c:f.c,s:3+Math.random()*3});
  cx.save();cx.globalAlpha=al;cx.globalCompositeOperation='lighter';const gr=cx.createRadialGradient(x,y,2,x,y,34*sc);gr.addColorStop(0,f.c+'aa');gr.addColorStop(1,f.c+'00');cx.fillStyle=gr;cx.beginPath();cx.arc(x,y,34*sc,0,6.28);cx.fill();cx.globalCompositeOperation='source-over';
  if(F){cx.translate(x,y);cx.rotate(rot);cx.scale(F[1]*sc,F[1]*sc);cx.translate(-1,F[2]);cx.shadowColor=f.c;cx.shadowBlur=16;F[0](f.c)}
  cx.restore();
  if(f.l<=0){if(f.live){v.fl=.14;rings.push({x:v.x,y:v.y,r:12,l:.5,m:.5,c:f.c,g:260},{x:v.x,y:v.y,r:4,l:.35,m:.35,c:'#fff',g:200});sparkle(v.x,v.y,f.c,14,0)}else{rings.push({x:ex,y:ey,r:6,l:.35,m:.35,c:f.c,g:130})}}}
 cx.globalAlpha=1;flys=flys.filter(f=>f.l>0)}

/* ---- character art (top-down soldier: boots, pack, torso, pads, arms, weapon, helmet) ---- */
const rr=(x,y,w,h,r)=>{cx.beginPath();cx.roundRect(x,y,w,h,r)};
const TIP={pistol:16,smg:22,shotgun:28,rifle:34,blaster:26};
/* ---- spawn items: detailed side-view weapon icons on a glowing hex plate ---- */
const PKM={st:['#a3b1bc','#46525d'],sd:['#66737e','#1f272e'],pl:['#4a5560','#12181e'],wd:['#c98a4a','#6a4120'],sc:['#7c8d9c','#232d36']};
function gp(pts,pair,lw){let a=1e9,b=-1e9;for(const p of pts){a=Math.min(a,p[1]);b=Math.max(b,p[1])}
 const g=cx.createLinearGradient(0,a,0,b);g.addColorStop(0,pair[0]);g.addColorStop(1,pair[1]);
 cx.beginPath();pts.forEach((p,i)=>i?cx.lineTo(p[0],p[1]):cx.moveTo(p[0],p[1]));cx.closePath();cx.fillStyle=g;cx.fill();cx.lineWidth=lw||1.3;cx.strokeStyle='#080b0e';cx.lineJoin='round';cx.stroke()}
function gl(x1,y1,x2,y2,col,w){cx.strokeStyle=col;cx.lineWidth=w||1;cx.lineCap='round';cx.beginPath();cx.moveTo(x1,y1);cx.lineTo(x2,y2);cx.stroke()}
function gunSMG(c){const M=PKM;
 cx.lineCap='round';cx.lineJoin='round';cx.strokeStyle='#080b0e';cx.lineWidth=4.4;cx.beginPath();cx.moveTo(-18,-2);cx.lineTo(-30,-2);cx.lineTo(-30,5.5);cx.lineTo(-20,5.5);cx.stroke();
 cx.strokeStyle='#8794a0';cx.lineWidth=2;cx.stroke();
 gp([[3,3],[10.5,3],[12.5,21],[5,21]],M.pl);cx.fillStyle=c;cx.fillRect(4.6,15.5,7,2);gl(4.5,5,5.4,19,'#ffffff30',1);
 gp([[-13,3],[-4,3],[-7,17],[-16,17]],M.pl);for(let i=0;i<4;i++)gl(-12.5+i*-.7,7+i*2.6,-6+i*-.7,7+i*2.6,'#00000070',1);
 cx.strokeStyle='#080b0e';cx.lineWidth=3;cx.beginPath();cx.moveTo(-3.5,3);cx.quadraticCurveTo(-2,10,3,9);cx.stroke();cx.strokeStyle='#5d6a75';cx.lineWidth=1.2;cx.stroke();
 gp([[-19,-7],[17,-7],[17,3.5],[-19,3.5]],M.sd);gp([[-19,-7],[17,-7],[17,-4],[-19,-4]],M.st);
 gp([[17,-6],[28,-6],[28,3.5],[17,3.5]],M.pl);for(let i=0;i<4;i++){cx.fillStyle='#000a';cx.fillRect(19+i*2.4,-3,1.3,5)}
 gp([[28,-4],[34,-4],[34,-0.5],[28,-0.5]],M.sd);gp([[22,-7],[25.5,-7],[24.5,-10.5],[23,-10.5]],M.sd);gp([[-16,-7],[-11,-7],[-11,-9.5],[-16,-9.5]],M.sd);
 cx.fillStyle='#080b0e';cx.fillRect(-2,-5.5,9,2.6);cx.fillStyle=c;cx.fillRect(-15,-.8,24,2.2);gl(-17,-6.3,15,-6.3,'#ffffff66',1)}
function gunSG(c){const M=PKM;
 gp([[-12,-6.5],[-27,-3.5],[-34,2],[-33,11],[-26,11],[-12,3.5]],M.wd);for(let i=0;i<4;i++)gl(-14-i*4.6,-3+i*1.4,-15-i*4.4,3+i*2,'#4a2c1255',1.1);gl(-26,-3,-32,2,'#ffffff55',1);
 gp([[-4,3.5],[2,3.5],[0,12],[-6,12]],M.wd);
 gp([[-13,-7.5],[6,-7.5],[6,4.5],[-13,4.5]],M.sd);gp([[-13,-7.5],[6,-7.5],[6,-5],[-13,-5]],M.st);
 cx.fillStyle='#080b0e';cx.fillRect(-9,-4.2,10,2.8);cx.fillStyle='#d94b3a';cx.fillRect(-7,-3.9,5,2.2);cx.fillStyle='#e2b24a';cx.fillRect(-2,-3.9,2.2,2.2);
 gp([[6,-6.5],[37,-6.5],[37,-3.2],[6,-3.2]],M.st);gp([[6,-2.4],[33,-2.4],[33,1],[6,1]],M.sd);gp([[33,-3],[36,-3],[36,1.4],[33,1.4]],M.sd);
 cx.fillStyle=c;cx.fillRect(30,-6.5,3,3.3);gp([[36,-9],[38,-9],[37.5,-6.5],[36.5,-6.5]],M.sd);
 gp([[13,-1.5],[28,-1.5],[29,6],[12,6]],M.wd);for(let i=0;i<5;i++)gl(15+i*3,-.5,14.6+i*3.2,5,'#3a200c88',1.2);gl(13.5,-.6,28,-.6,'#ffffff55',1);
 cx.strokeStyle='#080b0e';cx.lineWidth=3;cx.beginPath();cx.moveTo(-5,4.5);cx.quadraticCurveTo(-3,10,2,9.5);cx.stroke();cx.strokeStyle='#5d6a75';cx.lineWidth=1.2;cx.stroke();gl(-12,-6.6,5,-6.6,'#ffffff77',1)}
function gunRF(c){const M=PKM;
 gp([[-9,-4.5],[-25,-3.5],[-33,1],[-32,8],[-24,9],[-9,3.5]],M.pl);gl(-12,-3.2,-26,-2.4,'#ffffff40',1);cx.fillStyle='#0a0e12';cx.fillRect(-31,2,3,4);
 gp([[-7,3.5],[0,3.5],[-2.5,14],[-10.5,14]],M.pl);gp([[4,3.5],[11.5,3.5],[11.5,12],[4,12]],M.pl);cx.fillStyle=c;cx.fillRect(4,9,7.5,1.8);
 gp([[-10,-6.5],[13,-6.5],[13,3.5],[-10,3.5]],M.sd);gp([[-10,-6.5],[13,-6.5],[13,-3.5],[-10,-3.5]],M.st);
 gp([[13,-5],[29,-5],[29,3],[13,3]],M.pl);cx.fillStyle=c;cx.fillRect(18,-5,3.2,8);for(let i=0;i<3;i++){cx.fillStyle='#000a';cx.fillRect(23+i*1.9,-3,1,4.5)}
 gp([[29,-3.2],[39,-3.2],[39,-.4],[29,-.4]],M.st);gp([[38,-5],[44,-5],[44,1],[38,1]],M.sd);for(let i=0;i<2;i++){cx.fillStyle='#000';cx.fillRect(39.6+i*2.2,-5,1,6)}
 gp([[-3,-10.2],[0,-10.2],[0,-6.5],[-3,-6.5]],M.sd);gp([[9,-10.2],[12,-10.2],[12,-6.5],[9,-6.5]],M.sd);
 gp([[-9,-17],[17,-17],[17,-10.2],[-9,-10.2]],M.sc);gl(-8,-15.5,16,-15.5,'#ffffff77',1.2);
 gp([[17,-18.5],[23,-18.5],[23,-8.8],[17,-8.8]],M.sd);gp([[-15,-17.5],[-9,-17.5],[-9,-9.8],[-15,-9.8]],M.sd);
 const lg=cx.createRadialGradient(21,-14,0,21,-14,4);lg.addColorStop(0,'#ffffff');lg.addColorStop(.4,'#7fe8ff');lg.addColorStop(1,'#3a8fb0');cx.fillStyle=lg;cx.beginPath();cx.ellipse(21,-13.7,2.2,3.6,0,0,6.28);cx.fill();
 gp([[3,-20.5],[8,-20.5],[8,-17],[3,-17]],M.sd)}
const PKF={smg:[gunSMG,1.12,-5],shotgun:[gunSG,1.04,-1],rifle:[gunRF,.9,3]};
function hexp(x,y,r,rot){cx.beginPath();for(let i=0;i<6;i++){const a=rot+i*1.0472;i?cx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r):cx.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r)}cx.closePath()}
function sparkle(x,y,r,a){cx.save();cx.translate(x,y);cx.rotate(.785);cx.globalAlpha=a;cx.fillStyle='#fff';cx.beginPath();cx.moveTo(0,-r);cx.quadraticCurveTo(0,0,r,0);cx.quadraticCurveTo(0,0,0,r);cx.quadraticCurveTo(0,0,-r,0);cx.quadraticCurveTo(0,0,0,-r);cx.fill();cx.restore()}
function ropeArt(r,now){const v=views[r.o];if(!v)return;const dx=r.x-v.x,dy=r.y-v.y,L=Math.hypot(dx,dy);if(L<2)return;
 cx.save();cx.lineCap='round';cx.strokeStyle='#05080b';cx.lineWidth=5;cx.beginPath();cx.moveTo(v.x,v.y);cx.lineTo(r.x,r.y);cx.stroke();
 cx.strokeStyle='#d8bd86';cx.lineWidth=3;cx.stroke();cx.strokeStyle='#8a6b3a';cx.lineWidth=3;cx.setLineDash([4,6]);cx.stroke();cx.setLineDash([]);
 cx.translate(r.x,r.y);cx.rotate(Math.atan2(dy,dx));cx.fillStyle='#aab6c0';cx.strokeStyle='#05080b';cx.lineWidth=1.5;
 cx.beginPath();cx.moveTo(8,0);cx.lineTo(-4,-7);cx.lineTo(-1,0);cx.lineTo(-4,7);cx.closePath();cx.fill();cx.stroke();cx.restore()}
function bombArt(b,now,m){if(Math.abs(b.x-cam.x)>innerWidth/2/S+40||Math.abs(b.y-cam.y)>innerHeight/2/S+40)return;const on=b.st==0,pu=.5+.5*Math.sin(now/120);
 cx.save();cx.translate(b.x,b.y);if(!on)cx.globalAlpha=Math.max(.15,Math.min(1,b.l/2));
 cx.fillStyle='#0007';cx.beginPath();cx.ellipse(1,6,10,4,0,0,6.28);cx.fill();
 const g=cx.createRadialGradient(-3,-3,1,0,0,10);g.addColorStop(0,on?'#5a6672':'#4a525a');g.addColorStop(1,on?'#151b21':'#23292f');
 cx.fillStyle=g;cx.strokeStyle='#05080b';cx.lineWidth=1.5;cx.beginPath();cx.arc(0,0,9,0,6.28);cx.fill();cx.stroke();
 cx.fillStyle=on?`hsl(${b.h} 85% 55%)`:'#4a525a';cx.fillRect(-9,-1.5,18,3);
 cx.fillStyle='#2f3841';cx.strokeStyle='#05080b';cx.lineWidth=1;cx.beginPath();cx.rect(-3.5,-12,7,4);cx.fill();cx.stroke();
 cx.strokeStyle=on?'#c9a56a':'#6d7e8b';cx.lineWidth=1.5;cx.beginPath();cx.moveTo(0,-12);cx.quadraticCurveTo(5,-16,8,-14);cx.stroke();
 if(on){cx.fillStyle=`rgba(255,${150+pu*90|0},60,${.7+.3*pu})`;cx.beginPath();cx.arc(8,-14,2+pu*1.4,0,6.28);cx.fill()}
 cx.fillStyle='#ffffff30';cx.beginPath();cx.ellipse(-3.5,-4,2.6,1.6,-.6,0,6.28);cx.fill();cx.restore()}
function turretArt(t,now,m){if(Math.abs(t.x-cam.x)>innerWidth/2/S+60||Math.abs(t.y-cam.y)>innerHeight/2/S+60)return;const own=m&&t.o==m.id,hc=`hsl(${t.h} 90% 62%)`;
 cx.save();cx.translate(t.x,t.y);
 if(own){cx.strokeStyle='#4ae0c030';cx.lineWidth=2;cx.setLineDash([6,8]);cx.beginPath();cx.arc(0,0,700,0,6.28);cx.stroke();cx.setLineDash([])}
 cx.fillStyle='#0006';cx.beginPath();cx.ellipse(3,6,19,9,0,0,6.28);cx.fill();
 hexp(0,0,19,.5236);cx.fillStyle='#26323d';cx.fill();cx.lineWidth=3;cx.strokeStyle=hc;cx.stroke();
 cx.rotate(t.a);cx.fillStyle='#51606d';cx.fillRect(2,-4,26,8);cx.fillStyle=hc;cx.fillRect(22,-4,6,8);cx.fillStyle='#34414c';cx.beginPath();cx.arc(0,0,10,0,6.28);cx.fill();cx.strokeStyle='#080b0e';cx.lineWidth=1.5;cx.stroke();cx.fillStyle=hc;cx.beginPath();cx.arc(0,0,3.5,0,6.28);cx.fill();cx.rotate(-t.a);
 cx.fillStyle='#000a';cx.fillRect(-18,-32,36,5);cx.fillStyle=own?'#4ae0c0':'#ff6a5f';cx.fillRect(-18,-32,36*Math.max(0,t.hp)/t.mh,5);
 cx.strokeStyle='#ffffff50';cx.lineWidth=2;cx.beginPath();cx.arc(0,0,25,-1.57,-1.57+6.28*Math.min(1,t.l/30));cx.stroke();cx.restore()}
function pickupArt(k,tm){cx.save();cx.translate(k.x,k.y);cx.scale(PS,PS);cx.translate(-k.x,-k.y);try{pickupArt0(k,tm)}finally{cx.restore()}}
function pickupArt0(k,tm){const c=PKC[k.t],x=k.x,y=k.y;
 if(Math.abs(x-cam.x)>innerWidth/2/S+80||Math.abs(y-cam.y)>innerHeight/2/S+80)return;
 if(!k.on){cx.strokeStyle='#ffffff18';cx.lineWidth=2;cx.setLineDash([5,5]);hexp(x,y,18,0);cx.stroke();cx.setLineDash([]);return}
 const bob=Math.sin(tm*2.6+x)*3,pu=Math.sin(tm*3.2+x)*.5+.5,F=PKF[k.t];
 // glow + ground shadow
 const g=cx.createRadialGradient(x,y,8,x,y,46+pu*5);g.addColorStop(0,c+'66');g.addColorStop(1,c+'00');cx.fillStyle=g;cx.beginPath();cx.arc(x,y,52,0,6.28);cx.fill();
 // plate
 hexp(x,y,34,.5236);const pg=cx.createRadialGradient(x,y-8,3,x,y,35);pg.addColorStop(0,c+'dd');pg.addColorStop(.55,c+'66');pg.addColorStop(1,'#0b1015f0');cx.fillStyle='#0b1015';cx.fill();cx.fillStyle=pg;cx.fill();
 cx.lineWidth=2.6;cx.strokeStyle=c;cx.stroke();hexp(x,y,28.5,.5236);cx.lineWidth=1;cx.strokeStyle='#ffffff40';cx.stroke();
 if(window.SWK&&window.SWK.x==x&&window.SWK.y==y){const q=(tm*1.3)%1;cx.save();cx.strokeStyle='#fff';cx.globalAlpha=.9;cx.lineWidth=2.4;cx.setLineDash([9,7]);cx.lineDashOffset=-tm*34;hexp(x,y,41+Math.sin(tm*7)*1.8,.5236);cx.stroke();cx.setLineDash([]);cx.globalAlpha=1-q;cx.strokeStyle=c;cx.lineWidth=3;hexp(x,y,34+q*28,.5236);cx.stroke();cx.restore()}
 cx.fillStyle='#0007';cx.beginPath();cx.ellipse(x+2,y+28,17-bob*.5,3.4,0,0,6.28);cx.fill();
 cx.save();cx.translate(x,y+bob*.8);cx.lineJoin='round';
 if(F){cx.rotate(-.22+Math.sin(tm*1.4+x)*.05);cx.scale(F[1],F[1]);cx.translate(-1,F[2]);cx.shadowColor='#000c';cx.shadowBlur=6;cx.shadowOffsetY=3;F[0](c)}
 else if(k.t=='hp'){cx.shadowColor='#000a';cx.shadowBlur=5;cx.shadowOffsetY=3;rr(-14,-14,28,28,7);cx.fillStyle='#f4f7f9';cx.fill();cx.shadowColor='transparent';cx.strokeStyle='#080b0e';cx.lineWidth=1.8;cx.stroke();cx.fillStyle=c;cx.fillRect(-4,-9.5,8,19);cx.fillRect(-9.5,-4,19,8)}
 else if(k.t=='ammo'){cx.shadowColor='#000a';cx.shadowBlur=5;cx.shadowOffsetY=3;rr(-15,-11,30,22,4);cx.fillStyle='#2c3a2a';cx.fill();cx.shadowColor='transparent';cx.strokeStyle=c;cx.lineWidth=2;cx.stroke();for(let i=0;i<4;i++){const bx=-10+i*6.6;cx.fillStyle=c;rr(bx-2.2,-7,4.4,12,1.6);cx.fill();cx.fillStyle='#ffffffaa';cx.fillRect(bx-2.2,-7,4.4,3.5)}}
 else if(k.t=='kit'){cx.shadowColor='#000a';cx.shadowBlur=5;cx.shadowOffsetY=3;hexp(0,0,15,.5236);cx.fillStyle='#26323d';cx.fill();cx.shadowColor='transparent';cx.strokeStyle=c;cx.lineWidth=2.4;cx.stroke();cx.fillStyle=c;cx.fillRect(2,-3.5,16,7);cx.beginPath();cx.arc(0,0,7,0,6.28);cx.fill();cx.strokeStyle='#080b0e';cx.lineWidth=1.5;cx.stroke()}
 else if(k.t=='shield'){cx.shadowColor='#000a';cx.shadowBlur=5;cx.shadowOffsetY=3;cx.beginPath();cx.moveTo(0,-17);cx.lineTo(13,-12);cx.lineTo(13,1);cx.quadraticCurveTo(13,11,0,17);cx.quadraticCurveTo(-13,11,-13,1);cx.lineTo(-13,-12);cx.closePath();cx.fillStyle=c;cx.fill();cx.shadowColor='transparent';cx.strokeStyle='#080b0e';cx.lineWidth=1.8;cx.stroke();cx.fillStyle='#ffffff70';cx.beginPath();cx.moveTo(0,-11);cx.lineTo(8,-8);cx.lineTo(8,1);cx.quadraticCurveTo(8,6,0,11);cx.closePath();cx.fill()}
 else{cx.shadowColor='#000a';cx.shadowBlur=5;cx.shadowOffsetY=3;cx.beginPath();cx.moveTo(4,-18);cx.lineTo(-11,3);cx.lineTo(-2,3);cx.lineTo(-5,18);cx.lineTo(11,-4);cx.lineTo(2,-4);cx.closePath();cx.fillStyle=c;cx.fill();cx.shadowColor='transparent';cx.strokeStyle='#080b0e';cx.lineWidth=1.8;cx.stroke()}
 cx.restore();
 const tw=(i)=>.35+.65*Math.max(0,Math.sin(tm*2.2+i*2.1+x));for(let i=0;i<3;i++){const a=tm*.6+i*2.094+x;sparkle(x+Math.cos(a)*38,y+Math.sin(a)*33+bob*.3,3.2+i*.5,tw(i))}}
function weapon(w,o,ul){weapon0(w,o);if(!ul)return;const x=R-4+o,t=ul[0]+ul[1]+ul[2]+ul[3];
 if(ul[0]){cx.fillStyle='#ff5d4a';cx.fillRect(x+2,-1,6+ul[0]*2,2)}
 if(ul[1]){cx.fillStyle='#ffb02e';for(let i=0;i<ul[1];i++)cx.fillRect(x+TIP[w]-4-i*3,-5,2,2)}
 if(ul[2]){cx.fillStyle='#161c22';cx.fillRect(x+9,3,4+ul[2],4+ul[2]*1.6);cx.fillStyle='#ffd9a0';cx.fillRect(x+10,4,2,2)}
 if(ul[3]){cx.fillStyle=`rgba(89,184,255,${.6+.3*Math.sin(Date.now()/200)})`;cx.beginPath();cx.arc(x+5,0,1.5+ul[3]*.3,0,6.28);cx.fill()}
 if(t>=10){cx.strokeStyle='#ffc83a';cx.lineWidth=1.5;cx.strokeRect(x-1,-4,TIP[w]+2,8)}}
function weapon0(w,o){const x=R-4+o;cx.strokeStyle='#000a';cx.lineWidth=1.2;cx.fillStyle='#2b343d';
 if(w=='pistol'){rr(x,-3,16,6,2);cx.fill();cx.stroke();cx.fillStyle='#4a5865';cx.fillRect(x+3,-3,12,2.5)}
 else if(w=='smg'){rr(x,-3.5,22,7,2);cx.fill();cx.stroke();cx.fillStyle='#4a5865';cx.fillRect(x+4,-3.5,16,2.5);cx.fillStyle='#161c22';cx.fillRect(x+6,3,5,8)}
 else if(w=='blaster'){rr(x,-3.5,24,7,3);cx.fill();cx.stroke();cx.fillStyle='#1fb8c9';cx.fillRect(x+4,-1.5,16,3);cx.fillStyle='#ffc83a';cx.fillRect(x+22,-3,3,6);cx.fillStyle='#4a5865';cx.fillRect(x-4,-3,6,6)}
 else if(w=='shotgun'){rr(x,-3,28,6,2);cx.fill();cx.stroke();cx.fillStyle='#8a5a30';rr(x-5,-4.5,13,9,2);cx.fill();cx.fillStyle='#4a5865';cx.fillRect(x+12,-4.5,9,9)}
 else{rr(x,-3,34,6,2);cx.fill();cx.stroke();cx.fillStyle='#4a5865';cx.fillRect(x+8,-3,22,2.5);cx.fillStyle='#7b4aa8';rr(x+12,-9,12,5,2);cx.fill();cx.fillStyle='#8cf';cx.fillRect(x+22,-9,2,5)}}
function drawChar(p,v,now){
 const H=p.hue,c=`hsl(${H} 78% 50%)`,cd=`hsl(${H} 62% 30%)`,cL=`hsl(${H} 90% 72%)`,hf=v.hf>0,Wt='#fff',
  sw=Math.sin(v.ph||0),mv=Math.min(1,Math.hypot(p.vx,p.vy)/180),rc=(v.rc||0)*5,br=Math.sin(now/380+H)*.7,hb=Math.sin(now/300+H)*.7*(1-mv),K=a=>hf?Wt:a;
 cx.save();cx.translate(v.x,v.y);
 cx.fillStyle='#0007';cx.beginPath();cx.ellipse(4,8,R*1.05,R*.85,0,0,6.28);cx.fill();
 if(p.id==myId){cx.strokeStyle='#fff7';cx.lineWidth=2;cx.setLineDash([6,6]);cx.lineDashOffset=-now/50;cx.beginPath();cx.arc(0,0,R+9,0,6.28);cx.stroke();cx.setLineDash([])}
 cx.rotate(v.a);
 // scarf
 cx.strokeStyle=K(cL);cx.lineWidth=5;cx.lineCap='round';cx.lineJoin='round';cx.beginPath();cx.moveTo(-4,0);const SL=14+mv*18;for(let i=1;i<=5;i++)cx.lineTo(-4-i*SL/5,Math.sin(now/110+i*1.2+H)*(1.5+mv*4)*i/2.5);cx.stroke();
 // legs: thighs, knee pads, boots with soles and toe caps
 for(const q of[-1,1]){const lx=-2+q*sw*8*mv;cx.fillStyle=K(cd);cx.beginPath();cx.ellipse(lx+3,q*6.5,7,4,0,0,6.28);cx.fill();cx.fillStyle='#141a21';cx.beginPath();cx.ellipse(lx+6,q*7,7.5,4.8,0,0,6.28);cx.fill();cx.fillStyle='#252f3a';cx.beginPath();cx.ellipse(lx+10,q*7,3.2,3.4,0,0,6.28);cx.fill();cx.fillStyle=K(cL);cx.beginPath();cx.arc(lx+2,q*6.5,2.3,0,6.28);cx.fill();cx.strokeStyle='#000a';cx.lineWidth=1.2;cx.beginPath();cx.ellipse(lx+6,q*7,7.5,4.8,0,0,6.28);cx.stroke()}
 // backpack: straps, bottle, antenna with blinking tip
 cx.fillStyle=K(cd);rr(-R-4,-9,12,18,4);cx.fill();cx.strokeStyle='#000a';cx.lineWidth=1.5;cx.stroke();cx.fillStyle='#0005';cx.fillRect(-R,-9,2,18);cx.fillStyle=cL;cx.fillRect(-R-3,-2,2,4);
 cx.fillStyle='#2a343e';rr(-R-5,-12,7,4,2);cx.fill();rr(-R-5,8,7,4,2);cx.fill();cx.strokeStyle='#9fb2c0';cx.lineWidth=1.3;cx.beginPath();cx.moveTo(-R-2,6);cx.lineTo(-R-12,11);cx.stroke();cx.fillStyle=(now/400|0)%2?'#ff4a3a':'#5a1a14';cx.beginPath();cx.arc(-R-12,11,1.6,0,6.28);cx.fill();
 // torso, belt, pouches, chest plate and rig
 cx.fillStyle=K(c);cx.beginPath();cx.ellipse(-1,0,R*.78,R+br,0,0,6.28);cx.fill();cx.strokeStyle='#000a';cx.lineWidth=2;cx.stroke();
 cx.strokeStyle='#18202a';cx.lineWidth=3;cx.beginPath();cx.ellipse(-6,0,R*.45,R*.8,0,-1.5,1.5);cx.stroke();cx.fillStyle='#ffc83a';cx.fillRect(-3,-2,3,4);cx.fillStyle='#2a343e';for(const q of[-1,1]){rr(-10,q*(R-5)-3,7,6,2);cx.fill()}cx.fillStyle='#4a5a2a';cx.beginPath();cx.arc(-8,-R+7,2.6,0,6.28);cx.fill();
 cx.fillStyle=K(cd);cx.beginPath();cx.ellipse(2,0,R*.4,R*.62,0,0,6.28);cx.fill();cx.fillStyle=cL;cx.fillRect(1,-1.5,7,3);cx.fillStyle='#232c35';for(let i=0;i<3;i++)cx.fillRect(8,-6+i*4.5,3.2,3);cx.fillStyle='#0004';cx.fillRect(-6,-R*.6,2,R*1.2);
 // arms, shoulder pads with rank dots, gloves
 cx.strokeStyle=K(cd);cx.lineWidth=6;cx.lineCap='round';cx.beginPath();cx.moveTo(2,-R*.88);cx.lineTo(R+3-rc,-3);cx.moveTo(2,R*.88);cx.lineTo(R+13-rc,2);cx.stroke();
 const tl=(p.ul||[0]).reduce((a,b)=>a+b,0);
 for(const q of[-1,1]){cx.fillStyle=K(cL);cx.beginPath();cx.arc(2,q*R*.9,6,0,6.28);cx.fill();cx.strokeStyle='#0008';cx.lineWidth=1.5;cx.stroke();cx.fillStyle=K(cd);cx.fillRect(-1,q*R*.9-1,6,2);if(tl>=4){cx.fillStyle='#ffc83a';cx.beginPath();cx.arc(2,q*R*.9,1.8,0,6.28);cx.fill()}}
 weapon(p.w,-rc,p.ul);
 cx.fillStyle='#232c35';for(const[x,y]of[[R+3-rc,-3],[R+13-rc,2]]){cx.beginPath();cx.arc(x,y,4,0,6.28);cx.fill();cx.strokeStyle='#0008';cx.lineWidth=1;cx.stroke()}
 if(v.fl>0){const t=R-4-rc+TIP[p.w];cx.fillStyle='#ffb02e';cx.beginPath();cx.moveTo(t,-9);cx.lineTo(t+22,0);cx.lineTo(t,9);cx.closePath();cx.fill();cx.fillStyle='#fff6c8';cx.beginPath();cx.arc(t+2,0,6,0,6.28);cx.fill()}
 // helmet: shell, camo, vents, ear cups, mic, visor
 cx.save();cx.translate(0,hb*.5);
 cx.fillStyle='#1d2630';for(const q of[-1,1]){cx.beginPath();cx.arc(2,q*10,3.3,0,6.28);cx.fill()}cx.strokeStyle='#9fb2c0';cx.lineWidth=1.2;cx.beginPath();cx.moveTo(2,9.5);cx.quadraticCurveTo(7,9,9,5);cx.stroke();cx.fillStyle='#9fb2c0';cx.beginPath();cx.arc(9,5,1.4,0,6.28);cx.fill();
 cx.fillStyle=K(`hsl(${H} 75% 44%)`);cx.beginPath();cx.arc(3,0,10,0,6.28);cx.fill();cx.strokeStyle='#000b';cx.lineWidth=2;cx.stroke();
 cx.fillStyle=K(`hsl(${H} 70% 34%)`);for(const[x,y,r]of[[-2,4,2.4],[1,-5,2],[-3,-3,1.6],[5,6,1.6]]){cx.beginPath();cx.arc(x,y,r,0,6.28);cx.fill()}
 cx.strokeStyle='#0006';cx.lineWidth=1.2;cx.beginPath();for(const y of[-3,0,3]){cx.moveTo(-6,y);cx.lineTo(-1,y)}cx.stroke();
 cx.fillStyle='#0e1d28';cx.beginPath();cx.ellipse(8,0,3.6,6.2,0,0,6.28);cx.fill();cx.fillStyle=`rgba(127,232,255,${.7+.3*Math.sin(now/260)})`;cx.fillRect(7,-4.5,1.6,3);cx.fillRect(8.5,2,1,1.6);
 cx.fillStyle='#fff3';cx.beginPath();cx.ellipse(0,-3.5,5,2.4,-.5,0,6.28);cx.fill();cx.fillStyle=K(cd);cx.fillRect(-5,-1,4,2);cx.restore();
 if(p.sh>0){cx.rotate(-v.a);cx.fillStyle='#59b8ff22';cx.beginPath();cx.arc(0,0,R+7,0,6.28);cx.fill();cx.strokeStyle='#59b8ffdd';cx.lineWidth=3;cx.beginPath();cx.arc(0,0,R+7,0,6.28*p.sh/50);cx.stroke();cx.rotate(v.a)}
 if(p.sp>0){cx.strokeStyle='#ffd24a99';cx.lineWidth=2;for(let i=0;i<3;i++){cx.beginPath();cx.moveTo(-R-10-i*7,-8+i*8);cx.lineTo(-R-24-i*7,-8+i*8);cx.stroke()}}
 cx.restore()}
function corpse(v,p){} // no X mark / body blob on death: the loot crate is the only thing left on the spot

const GOLD='#ffc83a',STN=['DAMAGE','FIRE RATE','MAGAZINE','RELOAD'];
const UP=i=>ST.on?{x:8,y:62+i*44,w:140,h:40}:{x:10,y:76+i*51,w:138,h:46};
const UPB=()=>({x:innerWidth/UIS-112,y:46,w:104,h:28});
function upHit(x,y){if($('menu').style.display!='none')return 0;x/=UIS;y/=UIS;
 if(ST.on){const t=UPB();if(x>t.x&&x<t.x+t.w&&y>t.y&&y<t.y+t.h){upOpen=!upOpen;return 99}if(!upOpen)return 0}for(let i=0;i<4;i++){const u=UP(i);if(x>u.x&&x<u.x+u.w&&y>u.y&&y<u.y+u.h)return i+1}return 0}
function gem(x,y,sx){cx.save();cx.translate(x,y);cx.scale(.65+.35*Math.abs(sx),1);cx.fillStyle='#4adfd0';cx.beginPath();cx.moveTo(0,-12);cx.lineTo(10,-3);cx.lineTo(0,12);cx.lineTo(-10,-3);cx.closePath();cx.fill();cx.fillStyle='#bff8f2';cx.beginPath();cx.moveTo(0,-12);cx.lineTo(10,-3);cx.lineTo(0,-3);cx.fill();cx.strokeStyle='#17756d';cx.lineWidth=1.5;cx.stroke();cx.restore()}
function chestArt(x,y,on,now){cx.save();cx.translate(x,y);cx.fillStyle='#0006';cx.beginPath();cx.ellipse(3,15,26,8,0,0,6.28);cx.fill();
 if(on){cx.fillStyle=`rgba(255,200,58,${.22+.14*Math.sin(now/300)})`;cx.beginPath();cx.arc(0,0,42,0,6.28);cx.fill()}
 cx.lineWidth=2;cx.strokeStyle='#2a1a0c';cx.fillStyle=on?'#8a5a2b':'#3d3023';rr(-20,-6,40,22,4);cx.fill();cx.stroke();
 cx.save();if(!on){cx.translate(0,-9);cx.rotate(-.35)}cx.fillStyle=on?'#a8723a':'#4a3a2a';rr(-20,-17,40,13,6);cx.fill();cx.stroke();cx.fillStyle=on?GOLD:'#6a5a30';cx.fillRect(-4,-17,8,13);cx.restore();
 cx.fillStyle=on?GOLD:'#6a5a30';cx.fillRect(-4,-6,8,22);cx.fillRect(-20,2,40,3);if(on){cx.fillStyle='#fff0b0';cx.beginPath();cx.arc(0,-1,2.5,0,6.28);cx.fill()}cx.restore()}
function pan(x,y,w,h,r,bd){rr(x,y,w,h,r);cx.fillStyle='#0b1117d9';cx.fill();cx.strokeStyle=bd||'#2f4252';cx.lineWidth=1.5;cx.stroke()}
function coin(x,y,r,sx){cx.save();cx.translate(x,y);cx.scale(sx,1);cx.fillStyle=GOLD;cx.beginPath();cx.arc(0,0,r,0,6.28);cx.fill();cx.strokeStyle='#a8741a';cx.lineWidth=Math.max(1,r*.18);cx.stroke();cx.strokeStyle='#fff0b0';cx.lineWidth=Math.max(1,r*.12);cx.beginPath();cx.arc(0,0,r*.58,0,6.28);cx.stroke();cx.restore()}
function hudTouch(m,now,W,H,bx,bw,F){
 const q=bx+bw*Math.min(1,m.k/WIN);cx.fillStyle='#fff';cx.beginPath();cx.moveTo(q,27);cx.lineTo(q-4,20);cx.lineTo(q+4,20);cx.fill();
 pan(8,8,176,46,10,`hsl(${m.hue} 70% 45%)`);cx.textAlign='left';cx.fillStyle='#fff';cx.font='bold 13px '+F;cx.fillText(m.name,16,24);cx.font='11px '+F;cx.fillStyle='#9fb2c0';cx.textAlign='right';cx.fillText('K '+m.k+'  D '+m.d,176,24);
 for(let i=0;i<10;i++){const f=cl((hpS-i*10)/10,0,1);cx.fillStyle='#1c2832';rr(16+i*16,32,13,12,3);cx.fill();if(f>0){cx.fillStyle=hpS>50?'#5fd37a':hpS>25?'#ffcf4a':'#ff6a5f';rr(16+i*16,32,13*f,12,3);cx.fill()}}healGlow(16,32,157,12,now);
 if(m.sh>0){cx.fillStyle='#59b8ff';rr(16,46,160*m.sh/50,3,1);cx.fill()}
 cc+=(m.c-cc)*(1-Math.pow(.75,F60));pan(W-112,8,104,32,10,'#8a6a1c');coin(W-94,24,9,Math.cos(now/300));cx.textAlign='right';cx.fillStyle=GOLD;cx.font='bold 17px '+F;cx.fillText(Math.round(cc),W-16,31);
 const ul=m.ul||[0,0,0,0],aff=ul.some((l,i)=>l<5&&m.c>=UC[l]),t=UPB();pan(t.x,t.y,t.w,t.h,8,aff?GOLD:'#2f4252');
 if(aff){cx.fillStyle=`rgba(255,200,58,${.1+.08*Math.sin(now/200)})`;rr(t.x,t.y,t.w,t.h,8);cx.fill()}
 cx.textAlign='center';cx.fillStyle=aff?'#fff':'#9fb2c0';cx.font='bold 11px '+F;cx.fillText(upOpen?'CLOSE':'UPGRADE',t.x+t.w/2,t.y+18);
 if(upOpen)for(let i=0;i<4;i++){const u=UP(i),lv=ul[i],mx=lv>=5,cost=UC[lv],can=!mx&&m.c>=cost;pan(u.x,u.y,u.w,u.h,8,can?GOLD:'#2f4252');cx.textAlign='left';cx.fillStyle=can?'#fff':'#9fb2c0';cx.font='bold 11px '+F;cx.fillText(STN[i],u.x+8,u.y+15);
  for(let k=0;k<5;k++){cx.fillStyle=k<lv?GOLD:'#223140';rr(u.x+8+k*16,u.y+23,13,8,2);cx.fill()}cx.textAlign='right';cx.fillStyle=mx?'#5fd37a':can?GOLD:'#6d7e8b';cx.fillText(mx?'MAX':cost,u.x+u.w-8,u.y+15)}
 const w=WP[m.w],mag=w.mag+Math.round(w.mag*.3*ul[2]),cx0=W/2-92,cy0=H-50;pan(cx0,cy0,184,42,10);
 cx.save();cx.translate(cx0+14,cy0+21);cx.scale(1.1,1.1);weapon(m.w,-(R-4));cx.restore();
 cx.textAlign='right';cx.font='bold 22px '+F;cx.fillStyle=m.am?'#fff':'#ff6a5f';cx.fillText(m.rel>0?'...':m.am+' | '+(m.rv|0),cx0+176,cy0+29);
 if(m.rel>0){cx.fillStyle='#fff';rr(cx0+10,cy0+38,164*cl(1-m.rel/(w.rel*(1-.12*ul[3])),0,1),3,1);cx.fill()}
 }
function hud(m,now,dt){cx.setTransform(dpr,0,0,dpr,0,0);hudState(m,now,dt);cx.setTransform(dpr*UIS,0,0,dpr*UIS,0,0);const RW=innerWidth,RH=innerHeight,W=RW/UIS,H=RH/UIS,T=ST.on,F='"Trebuchet MS",sans-serif';
 if(flash>0){const g=cx.createRadialGradient(W/2,H/2,H*.3,W/2,H/2,H*.8);g.addColorStop(0,'#ff3a2a00');g.addColorStop(1,`rgba(255,58,42,${window.AR_HF===false?0:flash})`);cx.fillStyle=g;cx.fillRect(0,0,W,H)}
 if(m&&m.hp<30&&m.al){cx.fillStyle=`rgba(255,40,30,${.08+.06*Math.sin(now/150)})`;cx.fillRect(0,0,W,H)}
 if(0){cx.strokeStyle=hitm>0?'#ff5d4a':'#fff';cx.lineWidth=3;const x=M.x,y=M.y,o=hitm>0?10:6+((m&&m.bl)||0)*16;cx.beginPath();for(const[a,b]of[[-1,-1],[1,-1],[-1,1],[1,1]]){cx.moveTo(x+a*o,y+b*o);cx.lineTo(x+a*(o+8),y+b*(o+8))}cx.stroke()}
 const wid=snap.w?snap.w.id:'',srt=[...snap.p].sort((a,b)=>(b.id==wid)-(a.id==wid)||b.k-a.k||a.d-b.d),L=srt[0],bw=Math.max(120,Math.min(280,W-520)),bx=W/2-bw/2;
 pan(bx-10,8,bw+20,40,10);cx.font='bold 12px '+F;if(L&&L.k>0){const a=L.name,b='   '+L.k+' / '+WIN,wa=cx.measureText(a).width,wb=cx.measureText(b).width,x0=W/2-(wa+wb)/2;cx.textAlign='left';cx.fillStyle=`hsl(${L.hue} 85% 68%)`;cx.fillText(a,x0,22);cx.fillStyle='#e8eef2';cx.fillText(b,x0+wa,22)}else{cx.textAlign='center';cx.fillStyle='#6d7e8b';cx.fillText('0 / '+WIN,W/2,22)}cx.textAlign='center';
 cx.fillStyle='#223140';rr(bx,28,bw,10,5);cx.fill();if(L){cx.fillStyle=`hsl(${L.hue} 85% 55%)`;rr(bx,28,Math.max(10,bw*L.k/WIN),10,5);cx.fill()}
 if(m&&T)hudTouch(m,now,W,H,bx,bw,F);else if(m){const q=bx+bw*Math.min(1,m.k/WIN);cx.fillStyle='#fff';cx.beginPath();cx.moveTo(q,27);cx.lineTo(q-4,20);cx.lineTo(q+4,20);cx.fill();
  const rk=srt.findIndex(p=>p.id==myId)+1;pan(10,10,190,52,10,`hsl(${m.hue} 70% 45%)`);
  cx.fillStyle=`hsl(${m.hue} 78% 50%)`;cx.beginPath();cx.arc(36,36,17,0,6.28);cx.fill();cx.strokeStyle='#000a';cx.lineWidth=2;cx.stroke();cx.fillStyle='#0e1d28';cx.beginPath();cx.ellipse(42,36,5,9,0,0,6.28);cx.fill();cx.fillStyle='#7fe8ff';cx.fillRect(40,31,2,5);
  cx.textAlign='left';cx.fillStyle='#fff';cx.font='bold 15px '+F;cx.fillText(m.name,62,30);cx.font='12px '+F;cx.fillStyle='#9fb2c0';cx.fillText('Kills '+m.k+'  Deaths '+m.d+'  Rank '+rk,62,48);
  cc+=(m.c-cc)*(1-Math.pow(.75,F60));pan(W-140,10,130,36,10,'#8a6a1c');coin(W-120,28,10,Math.cos(now/300));cx.textAlign='right';cx.fillStyle=GOLD;cx.font='bold 20px '+F;cx.fillText(Math.round(cc),W-20,35);
  // upgrade cards
  const ul=m.ul||[0,0,0,0];
  for(let i=0;i<4;i++){const u=UP(i),lv=ul[i],mx=lv>=5,cost=UC[lv],can=!mx&&m.c>=cost;pan(u.x,u.y,u.w,u.h,8,can?GOLD:'#2f4252');
   if(can){cx.fillStyle=`rgba(255,200,58,${.08+.06*Math.sin(now/200)})`;rr(u.x,u.y,u.w,u.h,8);cx.fill()}
   cx.textAlign='left';cx.fillStyle=can?'#fff':'#9fb2c0';cx.font='bold 12px '+F;cx.fillText((T?'':(i+1)+'  ')+STN[i],u.x+10,u.y+17);
   for(let k=0;k<5;k++){cx.fillStyle=k<lv?GOLD:'#223140';rr(u.x+10+k*19,u.y+26,16,8,2);cx.fill()}
   cx.textAlign='right';cx.fillStyle=mx?'#5fd37a':can?GOLD:'#6d7e8b';cx.font='bold 12px '+F;cx.fillText(mx?'MAX':cost,u.x+u.w-10,u.y+17)}
  // health + dash + status
  const x=12,y=H-62,w2=232;pan(x-4,y-26,w2+8,76,10);cx.fillStyle='#5fd37a';cx.fillRect(x+4,y-18.5,10,3);cx.fillRect(x+7.5,y-22,3,10);
  for(let i=0;i<10;i++){const f=cl((hpS-i*10)/10,0,1);cx.fillStyle='#1c2832';rr(x+i*23,y-4,20,16,3);cx.fill();if(f>0){cx.fillStyle=hpS>50?'#5fd37a':hpS>25?'#ffcf4a':'#ff6a5f';rr(x+i*23,y-4,20*f,16,3);cx.fill()}}healGlow(x,y-4,227,16,now);{const mk=m.mk|0;for(let i=0;i<3;i++){const sx=x+24+i*17,sy=y-23;cx.fillStyle=i<mk?'#f4f7f9':'#1c2832';rr(sx,sy,14,12,3);cx.fill();cx.strokeStyle=i<mk?'#5fd37a':'#2f4252';cx.lineWidth=1;cx.stroke();if(i<mk){cx.fillStyle='#e0453a';cx.fillRect(sx+6,sy+2.5,2,7);cx.fillRect(sx+3.5,sy+5,7,2)}}cx.fillStyle=mk?'#7dffa6':'#6d7e8b';cx.font='bold 9px '+F;cx.textAlign='left';cx.fillText(mk?'AUTO-HEAL':'MEDKITS',x+78,y-14)}
  if(m.sh>0){cx.fillStyle='#59b8ff';rr(x,y+15,w2*m.sh/50,4,2);cx.fill()}
  cx.fillStyle='#fff';cx.font='bold 13px '+F;cx.textAlign='right';cx.fillText(Math.max(0,Math.round(hpS))+(m.sh>0?' +'+(m.sh|0):''),x+w2,y-12);
  const dr=cl((m.dn+(m.dn<2?1-cl(m.dc/1.6,0,1):0))/2,0,1);cx.fillStyle='#1c2832';rr(x,y+23,w2*.45,5,2);cx.fill();cx.fillStyle=m.dn>0?'#ffb02e':'#7a6a4a';rr(x,y+23,w2*.45*dr,5,2);cx.fill();cx.fillStyle='#0b1117';cx.fillRect(x+w2*.225-1,y+23,2,5);
  cx.textAlign='left';cx.font='10px '+F;
  {const rdy=m.td<=0&&(m.kt>0||m.c>=TC);cx.fillStyle=rdy?'#4ae0c0':'#6d7e8b';cx.font='bold 10px '+F;cx.textAlign='left';cx.fillText('['+KL('turret')+'] TURRET '+(m.kt>0?'KIT x'+m.kt:TC+'c')+(m.td>0?'  '+Math.ceil(m.td)+'s':''),x+4,y+35)}{const ar=bombOf(myId);cx.fillStyle=ar?'#ff7a3a':'#c9d4dc';cx.font='bold 10px '+F;cx.textAlign='right';cx.fillText(ar?'['+KL('bomb')+'] TRIGGER':'['+KL('bomb')+'] BOMB',x+w2,y+35);cx.textAlign='left'}{const rp=(snap.rp||[]).find(z=>z.o==myId),rd=m.rc>0&&!rp;cx.fillStyle=rp?'#7ad0ff':rd?'#6d7e8b':'#c9d4dc';cx.font='bold 10px '+F;cx.textAlign='left';cx.fillText('['+KL('rope')+'] ROPE '+(rp?'- RELEASE':rd?Math.ceil(m.rc)+'s':'READY'),x+4,y+47)}
  if(m.sp>0){cx.fillStyle='#ffd24a';cx.font='bold 11px '+F;cx.fillText('» '+Math.ceil(m.sp),x+w2*.45+8,y+29)}
  // weapon card
  const w=WP[m.w],mag=w.mag+Math.round(w.mag*.3*ul[2]),cw=250,c0=T?W/2-cw/2:W-cw-12,c1=H-90;pan(c0,c1,cw,78,12);
  cx.save();cx.translate(c0+16,c1+30);cx.scale(1.7,1.7);weapon(m.w,-(R-4));cx.restore();
  cx.textAlign='left';cx.fillStyle='#fff';cx.font='bold 15px '+F;cx.fillText(w.n,c0+16,c1+60);cx.fillStyle=GOLD;cx.font='11px '+F;cx.fillText('LV '+ul.reduce((a,b)=>a+b,0),c0+16,c1+73);
  if(mag<=16){for(let i=0;i<mag;i++){cx.fillStyle=i<m.am?(m.am<=2?'#ff6a5f':'#ffd9a0'):'#25323d';rr(c0+104+(i%8)*17,c1+12+(i/8|0)*20,11,16,3);cx.fill()}}
  else{cx.textAlign='right';cx.font='bold 30px '+F;cx.fillStyle=m.am?'#fff':'#ff6a5f';cx.fillText(m.rel>0?'...':m.am,c0+cw-62,c1+42);cx.font='14px '+F;cx.fillStyle='#6d7e8b';cx.fillText('/ '+mag,c0+cw-14,c1+42)}
  {const nr=!m.am&&!(m.rv>0),lo=m.rv<=mag&&!nr;cx.textAlign='right';cx.font='bold 11px '+F;cx.fillStyle=nr?'#ff6a5f':lo?'#ffb02e':'#9fb0bb';cx.fillText(nr?'NO AMMO':(m.rv|0)+' RESERVE',c0+cw-14,c1+74)}
  const rt=w.rel*(1-.12*ul[3]);cx.textAlign='right';cx.font='bold 11px '+F;
  if(m.rel>0){cx.fillStyle='#25323d';rr(c0+104,c1+60,cw-118,5,3);cx.fill();cx.fillStyle='#fff';rr(c0+104,c1+60,(cw-118)*cl(1-m.rel/rt,0,1),5,3);cx.fill();}}
 if(m&&m.al&&snap.h){let bt=null,bd=1e9;for(const q of snap.h)if(q.on){const d=Math.hypot(q.x-m.x,q.y-m.y);if(d<bd){bd=d;bt=q}}
  if(bt&&bd>420){const an=Math.atan2(bt.y-m.y,bt.x-m.x),rd=Math.min(W,H)*.36,px=W/2+Math.cos(an)*rd,py=H/2+Math.sin(an)*rd;cx.save();cx.translate(px,py);cx.rotate(an);cx.fillStyle='#ffc83acc';cx.beginPath();cx.moveTo(16,0);cx.lineTo(-8,-10);cx.lineTo(-8,10);cx.closePath();cx.fill();cx.restore();cx.fillStyle='#ffc83a';cx.font='bold 11px '+F;cx.textAlign='center';}}
 cx.setTransform(dpr,0,0,dpr,0,0);
 if(T){cx.globalAlpha=LYO;const b=B(),j=JB();cx.strokeStyle='#fff4';cx.lineWidth=3;cx.fillStyle='#ffffff12';cx.beginPath();cx.arc(j.x,j.y,j.r,0,6.28);cx.fill();cx.stroke();for(const k of['mv']){const q=ST[k];if(!q)continue;cx.strokeStyle='#fff5';cx.lineWidth=3;cx.beginPath();cx.arc(q.sx,q.sy,j.r*.83,0,6.28);cx.stroke();const l=Math.min(k=='mv'?j.r:50,Math.hypot(q.x-q.sx,q.y-q.sy)),an=Math.atan2(q.y-q.sy,q.x-q.sx);cx.fillStyle=k=='aim'?'#ff6a5fb0':'#fff8';cx.beginPath();cx.arc(q.sx+Math.cos(an)*l,q.sy+Math.sin(an)*l,22*UIS,0,6.28);cx.fill()}
  const fp=ST.fire!=null,dr=m&&m.dn<1?0:1;
  cx.lineWidth=3;cx.strokeStyle='#fff';cx.fillStyle=fp?'#ff5d4af2':'#ff5d4a99';cx.beginPath();cx.arc(b.fire.x,b.fire.y,b.fire.r*(fp?.93:1),0,6.28);cx.fill();cx.stroke();
  cx.beginPath();cx.arc(b.fire.x,b.fire.y,15*UIS,0,6.28);for(const[ux,uy]of[[1,0],[-1,0],[0,1],[0,-1]]){cx.moveTo(b.fire.x+ux*10*UIS,b.fire.y+uy*10*UIS);cx.lineTo(b.fire.x+ux*28*UIS,b.fire.y+uy*28*UIS)}cx.stroke();
  cx.fillStyle=dr>=1?'#ffb02ecc':'#7a6a4a99';cx.beginPath();cx.arc(b.dash.x,b.dash.y,b.dash.r,0,6.28);cx.fill();cx.strokeStyle='#fff9';cx.lineWidth=2;cx.stroke();
  cx.fillStyle='#59b8ffaa';cx.beginPath();cx.arc(b.rel.x,b.rel.y,b.rel.r,0,6.28);cx.fill();cx.stroke();
  cx.fillStyle=m&&m.td<=0&&(m.kt>0||m.c>=TC)?'#4ae0c0aa':'#4a5a6a88';cx.beginPath();cx.arc(b.trt.x,b.trt.y,b.trt.r,0,6.28);cx.fill();cx.stroke();
  cx.fillStyle='#10161c';cx.font='bold '+Math.max(8.5,12*UIS)+'px '+F;cx.textAlign='center';cx.textBaseline='middle';cx.fillText('DASH',b.dash.x,b.dash.y);cx.fillText('RELOAD',b.rel.x,b.rel.y);cx.font='bold '+Math.max(8,10*UIS)+'px '+F;cx.fillText('TURRET',b.trt.x,b.trt.y);{const ar=bombOf(myId);cx.fillStyle=ar?'#ff5a2af2':'#ff9a3aaa';cx.beginPath();cx.arc(b.bmb.x,b.bmb.y,b.bmb.r,0,6.28);cx.fill();cx.stroke();cx.fillStyle='#10161c';cx.font='bold '+Math.max(7.5,9*UIS)+'px '+F;cx.fillText(ar?'TRIGGER':'BOMB',b.bmb.x,b.bmb.y)}{const rp=(snap.rp||[]).find(z=>z.o==myId),rd=!rp&&m&&m.rc>0;cx.fillStyle=rp?'#7ad0fff2':rd?'#4a5a6a88':'#7ad0ffaa';cx.beginPath();cx.arc(b.rpb.x,b.rpb.y,b.rpb.r,0,6.28);cx.fill();cx.stroke();cx.fillStyle='#10161c';cx.fillText(rp?'RELEASE':'ROPE',b.rpb.x,b.rpb.y)}cx.textBaseline='alphabetic'}
 cx.globalAlpha=1;cx.setTransform(dpr,0,0,dpr,0,0);hudFx(m,now,RW,RH,F,dt);
 const sb=$('sb');if(!sb.hidden){sb.innerHTML='';const row=(n,k,d,c,h,hd)=>{const r=document.createElement('div');for(const[t,st]of[[n,h!=null?`color:hsl(${h} 85% 65%)`:'color:#84949f'],[k,''],[d,'color:#84949f'],[c,'color:#ffc83a']]){const e=document.createElement(t===n?'span':'b');e.textContent=t;e.style.cssText=st;if(hd)e.style.fontWeight=700;r.appendChild(e)}sb.appendChild(r)};
  row('Player','K','D','$',null,1);srt.forEach((p,i)=>row((i+1)+'. '+p.name,p.k,p.d,p.c,p.hue))}
}

/* ---- state tracking, heal glow, death / victory / defeat / respawn effects ---- */
function eob(k){k=cl(k,0,1);return 1+2.70158*Math.pow(k-1,3)+1.70158*Math.pow(k-1,2)}
function bnc(k){k=cl(k,0,1);if(k<1/2.75)return 7.5625*k*k;if(k<2/2.75)return 7.5625*(k-=1.5/2.75)*k+.75;if(k<2.5/2.75)return 7.5625*(k-=2.25/2.75)*k+.9375;return 7.5625*(k-=2.625/2.75)*k+.984375}
function star(x,y,r,rot){cx.beginPath();for(let i=0;i<10;i++){const a=rot+i*Math.PI/5-Math.PI/2,q=i%2?r*.45:r;cx[i?'lineTo':'moveTo'](x+Math.cos(a)*q,y+Math.sin(a)*q)}cx.closePath()}
function hudState(m,now,dt){const W=innerWidth,H=innerHeight;
 if(m){const al=m.al?1:0;if(al)tickN=0;
  if(wasAlive!==al){if(!al)deadSince=now;else if(wasAlive===0){liveAt=now}wasAlive=al}
  if(m.hp<hpS)hpS=m.hp;else hpS=Math.min(m.hp,hpS+110*dt)}
 if(snap.w){if(!winT)winT=now}else{winT=0;confDone=0}
 let ds=0;if(m&&!m.al&&!snap.w)ds=Math.min(1,(now-deadSince)/600)*.85;else if(m&&snap.w&&snap.w.id!=myId)ds=Math.min(1,(now-winT)/600)*.7;
 if(ds>0){cx.save();cx.globalCompositeOperation='saturation';cx.globalAlpha=ds;cx.fillStyle='#808080';cx.fillRect(0,0,W,H);cx.restore()}}
function healGlow(x,y,w,h,now){const t=(now-healAt)/900;if(t<0||t>1)return;
 cx.save();cx.beginPath();cx.rect(x,y,w,h);cx.clip();cx.globalCompositeOperation='lighter';const sx=x-60+(w+120)*t,g=cx.createLinearGradient(sx-50,0,sx+50,0);
 g.addColorStop(0,'rgba(120,255,160,0)');g.addColorStop(.5,'rgba(200,255,220,.85)');g.addColorStop(1,'rgba(120,255,160,0)');cx.fillStyle=g;cx.fillRect(x,y,w,h);cx.restore();
 cx.save();cx.globalAlpha=(1-t)*.9;cx.strokeStyle='#7dffa6';cx.lineWidth=3;cx.shadowColor='#5fd37a';cx.shadowBlur=16;cx.strokeRect(x-4,y-4,w+8,h+8);cx.restore()}
function deathUI(m,now,W,H,F){
 const t=Math.min(RESP,(now-deadSince)/1000),k=Math.min(1,t/.6),fs=Math.max(26,Math.min(48,H*.09)),y0=H*.2;
 const g=cx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,H*.85);g.addColorStop(0,'rgba(120,0,0,0)');g.addColorStop(1,`rgba(120,0,0,${.55*k})`);cx.fillStyle=g;cx.fillRect(0,0,W,H);
 const sl=Math.min(1,t/.35),e=eob(sl),sh=t<.4?(Math.random()-.5)*10*(1-t/.4):0;
 cx.save();cx.translate(W/2+sh,y0);cx.scale(2.4-1.4*e,2.4-1.4*e);cx.globalAlpha=Math.min(1,t*6);cx.textAlign='center';cx.textBaseline='middle';cx.font=`900 ${fs}px ${F}`;cx.lineJoin='round';cx.lineWidth=fs*.14;cx.strokeStyle='#1a0000';cx.strokeText('ELIMINATED',0,0);cx.fillStyle='#ff4a3a';cx.fillText('ELIMINATED',0,0);
 const tw=cx.measureText('ELIMINATED').width;cx.fillStyle='#ff4a3a';cx.fillRect(-tw/2,fs*.6,tw*Math.min(1,t*3),3);cx.restore();
 const fa=cl((t-.25)*4,0,1);cx.globalAlpha=fa;cx.textBaseline='alphabetic';
 const kp=snap.p.find(p=>p.id==m.kb),a='Killed by ',b=kp?kp.name:'the arena',c=m.kw&&WP[m.kw]?'  ['+WP[m.kw].n+']':'',ys=y0+fs*.95;
 cx.font=`bold ${fs*.42|0}px ${F}`;cx.textAlign='left';const wa=cx.measureText(a).width,wb=cx.measureText(b).width,wc=cx.measureText(c).width,x0=W/2-(wa+wb+wc)/2;
 cx.fillStyle='#9fb2c0';cx.fillText(a,x0,ys);cx.fillStyle=kp?`hsl(${kp.hue} 85% 68%)`:'#e8eef2';cx.fillText(b,x0+wa,ys);cx.fillStyle='#9fb2c0';cx.fillText(c,x0+wa+wb,ys);
 cx.globalAlpha=1;
 const n=Math.max(1,m.rs);if(tickN!==n){tickN=n;sfx('tick',{rate:n==1?1.3:1,vol:.8,j:0})}
 const ph=cl(m.rs-(m.rf==null?m.rs-1:m.rf),0,1),pu=1+.28*Math.pow(1-ph,4),nf=Math.max(54,Math.min(110,H*.19));
 cx.save();cx.globalAlpha=cl((t-.3)*4,0,1);cx.translate(W/2,ys+nf*.95);cx.scale(pu,pu);cx.textAlign='center';cx.textBaseline='middle';cx.font=`900 ${nf}px ${F}`;cx.lineJoin='round';cx.lineWidth=nf*.1;cx.strokeStyle='#1a0000';cx.strokeText(n,0,0);cx.fillStyle=n<=2?'#ffb02e':'#fff';cx.fillText(n,0,0);cx.restore();
 cx.textBaseline='alphabetic';cx.globalAlpha=1}
function roundFx(t,won,W,H,F,dt,w,m){
 const fi=cl(t*3,0,1),cx0=W/2,fs=cl(H*.13,34,96),cy0=Math.max(H*.2,56)+fs*.5,ac=won?'#ffc83a':'#ff4a3a';
 if(won){cx.fillStyle=`rgba(40,28,0,${.5*fi})`;cx.fillRect(0,0,W,H);
  cx.save();cx.translate(cx0,cy0);cx.rotate(t*.35);cx.globalCompositeOperation='lighter';const L=Math.max(W,H);
  for(let i=0;i<14;i++){const a=i/14*6.2832;cx.fillStyle=`rgba(255,200,58,${.11*fi})`;cx.beginPath();cx.moveTo(0,0);cx.arc(0,0,L,a,a+.2);cx.closePath();cx.fill()}cx.restore();
  const gl=cx.createRadialGradient(cx0,cy0,0,cx0,cy0,H*.6);gl.addColorStop(0,`rgba(255,220,120,${.35*fi})`);gl.addColorStop(1,'rgba(255,200,58,0)');cx.fillStyle=gl;cx.fillRect(0,0,W,H);
  if(!confDone){confDone=1;for(let i=0;i<110;i++){const l=Math.random()<.5;conf.push({x:l?0:W,y:H+10,vx:(l?1:-1)*(120+Math.random()*420),vy:-(500+Math.random()*650),r:Math.random()*6,vr:(Math.random()-.5)*14,w:6+Math.random()*6,h:4+Math.random()*5,c:`hsl(${Math.random()*360|0} 90% 60%)`,l:6})}}
  if(t<3.5&&Math.random()<dt*45)conf.push({x:Math.random()*W,y:-10,vx:(Math.random()-.5)*90,vy:60+Math.random()*120,r:Math.random()*6,vr:(Math.random()-.5)*10,w:6+Math.random()*6,h:4+Math.random()*5,c:`hsl(${Math.random()*360|0} 90% 60%)`,l:6})}
 else{cx.fillStyle=`rgba(25,0,0,${.55*fi})`;cx.fillRect(0,0,W,H);const vg=cx.createRadialGradient(W/2,H/2,H*.2,W/2,H/2,H*.9);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,`rgba(150,10,10,${(.45+.15*Math.sin(t*3))*fi})`);cx.fillStyle=vg;cx.fillRect(0,0,W,H)}
 // cinematic title band
 const bh=fs*1.5*eob(t/.45),bg=cx.createLinearGradient(0,0,W,0),bc=won?'rgba(60,38,0,.82)':'rgba(36,0,0,.84)';
 bg.addColorStop(0,'rgba(0,0,0,0)');bg.addColorStop(.18,bc);bg.addColorStop(.82,bc);bg.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=bg;cx.fillRect(0,cy0-bh/2,W,bh);
 cx.globalAlpha=.85*fi;cx.fillStyle=ac;cx.fillRect(W*.14,cy0-bh/2,W*.72,2);cx.fillRect(W*.14,cy0+bh/2-2,W*.72,2);cx.globalAlpha=1;
 if(won&&H>=460)for(let i=0;i<3;i++){const k=eob((t-.5-i*.2)/.35);if(k<=0)continue;const sz=fs*(i==1?.34:.26)*k,sy=cy0-fs*(i==1?1.05:.85);cx.save();cx.shadowColor='#ffc83a';cx.shadowBlur=20;cx.fillStyle=GOLD;cx.strokeStyle='#7a4a00';cx.lineWidth=3;star(cx0+(i-1)*fs*.85,sy,sz,Math.sin(t*2+i)*.12);cx.fill();cx.stroke();cx.restore()}
 // title
 const txt=won?'VICTORY':'DEFEAT';cx.save();cx.textAlign='center';cx.textBaseline='middle';cx.font=`900 ${fs}px ${F}`;cx.lineJoin='round';
 if(won){const k=eob(t/.6)*(1+.03*Math.sin(t*5));cx.translate(cx0,cy0);cx.scale(k,k);cx.shadowColor='#ffb02e';cx.shadowBlur=30}
 else{const sh=t>.3&&t<.7?(Math.random()-.5)*8*(1-(t-.3)/.4):0;cx.translate(cx0+sh,cy0-(1-bnc(t/.9))*H*.4)}
 cx.globalAlpha=fi;cx.lineWidth=fs*.1;cx.strokeStyle=won?'#3a2400':'#1a0000';cx.strokeText(txt,0,0);
 const gg=cx.createLinearGradient(0,-fs/2,0,fs/2);if(won){gg.addColorStop(0,'#fff6c0');gg.addColorStop(1,'#ffa81f')}else{gg.addColorStop(0,'#ff6a5f');gg.addColorStop(1,'#8a1410')}cx.fillStyle=gg;cx.fillText(txt,0,0);cx.restore();
 // winner line (defeat only)
 const fa=cl((t-.6)*3,0,1);cx.textBaseline='alphabetic';
 if(!won){cx.globalAlpha=fa;cx.font=`bold ${Math.max(13,fs*.26|0)}px ${F}`;const a=w.name,b=' wins the round',wa=cx.measureText(a).width,wb=cx.measureText(b).width,x0=cx0-(wa+wb)/2,yy=cy0+fs*1.08;cx.textAlign='left';cx.fillStyle=`hsl(${w.hue} 85% 68%)`;cx.fillText(a,x0,yy);cx.fillStyle='#c9b4b0';cx.fillText(b,x0+wa,yy)}
 // final ranking: winner first, then kills (desc), then deaths (asc)
 const rows=[...snap.p].sort((a,b)=>(b.id==w.id)-(a.id==w.id)||b.k-a.k||a.d-b.d),
  tw=Math.min(380,W*.88),rh=cl(H*.056,19,28),tx=cx0-tw/2,ty=cy0+fs*(won?1.0:1.3),fz=Math.max(11,rh*.52|0),
  nr=cl(Math.floor((H-(ty+6)-60)/(rh+3)),3,Math.min(10,rows.length)),list=rows.slice(0,nr),mi=rows.findIndex(p=>p.id==myId);
 if(mi>=nr&&nr>0)list[nr-1]=rows[mi];
 cx.globalAlpha=fa;cx.font=`bold ${fz-2}px ${F}`;cx.fillStyle='#6d7e8b';cx.textAlign='left';cx.fillText('RANK',tx+4,ty);cx.textAlign='right';cx.fillText('K',tx+tw-52,ty);cx.fillText('D',tx+tw-8,ty);
 list.forEach((p,i)=>{const ta=.8+i*.1,al=cl((t-ta)*5,0,1);if(al<=0)return;const ox=(1-eob((t-ta)/.3))*50,y=ty+6+i*(rh+3),isW=p.id==w.id,isMe=p.id==myId,rk=rows.indexOf(p)+1,my=y+rh/2;
  cx.save();cx.globalAlpha=al;cx.translate(ox,0);
  rr(tx,y,tw,rh,6);cx.fillStyle=isW?'rgba(80,56,6,.92)':'rgba(11,17,23,.88)';cx.fill();cx.strokeStyle=isW?'#ffc83a':isMe?`hsl(${p.hue} 80% 55%)`:'#2a3846';cx.lineWidth=isW||isMe?2:1;cx.stroke();
  cx.textBaseline='middle';cx.font=`bold ${fz}px ${F}`;
  if(isW){cx.fillStyle=GOLD;star(tx+16,my,rh*.38,0);cx.fill()}
  else if(rk<=3){cx.fillStyle=rk==2?'#c7d0d8':'#c98a4b';cx.beginPath();cx.arc(tx+16,my,rh*.36,0,6.28);cx.fill();cx.fillStyle='#10161c';cx.textAlign='center';cx.fillText(rk,tx+16,my+.5)}
  else{cx.fillStyle='#84949f';cx.textAlign='center';cx.fillText(rk,tx+16,my)}
  cx.fillStyle=`hsl(${p.hue} 78% 50%)`;cx.beginPath();cx.arc(tx+40,my,rh*.24,0,6.28);cx.fill();
  cx.textAlign='left';cx.fillStyle=isMe?'#fff':'#d4dde3';cx.fillText(p.name,tx+56,my);
  cx.textAlign='right';cx.fillStyle=isW?GOLD:'#e8eef2';cx.fillText(p.k,tx+tw-52,my);cx.fillStyle='#84949f';cx.fillText(p.d,tx+tw-8,my);cx.restore()});
 // back-to-home button (DOM) sits right under the ranking
 const hb=$('home');hb.hidden=false;hb.textContent='BACK TO HOME';hb.style.top=Math.min(H-54,ty+6+list.length*(rh+3)+12)+'px';hb.style.opacity=cl((t-1.2)*3,0,1);hb.style.pointerEvents=t>1.2?'auto':'none';
 cx.textBaseline='alphabetic';cx.globalAlpha=1}
function hudFx(m,now,W,H,F,dt){
 if(m&&m.al&&m.hp<30&&!snap.w&&now-beatT>850){beatT=now;sfx('heart',{j:0})}
 const ht=(now-healAt)/1000;
 if(m&&m.al&&ht>=0&&ht<.8){const g=cx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,H*.85);g.addColorStop(0,'rgba(95,255,140,0)');g.addColorStop(1,`rgba(95,255,140,${.38*(1-ht/.8)})`);cx.fillStyle=g;cx.fillRect(0,0,W,H)}
 const lt=(now-liveAt)/1000;
 if(m&&m.al&&lt>=0&&lt<.9){const k=lt/.9;cx.fillStyle=`rgba(255,255,255,${.55*(1-k)*(1-k)})`;cx.fillRect(0,0,W,H);cx.strokeStyle=`hsla(${m.hue},95%,70%,${1-k})`;cx.lineWidth=8*(1-k)+1;cx.beginPath();cx.arc(W/2,H/2,Math.max(1,k*Math.max(W,H)*.6),0,6.28);cx.stroke()}
 if(m&&m.al&&m.inv>0&&!snap.w){const g=cx.createRadialGradient(W/2,H/2,H*.35,W/2,H/2,H*.85);g.addColorStop(0,`hsla(${m.hue},95%,65%,0)`);g.addColorStop(1,`hsla(${m.hue},95%,65%,${.28*Math.min(1,m.inv/.5)})`);cx.fillStyle=g;cx.fillRect(0,0,W,H)}
 if(m&&!m.al&&!snap.w)deathUI(m,now,W,H,F);
 if(m&&snap.w&&snap.w.id==myId&&window.VS){if(!vsLoadShown){vsLoadShown=1;window.CSKLoad&&CSKLoad.show();setTimeout(function(){VS.show(snap,myId);window.CSKLoad&&CSKLoad.hide()},260)}$('home').hidden=true}else{vsLoadShown=0;window.VS&&VS.hide();if(m&&snap.w)roundFx((now-winT)/1000,snap.w.id==myId,W,H,F,dt,snap.w,m);else $('home').hidden=true}
 if(conf.length){for(const q of conf){q.vy+=520*dt;q.vx*=1-1.1*dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.r+=q.vr*dt;q.l-=dt}conf=conf.filter(q=>q.y<H+20&&q.l>0);
  for(const q of conf){cx.save();cx.translate(q.x,q.y);cx.rotate(q.r);cx.scale(1,Math.cos(q.r*2));cx.fillStyle=q.c;cx.fillRect(-q.w/2,-q.h/2,q.w,q.h);cx.restore()}}}
/* Professional shell: sound toggle, fullscreen, error reporting */
(function(){const g=id=>document.getElementById(id),mt=g('mt');
function lab(){mt.textContent='SOUND: '+(mute?'OFF':'ON')}
mt.onclick=()=>{mute=!mute;lab();try{localStorage.setItem('ar-mute',mute?'1':'0')}catch(e){}};
try{if(localStorage.getItem('ar-mute')=='1')mute=true}catch(e){}lab();
addEventListener('keydown',e=>{if(kis('mute',e.code))setTimeout(lab,0)});
const fe=document.documentElement,fsOn=()=>document.fullscreenElement||document.webkitFullscreenElement;
if(!(fe.requestFullscreen||fe.webkitRequestFullscreen))g('fs').style.display='none';
g('fs').onclick=()=>{try{fsOn()?(document.exitFullscreen||document.webkitExitFullscreen).call(document):(fe.requestFullscreen||fe.webkitRequestFullscreen).call(fe)}catch(e){}};
let et;function showErr(m){const x=g('err');x.textContent='Something went wrong: '+m+' — reload to continue.';x.style.display='block';clearTimeout(et);et=setTimeout(()=>x.style.display='none',6000)}
addEventListener('error',e=>showErr(e.message||'unexpected error'));addEventListener('unhandledrejection',e=>showErr(String(e.reason&&e.reason.message||e.reason)));
document.addEventListener('contextmenu',e=>{if(g('menu').style.display=='none')e.preventDefault()});
})();
/* ===== ACCOUNT: Google sign-in (Firebase Auth). Solo play is free for everyone.
   Signing in saves career stats (kills, K/D, wins, streak), callsign and colour to the player's cloud account.
   Cloud layout:  users/<uid>/stats   {k,d,w,m,bs}   (numbers, updated with a transaction so several devices add up)
                  users/<uid>/profile {name,hue,t}
   Local keys:    ar-acct (who is signed in on this device), ar-stats (cache), ar-base (last value known to be in the cloud) */
(function(){
const $=id=>document.getElementById(id);
const LG=k=>{try{return localStorage.getItem(k)}catch(e){return null}},LS=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}},LD=k=>{try{localStorage.removeItem(k)}catch(e){}};
const J=k=>{try{return JSON.parse(LG(k))}catch(e){return null}};
const XK=['cn'];['pistol','smg','shotgun','rifle','blaster'].forEach(g=>XK.push('s_'+g,'h_'+g));window.AR_XK=XK;
const KEYS=['k','d','w','m',...XK],Z=()=>{const o={k:0,d:0,w:0,m:0,bs:0};XK.forEach(x=>o[x]=0);return o};
const norm=o=>{const r=Z();if(o&&typeof o=='object')for(const k in r)r[k]=Math.max(0,+o[k]||0);return r};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clock=()=>{try{return new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}catch(e){return ''}};
let locked='',askP=null,lyT=0,lyJ=null;
let hint=J('ar-acct'),user=null,auth=null,db=null,attached=false,busy=false,inflight=false,syncP=null,dirty=false,timer=0,pt=0,errT=0,note='',noteBad=false,denied=false;
const isDenied=e=>!!e&&(String(e.code||'').toUpperCase().indexOf('PERMISSION')>=0||/permission[_ ]denied/i.test(String(e.message||'')));
let base=hint?norm(J('ar-base')):Z();
const S=()=>window.AR_ST?window.AR_ST.get():Z();
const setS=o=>{try{window.AR_ST.set(o)}catch(e){}};
const ref=p=>db.ref('users/'+user.uid+'/'+p);
const persist=()=>{LS('ar-stats',JSON.stringify(S()));LS('ar-base',JSON.stringify(base))};

/* ---------- permanent callsign: chosen once per account, stored at users/<uid>/callsign ---------- */
const NAME_RE=/^[\p{L}\p{N}_ .\-]{3,12}$/u,cleanName=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,12);
const LOCK_SVG='<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1.5A1.5 1.5 0 0 1 20 11.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>';
function lockName(n){locked=n;const nm=$('nm');
 if(nm){nm.value=n;nm.readOnly=true;nm.classList.add('cs-lock');nm.title='Your callsign is permanent';nm.setAttribute('aria-readonly','true')}
 LS('ar-name',n);const w=user||hint;if(w)LS('ar-cs',JSON.stringify({uid:w.uid,name:n}));
 const lb=document.querySelector('label[for="nm"]');if(lb&&!lb.querySelector('.cs-lk'))lb.insertAdjacentHTML('beforeend','<span class="cs-lk">'+LOCK_SVG+' PERMANENT</span>')}
/* global unique-name index: callsigns/<lowercase name> = uid (first come, first served) */
function nameKey(n){let s=String(n);try{s=s.normalize('NFKC')}catch(e){}return s.toLowerCase().replace(/[\s._\-]+/g,' ').trim().replace(/[.$#\[\]\/]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}
const RESERVED=['player','guest','admin','moderator','csk','bot','system','server'];
/* live check for the name popup: true = free (or already yours) */
function nameFree(n){return new Promise(res=>{const k=nameKey(n);if(RESERVED.indexOf(k)>=0)return res(false);let fin=0;const t=setTimeout(()=>{if(!fin){fin=1;res(null)}},6000);
 try{db.ref('callsigns/'+k).once('value',s=>{if(fin)return;fin=1;clearTimeout(t);const v=s.val();res(!v||(user&&v===user.uid))},()=>{if(!fin){fin=1;clearTimeout(t);res(null)}})}catch(e){if(!fin){fin=1;clearTimeout(t);res(null)}}})}
function claimIdx(n){return new Promise((res,rej)=>{let fin=0;const t=setTimeout(()=>{if(!fin){fin=1;rej({code:'timeout'})}},9000);
 try{db.ref('callsigns/'+nameKey(n)).transaction(cur=>(cur&&cur!==user.uid)?undefined:user.uid,(err,ok)=>{if(fin)return;fin=1;clearTimeout(t);if(err)rej(err);else if(!ok)rej({code:'name-taken'});else res()},false)}
 catch(e){if(!fin){fin=1;clearTimeout(t);rej(e)}}})}
async function claim(n){if(RESERVED.indexOf(nameKey(n))>=0)throw {code:'name-taken'};await claimIdx(n);const got=await claim0(n);
 if(got&&nameKey(got)!==nameKey(n)){try{db.ref('callsigns/'+nameKey(n)).transaction(c=>c===user.uid?null:undefined)}catch(e){}}
 return got}
function claim0(n){return new Promise((res,rej)=>{let fin=0;const t=setTimeout(()=>{if(!fin){fin=1;rej({code:'timeout'})}},9000);
 try{ref('callsign').transaction(cur=>cur&&cur.name?undefined:{name:n,t:Date.now()},(err,ok,snap)=>{if(fin)return;fin=1;clearTimeout(t);if(err)rej(err);else{const v=snap&&snap.val();res(v&&v.name?String(v.name):n)}},false)}
 catch(e){if(!fin){fin=1;clearTimeout(t);rej(e)}}})}
function askName(pre){if(askP)return askP;
 askP=new Promise(done=>{
  const title='CHOOSE YOUR CALLSIGN',o=document.createElement('div');o.id='cs-pop';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-labelledby','cs-t');
  const lockIc='<svg class="cs-lic" viewBox="0 0 24 24" aria-hidden="true"><path class="shk" d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.6" fill="currentColor"/><circle cx="12" cy="15.2" r="1.7" fill="#1a1000"/><rect x="11.2" y="15.5" width="1.6" height="3.2" rx=".8" fill="#1a1000"/></svg>';
  o.innerHTML='<div class="cs-card" data-step="1">'
   +'<div class="cs-emb"><svg viewBox="0 0 96 96" aria-hidden="true"><circle class="r1" cx="48" cy="48" r="45" fill="none" stroke="#ffb02e" stroke-opacity=".55" stroke-width="2" stroke-dasharray="10 8"/><circle class="r2" cx="48" cy="48" r="37" fill="none" stroke="#ffd067" stroke-opacity=".4" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round"/><g class="hx"><g transform="translate(12 12) scale(1.5)"><path d="M24 6 41 15v18L24 42 7 33V15z" fill="#0d1217" stroke="#ffb02e" stroke-width="3"/><path d="M15 29 24 13l9 16h-5l-4-7-4 7z" fill="#ffb02e"/></g></g></svg></div>'
   +'<h2 id="cs-t" aria-label="Choose your callsign"><span aria-hidden="true">'+title.split('').map((c,i)=>'<i style="--i:'+i+'">'+(c==' '?'&nbsp;':c)+'</i>').join('')+'</span></h2>'
   +'<div class="cs-p cs-p1"><p class="cs-sub">This is the name other players will see.</p>'
   +'<div class="cs-plate"><span class="cs-pv ph" id="cs-pv">YOUR NAME</span></div>'
   +'<div class="cs-fld"><input id="cs-in" maxlength="12" autocomplete="off" spellcheck="false" placeholder="3–12 characters" aria-label="Callsign" aria-describedby="cs-er cs-wn" data-f><span id="cs-ct">0/12</span></div>'
   +'<p class="cs-er" id="cs-er" role="alert"></p>'
   +'<div class="cs-warn" id="cs-wn"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8 22.2 20.5a1 1 0 0 1-.9 1.5H2.7a1 1 0 0 1-.9-1.5zM11 9v5.5h2V9zm0 7.5v2h2v-2z"/></svg><div><b>This name is permanent.</b> It is saved to your account and <b>can never be changed</b> — on any device.</div></div>'
   +'<button class="cs-btn" id="cs-go" type="button" disabled>CONTINUE</button>'
   +'<button class="cs-lnk" id="cs-so" type="button">Use a different account</button></div>'
   +'<div class="cs-p cs-p2">'+lockIc+'<p class="cs-sub">Lock in this callsign?</p><div class="cs-big" id="cs-fin"></div>'
   +'<p class="cs-fin"><b>Last chance.</b> Once locked, this name <b>cannot be changed again</b>.</p>'
   +'<p class="cs-er" id="cs-er2" role="alert"></p>'
   +'<div class="cs-row"><button class="cs-btn s" id="cs-bk" type="button">GO BACK</button><button class="cs-btn" id="cs-lk" type="button" data-f>LOCK IT IN</button></div>'
   +'<button class="cs-lnk" id="cs-sk" type="button" hidden>Skip for now</button></div>'
   +'<div class="cs-p cs-p3">'+lockIc+'<p class="cs-sub">Callsign locked</p><div class="cs-big">WELCOME,<br><span id="cs-wl"></span></div></div>'
   +'<div class="cs-burst" id="cs-bs"></div></div>';
  document.body.appendChild(o);
  const q=s=>o.querySelector(s),inp=q('#cs-in'),pv=q('#cs-pv'),ct=q('#cs-ct'),er=q('#cs-er'),go=q('#cs-go'),card=q('.cs-card');let working=0;
  const check=()=>{const n=cleanName(inp.value);ct.textContent=inp.value.length+'/12';pv.textContent=n||'YOUR NAME';pv.classList.toggle('ph',!n);pv.classList.remove('bump');void pv.offsetWidth;if(n)pv.classList.add('bump');
   const m=!n?'':n.length<3?'At least 3 characters.':!NAME_RE.test(n)?'Use letters, numbers, spaces, . _ - only.':'';er.textContent=m;go.disabled=!n||!!m};
  const step=n=>{card.dataset.step=n;const f=card.querySelector('.cs-p'+n+' [data-f]');if(f)setTimeout(()=>f.focus(),80)};
  inp.addEventListener('input',check);
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go.click()}});
  go.onclick=()=>{if(go.disabled)return;q('#cs-fin').textContent=cleanName(inp.value);q('#cs-er2').textContent='';step(2)};
  q('#cs-bk').onclick=()=>{if(!working)step(1)};
  q('#cs-so').onclick=()=>{const b=$('acbtn');if(b)b.click()};
  q('#cs-sk').onclick=()=>{o.remove();askP=null;done('')};
  const spark=()=>{const b=q('#cs-bs');b.innerHTML='<i class="cs-ring"></i>';for(let i=0;i<22;i++){const e=document.createElement('i');e.className='cs-sp';e.style.cssText='--a:'+(i*(360/22)+Math.random()*10|0)+'deg;--d:'+(70+Math.random()*80|0)+'px;--h:'+(25+Math.random()*30|0);b.appendChild(e)}};
  const finish=n=>{lockName(n);q('#cs-wl').textContent=n;step(3);spark();try{navigator.vibrate&&navigator.vibrate([12,40,18])}catch(e){}
   setTimeout(()=>{o.classList.add('out');setTimeout(()=>{o.remove();askP=null;done(n)},450)},2000)};
  q('#cs-lk').onclick=async()=>{if(working)return;working=1;card.classList.add('saving');q('#cs-er2').textContent='';
   try{const n=await claim(cleanName(inp.value));working=0;card.classList.remove('saving');finish(n)}
   catch(e){working=0;card.classList.remove('saving');const den=isDenied(e);
    q('#cs-er2').textContent=den?'Names cannot be saved yet: the database rules do not allow users/<uid>/callsign.':'Could not reach the server. Check your connection and try again.';q('#cs-sk').hidden=!den}};
  o.addEventListener('keydown',e=>{if(e.key==='Tab'){const f=[...o.querySelectorAll('button,input')].filter(x=>!x.disabled&&x.offsetParent);if(f.length){const a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}}e.stopPropagation()});
  inp.value=cleanName(pre).slice(0,12);check();setTimeout(()=>inp.focus(),700)});
 return askP}
async function settleName(pv){let cs=null,den=false;
 try{cs=(await ref('callsign').once('value')).val()}catch(e){if(isDenied(e))den=true;else throw e}
 const hasName=!!(cs&&cs.name);
 if(hasName){lockName(cleanName(cs.name));claimIdx(cleanName(cs.name)).catch(()=>{})}
 const L=window.CSKLogin;
 if(L){ /* new login screen: ask for a permanent name and a password (password = email/password login linked to this Google account) */
  if(den&&!hasName)console.warn('callsign: database rules do not allow users/<uid>/callsign');
  else{const needPw=!L.hasPassword(user);
   if(!hasName||needPw){const n=await L.ask({user:user,claim:claim,free:nameFree,cleanName:cleanName,nameRe:NAME_RE,needName:!hasName,needPw:needPw,name:hasName?locked:''});if(n)lockName(n)}}
  L.ready();return}
 if(hasName)return;
 if(den){console.warn('callsign: database rules do not allow users/<uid>/callsign');return}
 const nm=$('nm'),n=await askName((pv&&pv.name)||(nm&&nm.value)||'');if(n)lockName(n)}

/* ---------- touch-button layout in the cloud: users/<uid>/layout {b,o,t} (newest edit wins) ---------- */
function saveLayout(j){lyJ=j;if(!user||!db)return;clearTimeout(lyT);lyT=setTimeout(pushLayout,1500)}
function pushLayout(){clearTimeout(lyT);lyT=0;if(!lyJ||!user||!db)return;const j=lyJ;lyJ=null;try{ref('layout').set(j).catch(e=>{lyJ=lyJ||j;console.warn('layout cloud save:',e&&e.message||e)})}catch(e){}}
async function syncLayout(){const c=(await ref('layout').once('value')).val(),l=J('ar-layout');
 if(c&&c.b&&!(l&&l.b&&(+l.t||0)>(+c.t||0))){if(window.AR_LYAPPLY)window.AR_LYAPPLY(c)}
 else if(l&&l.b)ref('layout').set(l).catch(e=>console.warn('layout cloud save:',e&&e.message||e))}

/* ---------- UI ---------- */
function ui(sub,bad){const a=$('acc');if(!a)return;
 const signed=!!(user||hint),nm=locked||(($('nm')&&$('nm').value)||'').trim().slice(0,12)||'Player',s=S(),unsaved=!signed&&(s.k>0||s.m>0);
 a.dataset.s=busy?'busy':signed?'in':'guest';a.dataset.nudge=unsaved?'1':'0';
 $('acav').textContent=signed?(String(nm).trim().charAt(0).toUpperCase()||'P'):'G';
 $('acn').textContent=signed?nm:'Guest';
 const sm=$('acs');sm.className=(bad||(!sub&&noteBad))?'bad':'';
 sm.textContent=sub||(signed?(note||(user?'Progress saves to your account':'Connecting…')):unsaved?'Sign in to keep this session’s progress':'Solo is free · progress is not saved');
 const b=$('acbtn');b.disabled=busy;$('acbl').textContent=busy?'SIGNING IN…':signed?'SIGN OUT':'SIGN IN WITH GOOGLE'}
function flash(t,bad){ui(t,bad);clearTimeout(errT);errT=setTimeout(()=>ui(),bad?9000:2500)}
function setNote(t,bad){note=t;noteBad=!!bad;ui()}

/* ---------- cloud sync ---------- */
function schedule(ms){if(!user||denied)return;clearTimeout(timer);timer=setTimeout(push,ms||1200)}
function adopt(c,sent){const s=S(),nw={};KEYS.forEach(k=>nw[k]=c[k]+Math.max(0,s[k]-sent[k]));nw.bs=Math.max(c.bs,s.bs);base=c;setS(nw);persist();
 if(KEYS.some(k=>nw[k]>base[k])||nw.bs>base.bs){dirty=true;schedule()}}
function push(){if(!user||!db||denied)return Promise.resolve();if(inflight)return syncP;if(!dirty)return Promise.resolve();
 clearTimeout(timer);timer=0;
 const sent=Object.assign({},S()),dl={};KEYS.forEach(k=>dl[k]=Math.max(0,sent[k]-base[k]));
 if(!KEYS.some(k=>dl[k])&&sent.bs<=base.bs){dirty=false;return Promise.resolve()}
 dirty=false;inflight=true;setNote('Saving…');
 syncP=new Promise(res=>{try{ref('stats').transaction(cur=>{const c=norm(cur),o={};KEYS.forEach(k=>o[k]=c[k]+dl[k]);o.bs=Math.max(c.bs,sent.bs);return o},
  (err,ok,snap)=>{inflight=false;if(err&&isDenied(err)){denied=true;setNote('Cloud save is not enabled yet (database rules)',1)}else if(err||!ok){dirty=true;setNote('Offline · will retry');timer=setTimeout(push,10000)}else{adopt(norm(snap.val()),sent);setNote('Saved '+clock())}res()},false)}
  catch(e){inflight=false;dirty=true;res()}});
 return syncP}
function applyProfile(p){if(!p){profile();return}
 const nm=$('nm');if(p.name&&nm&&!locked){nm.value=String(p.name).slice(0,12);LS('ar-name',nm.value)}
 if(p.hue!=null&&window.AR_HUE)window.AR_HUE(+p.hue);
 if(locked&&p.name!==locked)profile()}
function profile(){clearTimeout(pt);if(!user||!db)return;
 pt=setTimeout(()=>{try{const nm=$('nm'),name=(locked||(nm&&nm.value)||'').trim().slice(0,12);ref('profile').set({name:name,hue:typeof myHue=='number'?myHue:0,t:Date.now()})}catch(e){}},400)}
async function login(u){user=u;busy=false;
 const same=!!(hint&&hint.uid==u.uid),nameNow=u.displayName||u.email||'Player';
 if(!same){ /* first sign-in for this account on this device: this session's kills (and any old pre-account local stats) become part of the account */
  const legacy=hint?null:J('ar-stats');base=Z();LD('ar-base');if(hint)setS(Z());
  if(legacy){const s=S(),nw={};KEYS.forEach(k=>nw[k]=s[k]+(+legacy[k]||0));nw.bs=Math.max(s.bs,+legacy.bs||0);setS(nw)}}
 hint={uid:u.uid,name:nameNow,photo:u.photoURL||''};LS('ar-acct',JSON.stringify(hint));persist();
 setNote('Syncing…');
 try{const sn=await ref('stats').once('value'),c=norm(sn.val()),s=S(),nw={};
  KEYS.forEach(k=>nw[k]=c[k]+Math.max(0,s[k]-base[k]));nw.bs=Math.max(c.bs,s.bs);
  base=c;setS(nw);persist();dirty=KEYS.some(k=>nw[k]>c[k])||nw.bs>c.bs;
  const pf=await ref('profile').once('value'),pv=pf.val();await settleName(pv);applyProfile(pv);try{await syncLayout()}catch(e){console.warn('layout cloud sync:',e&&e.message||e)}
  setNote('Saved to your account');if(dirty)push()}
 catch(e){if(isDenied(e)){denied=true;setNote('Cloud save is not enabled yet (database rules)',1);return}dirty=true;setNote('Offline · will sync later');setTimeout(()=>{if(user)login(user)},12000)}}
function wipe(){LD('ar-stats');LD('ar-base');base=Z();if(!user||!db)return Promise.resolve();
 return Promise.race([ref('stats').set(Z()),sleep(2500)]).catch(()=>{})}

/* ---------- sign in / out ---------- */
function errText(c){return({'auth/unauthorized-domain':'This web address is not authorised for sign-in yet. Add it in Firebase → Authentication → Settings → Authorized domains.',
 'auth/operation-not-allowed':'Google sign-in is not switched on yet. Enable it in Firebase → Authentication → Sign-in method.',
 'auth/operation-not-supported-in-this-environment':'Sign-in needs the game opened from an https:// address, not a local file.',
 'auth/network-request-failed':'No connection. Check your internet and try again.',
 'auth/web-storage-unsupported':'This browser blocks the storage sign-in needs. Allow cookies/storage and retry.'})[c]||('Sign-in failed ('+(c||'unknown')+').')}
function attach(){if(attached)return true;if(!initAuth())return false;attached=true;
 try{auth.getRedirectResult().catch(e=>fail(e))}catch(e){}
 auth.onAuthStateChanged(u=>{if(u)login(u);else{busy=false;
  if(hint){hint=null;['ar-acct','ar-stats','ar-base','ar-cs'].forEach(LD);base=Z();setS(Z())}   /* saved session expired: continue as guest */
  user=null;note='';ui()}});return true}
function initAuth(){if(auth)return true;try{const d=window.fbInit&&window.fbInit();if(!d||!window.firebase||!firebase.auth)return false;db=d;auth=firebase.auth();return true}catch(e){return false}}
function fail(e){busy=false;const c=e&&e.code||'';if(c=='auth/popup-closed-by-user'||c=='auth/cancelled-popup-request'){ui();return}flash('Login failed',1)}
async function signIn(){if(busy)return;if(!attach()){flash('Login failed',1);return}
 busy=true;ui();const pr=new firebase.auth.GoogleAuthProvider();pr.setCustomParameters({prompt:'select_account'});
 try{await auth.signInWithPopup(pr)}
 catch(e){if(e&&e.code=='auth/popup-blocked'){try{await auth.signInWithRedirect(pr);return}catch(x){e=x}}fail(e)}}
async function signOut(){if(busy)return;busy=true;ui('Saving…');
 await Promise.race([push(),sleep(2500)]);
 try{if(auth)await auth.signOut()}catch(e){}
 ['ar-acct','ar-stats','ar-base','ar-cs'].forEach(LD);hint=null;user=null;try{location.reload()}catch(e){}}

/* ---------- hooks used by the game ---------- */
function saveStats(st){if(!(user||hint)){ui();return}LS('ar-stats',JSON.stringify(st));dirty=true;if(user)schedule()}
window.ARA={callsign:()=>locked||'',hint:()=>!!hint,saveStats:saveStats,profile:profile,wipe:wipe,flush:()=>{pushLayout();return push()},saveLayout:saveLayout,signedIn:()=>!!user,
 account:()=>(user||hint)?{uid:(user||hint).uid,name:locked||(($('nm')&&$('nm').value)||'').trim().slice(0,12)||'Player',photo:(user&&user.photoURL)||(hint&&hint.photo)||''}:null,
 _t:{S:S,base:()=>base}};
setTimeout(()=>{const b=$('acbtn');if(b)b.onclick=()=>(user||hint)?signOut():signIn();{const c=J('ar-cs');if(hint&&c&&c.uid==hint.uid&&c.name)lockName(String(c.name))}ui();attach();
 document.addEventListener('visibilitychange',()=>{if(document.hidden)push()});addEventListener('pagehide',()=>{pushLayout();push()})},0);
})();

/* v2: profile, stats, settings, fps */
(function(){const g=id=>document.getElementById(id),ls=(k,v)=>{try{if(v===undefined)return JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}};
const set=Object.assign({vol:90,dn:true,fps:false},ls('ar-set')||{});
let st=Object.assign({k:0,d:0,w:0,m:0,bs:0},Object.fromEntries(AR_XK.map(x=>[x,0])),(ARA.hint()?ls('ar-stats'):null)||{});   /* progress is only kept for signed-in players */
/* ---- CHARACTER LEVEL: XP = coins collected + 30 per kill (bots included). Level L needs 25*(L-1)*(L+2) total XP: Lv2 100, Lv3 250, Lv4 450, Lv5 700 ... ---- */
const KILL_XP=30,LV_MAX=99,xpAt=L=>25*(L-1)*(L+2);
function lvInfo(){const xp=Math.max(0,(+st.cn||0)+(+st.k||0)*KILL_XP);let L=1;while(L<LV_MAX&&xp>=xpAt(L+1))L++;const a=xpAt(L),b=xpAt(L+1),mx=L>=LV_MAX;return{lv:L,next:mx?L:L+1,xp:xp,cur:xp-a,need:b-a,p:mx?1:Math.min(1,(xp-a)/(b-a)),max:mx}}
window.CSK_LVL=lvInfo;let lvSeen=lvInfo().lv;
function lvCheck(){const L=lvInfo().lv;if(L>lvSeen){lvSeen=L;try{cast('LEVEL UP','You reached level '+L,48,0,'upgrade',.9)}catch(x){}}else lvSeen=L}
const GNAME={pistol:'Pistol',smg:'SMG',shotgun:'Shotgun',rifle:'Rifle',blaster:'Blaster'};
function showAcc(){const b=g('accb');if(!b)return;if(!ARA.hint()){b.hidden=true;return}b.hidden=false;let S=0,H=0,rows='';
 for(const w in GNAME){const s=st['s_'+w]||0,h=Math.min(st['h_'+w]||0,s);S+=s;H+=h;if(s)rows+='<div class="accr"><span>'+GNAME[w]+'</span><div class="t"><i style="width:'+Math.round(h/s*100)+'%"></i></div><small>'+Math.round(h/s*100)+'% \u00b7 '+h+' / '+s+'</small></div>'}
 g('accT').textContent=S?Math.round(H/S*100)+'%':'\u2013';g('accC').textContent=(st.cn||0).toLocaleString()+' coins collected';g('accR').innerHTML=rows||'<div class="accn">Fire a few shots to build your accuracy record.</div>'}
function showSt(){g('s1').textContent=st.k;g('s2').textContent=(st.k/Math.max(1,st.d)).toFixed(1);g('s3').textContent=st.w;g('s4').textContent=st.bs;showAcc()}showSt();window.AR_ST={get:()=>st,set:o=>{for(const k of['k','d','w','m','bs',...AR_XK])st[k]=+o[k]||0;showSt();lvSeen=lvInfo().lv}};window.AR_HUE=h=>{myHue=h;ls('ar-hue',h);[...(g('sw')?g('sw').children:[])].forEach((c,i)=>c.classList.toggle('on',hs[i]==h))};
const _oe=onEv;onEv=function(e){try{if(e.k=='kill'){if(e.ai==myId&&e.bi!=myId){st.k++;st.bs=Math.max(st.bs,e.ks||0)}if(e.bi==myId)st.d++;ARA.saveStats(st);lvCheck()}else if(e.k=='win'){st.m++;if(e.id==myId)st.w++;ARA.saveStats(st)}
  else if(e.id==myId&&(e.k=='coin'||e.k=='chest')&&e.v>0){st.cn=(st.cn||0)+(+e.v|0);ARA.saveStats(st);showAcc();lvCheck()}
  else if(e.k=='acc'&&e.id==myId&&e.a){for(const w in e.a){if(!GNAME[w])continue;st['s_'+w]=(st['s_'+w]||0)+(e.a[w][0]|0);st['h_'+w]=(st['h_'+w]||0)+(e.a[w][1]|0)}ARA.saveStats(st);showAcc()}}catch(x){}return _oe.apply(this,arguments)};
const hs=[8,35,55,130,175,210,265,320];let sh=ls('ar-hue');if(sh!=null)myHue=sh;
hs.forEach(h=>{const b=document.createElement('button');b.className='s'+(h==sh?' on':'');b.style.background='hsl('+h+' 85% 58%)';b.setAttribute('aria-label','Colour '+h);b.onclick=()=>{myHue=h;ls('ar-hue',h);ARA.profile();[...(g('sw')?g('sw').children:[])].forEach(c=>c.classList.toggle('on',c==b))};g('sw')&&g('sw').appendChild(b)});
const lab={dn:'Damage numbers',fps:'FPS counter'};
function apply(){window.AR_DMG=set.dn;g('vv').textContent=set.vol+'%';g('vol').value=set.vol;try{if(MG)MG.gain.value=set.vol/100}catch(e){}
 document.querySelectorAll('#st .tg').forEach(b=>b.setAttribute('aria-pressed',set[b.dataset.k]?'true':'false'));g('fps').style.display=set.fps?'block':'none';ls('ar-set',set)}
const _ai=audioInit;audioInit=function(){const r=_ai.apply(this,arguments);apply();return r};
g('vol').oninput=e=>{set.vol=+e.target.value;apply()};
document.querySelectorAll('#st .tg').forEach(b=>b.onclick=()=>{set[b.dataset.k]=!set[b.dataset.k];apply()});
const open=()=>{g('st').hidden=false},close=()=>{g('st').hidden=true};g('stb').onclick=open;g('stx').onclick=close;g('st').onclick=e=>{if(e.target==g('st'))close()};
const pb=document.querySelector('#pm .box');if(pb){pb.insertAdjacentHTML('beforeend','<button class="s" id="st2">SETTINGS</button>');g('st2').onclick=open}
apply();
const tips=['Press B to drop a bomb, press B again to detonate it.','Press Q to fire a grapple rope: hit a wall to zip across, hit an enemy to drag them in.','Dash with Shift to dodge incoming fire.','Spend coins on weapon upgrades with 1-4.','Hold Tab to see the full scoreboard.','Bombs go dead when they leave your screen, so keep them in view.'];let ti=Math.random()*tips.length|0;const tp=g('tip');
function tip(){tp.style.opacity=0;setTimeout(()=>{tp.textContent='Tip: '+tips[ti++%tips.length];tp.style.opacity=1},300)}tip();setInterval(tip,6000);
const fp=g('fps');let fr=0,ft=performance.now();
(function loop(t){fr++;if(t-ft>=1000){fp.textContent=fr+' FPS'+(PERF.ti?' \u00b7 res '+Math.round(rScale*100)+'%':'');fr=0;ft=t}
 requestAnimationFrame(loop)})(performance.now());
})();
/* in-game home scene: real in-game characters, names, terrain and pickups drawn on the game canvas */
(function(){const M=document.getElementById('menu'),RM=matchMedia('(prefers-reduced-motion:reduce)').matches;let mx=0,my=0,lt=0,fz=0;
addEventListener('pointermove',e=>{mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5});
const WL=[[260,150,260,24],[260,150,24,200],[760,90,24,230],[620,470,300,24],[1100,200,240,24],[1316,200,24,200],[1000,640,24,180],[380,620,200,24],[130,500,24,160],[860,330,56,56],[430,330,40,40],[1230,600,40,40],[560,200,36,36]];
const GM=[[700,330],[1180,430],[330,470],[900,730],[1380,90]],HP=[[560,640],[1000,110]],R2=(a,b)=>a+Math.random()*(b-a);
const inW=(x,y,q)=>WL.some(w=>x>w[0]-q&&x<w[0]+w[2]+q&&y>w[1]-q&&y<w[1]+w[3]+q);
function spot(){let x,y;do{x=R2(70,1430);y=R2(70,790)}while(inW(x,y,34));return[x,y]}
let sd=7;const rn=()=>(sd=(sd*16807)%2147483647)/2147483647,DC=Array.from({length:46},()=>({x:rn()*1500,y:rn()*860,r:18+rn()*46,a:.012+rn()*.025}));
const NM=['YOU','Lancelot','Galahad','Percival','Gawain','Tristan','Bors','Kay','Mordred'],HU=[0,8,130,175,210,265,320,55,190],WP=['rifle','smg','shotgun','pistol','blaster','rifle','smg','shotgun','pistol'];
const B=NM.map((n,i)=>{const q=spot();return{p:{id:i?'bot'+i:myId,name:n,hue:HU[i],vx:0,vy:0,w:WP[i],ul:[0,0,0,0],sh:0,sp:0},v:{x:q[0],y:q[1],a:R2(0,6.28),ph:0,hf:0,rc:0,fl:0},tx:q[0],ty:q[1],cd:R2(.2,1),hp:100,dead:0}}),S=[],PT=[],RG=[],TX=[];
function kill(b){const v=b.v;for(let i=0;i<30;i++){const a=R2(0,6.28),s=R2(60,400);PT.push({x:v.x,y:v.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:.8,h:b.p.hue})}RG.push({x:v.x,y:v.y,r:10,l:.5,h:b.p.hue});b.dead=R2(1.6,2.8);b.p.vx=b.p.vy=0}
function push(v){for(const w of WL){const qx=Math.max(w[0],Math.min(v.x,w[0]+w[2])),qy=Math.max(w[1],Math.min(v.y,w[1]+w[3])),dx=v.x-qx,dy=v.y-qy,d=Math.hypot(dx,dy);if(d<21){if(d>.01){v.x+=dx/d*(21-d);v.y+=dy/d*(21-d)}else v.x+=21;return 1}}return 0}
function step(dt){const hero=B[0];hero.p.hue=myHue;hero.p.name=(document.getElementById('nm').value||'').trim().slice(0,12)||'YOU';
 for(const b of B){const v=b.v,p=b.p;v.hf=Math.max(0,v.hf-dt);v.fl=Math.max(0,v.fl-dt);v.rc=Math.max(0,v.rc-dt*7);
  if(b.dead>0){b.dead-=dt;if(b.dead<=0){const q=spot();v.x=b.tx=q[0];v.y=b.ty=q[1];b.hp=100}continue}
  const dx=b.tx-v.x,dy=b.ty-v.y,d=Math.hypot(dx,dy);let sp=0;if(d<10){const q=spot();b.tx=q[0];b.ty=q[1]}else{sp=125;v.x+=dx/d*sp*dt;v.y+=dy/d*sp*dt;p.vx=dx/d*sp;p.vy=dy/d*sp;if(push(v)){const q=spot();b.tx=q[0];b.ty=q[1]}}
  if(!sp){p.vx=p.vy=0}v.ph+=dt*sp*.075;
  let t=null,td=560;for(const o of B)if(o!==b&&!o.dead){const e=Math.hypot(o.v.x-v.x,o.v.y-v.y);if(e<td){td=e;t=o}}
  const want=t?Math.atan2(t.v.y-v.y,t.v.x-v.x):(sp?Math.atan2(dy,dx):v.a);let df=((want-v.a+Math.PI)%6.2832+6.2832)%6.2832-Math.PI;v.a+=df*Math.min(1,dt*9);
  if(t&&Math.abs(df)<.35){b.cd-=dt;if(b.cd<=0){b.cd=R2(.3,.8);const a=v.a+R2(-.1,.1);S.push({x:v.x+Math.cos(v.a)*34,y:v.y+Math.sin(v.a)*34,vx:Math.cos(a)*1000,vy:Math.sin(a)*1000,l:.7,h:p.hue,o:b});v.fl=.06;v.rc=1}}}
 for(const s of S){s.x+=s.vx*dt;s.y+=s.vy*dt;s.l-=dt;if(inW(s.x,s.y,0)){s.l=0;PT.push({x:s.x,y:s.y,vx:R2(-80,80),vy:R2(-80,80),l:.25,h:null})}
  for(const b of B)if(b!==s.o&&!b.dead&&s.l>0&&Math.hypot(b.v.x-s.x,b.v.y-s.y)<20){s.l=0;b.hp-=34;b.v.hf=.1;TX.push({x:s.x,y:s.y-20,t:'-34',l:.7});for(let i=0;i<8;i++)PT.push({x:s.x,y:s.y,vx:R2(-200,200),vy:R2(-200,200),l:.35,h:b.p.hue});if(b.hp<=0)kill(b)}}
 for(let i=S.length-1;i>=0;i--)if(S[i].l<=0)S.splice(i,1);
 for(const q of PT){q.x+=q.vx*dt;q.y+=q.vy*dt;q.vx*=1-2.2*dt;q.vy*=1-2.2*dt;q.l-=dt}for(let i=PT.length-1;i>=0;i--)if(PT[i].l<=0)PT.splice(i,1);
 for(const r of RG){r.r+=300*dt;r.l-=dt}for(let i=RG.length-1;i>=0;i--)if(RG[i].l<=0)RG.splice(i,1);
 for(const q of TX){q.y-=40*dt;q.l-=dt}for(let i=TX.length-1;i>=0;i--)if(TX[i].l<=0)TX.splice(i,1)}
const EM=Array.from({length:70},()=>({x:rn(),y:rn(),s:.02+rn()*.06,p:rn()*6.28,r:.8+rn()*2.2,h:rn()<.25?200:38}));
function emb(T){const w=cv.width,h=cv.height,u=Math.max(1,w/1200);cx.save();cx.globalCompositeOperation='lighter';for(const e of EM){const y=((e.y-T/1000*e.s)%1+1)%1,x=e.x+Math.sin(T/1400+e.p)*.02,a=(.25+.55*Math.abs(Math.sin(T/600+e.p)))*Math.sin(y*3.14159);cx.fillStyle='hsla('+e.h+',100%,'+(e.h==38?'62%':'70%')+','+a.toFixed(3)+')';cx.beginPath();cx.arc(x*w,y*h,e.r*u,0,6.28);cx.fill()}cx.restore()}
function hm(now){const fr=RM||document.hidden||document.body.classList.contains('noanim');let dt=0;if(!fr){dt=Math.min(.05,(now-lt)/1000);fz=now}lt=now;const T=fr?fz:now;if(dt)step(dt);
 const K=Math.max(cv.width/1500,cv.height/860)*1.12;cx.setTransform(1,0,0,1,0,0);cx.fillStyle='#0a1218';cx.fillRect(0,0,cv.width,cv.height);
 cx.setTransform(K,0,0,K,(cv.width-1500*K)/2-mx*34*K+Math.sin(T/9000)*18*K,(cv.height-860*K)/2-my*22*K+Math.cos(T/11000)*12*K);
 for(let i=-4;i<19;i++)for(let j=-3;j<12;j++){cx.fillStyle=(i+j)&1?'#0e1820':'#0c151c';cx.fillRect(i*100,j*100,100,100)}
 cx.strokeStyle='#ffffff08';cx.lineWidth=1;cx.beginPath();for(let i=-400;i<=1900;i+=100){cx.moveTo(i,-300);cx.lineTo(i,1200)}for(let j=-300;j<=1200;j+=100){cx.moveTo(-400,j);cx.lineTo(1900,j)}cx.stroke();
 for(const d of DC){cx.fillStyle='rgba(120,160,190,'+d.a+')';cx.beginPath();cx.arc(d.x,d.y,d.r,0,6.28);cx.fill()}
 cx.strokeStyle='#ffffff14';cx.lineWidth=3;cx.setLineDash([22,16]);cx.beginPath();cx.arc(750,430,170,0,6.28);cx.stroke();cx.setLineDash([]);
 HP.forEach((q,i)=>{const gl=.2+.1*Math.sin(T/320+i);cx.fillStyle='rgba(74,224,138,'+gl+')';cx.beginPath();cx.arc(q[0],q[1],26,0,6.28);cx.fill();cx.fillStyle='#e8f6ee';cx.fillRect(q[0]-3,q[1]-11,6,22);cx.fillRect(q[0]-11,q[1]-3,22,6)});
 GM.forEach((q,i)=>gem(q[0],q[1]+Math.sin(T/500+i)*3,Math.sin(T/420+i)));
 for(const b of B)if(b.dead>0)corpse(b.v,b.p);
 for(const w of WL){cx.fillStyle='rgba(0,0,0,.5)';cx.fillRect(w[0]+6,w[1]+9,w[2],w[3]);cx.fillStyle='#1b2833';cx.fillRect(w[0],w[1],w[2],w[3]);cx.fillStyle='#2b3d4c';cx.fillRect(w[0],w[1],w[2],3);cx.fillRect(w[0],w[1],3,w[3]);cx.strokeStyle='#0a1016';cx.lineWidth=2;cx.strokeRect(w[0],w[1],w[2],w[3])}
 cx.lineCap='round';for(const s of S){cx.strokeStyle='hsla('+s.h+',95%,72%,.35)';cx.lineWidth=7;cx.beginPath();cx.moveTo(s.x,s.y);cx.lineTo(s.x-s.vx*.03,s.y-s.vy*.03);cx.stroke();cx.strokeStyle='#fff';cx.lineWidth=2.5;cx.beginPath();cx.moveTo(s.x,s.y);cx.lineTo(s.x-s.vx*.03,s.y-s.vy*.03);cx.stroke()}
 for(const b of B)if(b.dead<=0)drawChar(b.p,b.v,T);
 cx.textAlign='center';cx.font='bold 13px "Trebuchet MS",sans-serif';cx.lineJoin='round';
 for(const b of B){if(b.dead>0)continue;const me=b===B[0],y=b.v.y-R-26;cx.lineWidth=3.5;cx.strokeStyle='#000c';cx.strokeText(b.p.name,b.v.x,y);cx.fillStyle=me?'#ffc83a':'#e8eef2';cx.fillText(b.p.name,b.v.x,y);cx.fillStyle='#000a';cx.fillRect(b.v.x-19,y+5,38,5);cx.fillStyle=b.hp>40?'#4ae08a':'#ff5a4a';cx.fillRect(b.v.x-18,y+6,36*Math.max(0,b.hp)/100,3)}
 for(const q of PT){cx.fillStyle=q.h==null?'rgba(255,217,160,'+Math.min(1,q.l*3)+')':'hsla('+q.h+',90%,62%,'+Math.min(1,q.l*2)+')';cx.fillRect(q.x-2.5,q.y-2.5,5,5)}
 for(const r of RG){cx.strokeStyle='hsla('+r.h+',90%,65%,'+Math.min(1,r.l*1.8)+')';cx.lineWidth=4;cx.beginPath();cx.arc(r.x,r.y,r.r,0,6.28);cx.stroke()}
 cx.font='bold 16px "Trebuchet MS",sans-serif';for(const q of TX){cx.globalAlpha=Math.min(1,q.l*2);cx.lineWidth=3;cx.strokeStyle='#000';cx.strokeText(q.t,q.x,q.y);cx.fillStyle='#fff';cx.fillText(q.t,q.x,q.y)}cx.globalAlpha=1;cx.setTransform(1,0,0,1,0,0);emb(T)}
function loop(t){if(M.style.display=='none')return;try{hm(t)}catch(e){if(!window.__hmE){window.__hmE=1;console.error('home scene: '+(e&&e.stack||e))}}requestAnimationFrame(loop)}/* home scene canvas replaced by static artwork: loop not started */
})();
/* settings: full-screen grid, switches, segmented controls, game-feel feedback */
(function(){const g=id=>document.getElementById(id),L=(k,v)=>{try{if(v===undefined)return JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}};
const o=Object.assign({gfx:2,shk:2,fx:2,hf:true,kf:true,an:true,tp:true,dr:true},L('ar-set2')||{}),$$=q=>document.querySelectorAll(q);
function ap(){window.GFXQ=o.gfx;window.AR_SHK=[0,.5,1][o.shk];window.AR_FX=[.35,.7,1][o.fx];window.AR_HF=o.hf;window.AR_DR=o.dr;g('kf').style.display=o.kf?'':'none';document.body.classList.toggle('noanim',!o.an);g('tip').style.visibility=o.tp?'':'hidden';
 $$('#st [data-o]').forEach(b=>b.setAttribute('aria-pressed',o[b.dataset.o]?'true':'false'));$$('#st [data-seg]').forEach(r=>[...r.children].forEach(b=>b.setAttribute('aria-pressed',+b.dataset.i==o[r.dataset.seg]?'true':'false')));
 g('o-mute').setAttribute('aria-pressed',mute?'false':'true');L('ar-set2',o)}
$$('#st [data-o]').forEach(b=>b.onclick=()=>{o[b.dataset.o]=!o[b.dataset.o];ap()});
$$('#st [data-seg] button').forEach(b=>b.onclick=()=>{o[b.parentNode.dataset.seg]=+b.dataset.i;ap()});
g('o-mute').onclick=()=>{g('mt').click();ap()};g('o-fs').onclick=()=>g('fs').click();g('o-ed').onclick=()=>{g('stx').click();g('set').click()};
g('o-rs').onclick=()=>{if(confirm('Reset all settings to default?')){['ar-set','ar-set2','ar-mute','ar-layout','ar-keys'].forEach(k=>{try{localStorage.removeItem(k)}catch(e){}});location.reload()}};
g('o-rt').onclick=()=>{if(confirm('Reset your kills, wins and streak?')){try{localStorage.removeItem('ar-stats')}catch(e){}ARA.wipe().then(()=>location.reload())}};
g('stb').addEventListener('click',ap);document.addEventListener('click',e=>{if(e.target.closest('#st-open'))ap()});
addEventListener('keydown',e=>{if(e.key=='Escape'&&!window.KBL&&!g('st').hidden){e.stopImmediatePropagation();e.preventDefault();g('stx').click()}},true);
addEventListener('keydown',e=>{if(e.key=='Enter'&&g('menu').style.display!='none'&&!/INPUT|BUTTON/.test(document.activeElement.tagName)&&g('st').hidden)g('solo').click()});
document.addEventListener('click',e=>{const b=e.target.closest('#st button,.h-ico,.h-play,.h-btn,.h-map,.hs-btn');if(!b||b.id=='set'||b.id=='solo'||b.id=='l1'||b.id=='l2')return;try{sfx('ui',{j:0})}catch(x){}try{navigator.vibrate&&navigator.vibrate(6)}catch(x){}});
ap()})();
/* controls card: click a key box, press a key. Saved in localStorage ('ar-keys'). */
(function(){const g=id=>document.getElementById(id);
const ROWS=[['down','Move down','↓'],['right','Move right','→'],['dash','Dash','➖'],['swap','Swap / pick up gun','🔫'],['bomb','Bomb / trigger','💣'],['up1','Upgrade 1 · Damage','⬆'],['up3','Upgrade 3 · Magazine','⏫'],['board','Scoreboard (hold)','🏆'],['mute','Mute','🔊'],['up','Move up','↑'],['left','Move left','←'],['fire','Fire (auto-aim)','⚙'],['reload','Reload','⟳'],['turret','Sentry turret','♜'],['rope','Grapple rope','🪝'],['up2','Upgrade 2 · Fire rate','🔥'],['up4','Upgrade 4 · Reload','⟳'],['pause','Pause','⏸']];
let cur=null,endAt=0;
function draw(){const el=g('kg');if(!el)return;
 const RY=[441,486,531,577,623,668,714,760,806,852],SX=[[518,640],[1150,1272]],SW=[106,102];
 el.innerHTML=ROWS.map(([a,l,ic],n)=>{const c=n<9?0:1,r=n<9?n+1:n-9;return [0,1].map(i=>'<button type="button" class="ks'+(KB[a][i]?'':' empty')+'" aria-label="'+l+'" data-a="'+a+'" data-s="'+i+'" style="--x:'+(SX[c][i]-2)+';--y:'+(RY[r]-21)+';--w:'+(SW[i]+4)+';--h:42">'+kname(KB[a][i])+'</button>').join('')}).join('');
 kbHints()}
function stop(){window.KBL=1;setTimeout(()=>{window.KBL=0},220);removeEventListener('keydown',onKey,true);cur=null;endAt=Date.now()}
function onKey(e){e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
 const b=cur;if(!b)return;const a=b.dataset.a,s=+b.dataset.s;
 if(e.code=='Escape'){stop();draw();return}
 if(/^(Meta|OS|ContextMenu)/.test(e.code)||e.code=='Unidentified')return;
 const c=e.code=='Backspace'||e.code=='Delete'?'':e.code,mv=kbSet(a,s,c);stop();draw();
 const nb=document.querySelector('#kg [data-a="'+a+'"][data-s="'+s+'"]');if(nb){nb.classList.add('hit')}
 if(mv&&mv!=a){const lab=ROWS.find(r=>r[0]==mv);try{msgFlash(kname(c)+' moved from '+(lab?lab[1]:mv))}catch(x){}}}
document.addEventListener('click',e=>{const b=e.target.closest('#kg .ks');
 if(cur&&(!b||b!==cur)){stop();draw()}
 if(!b||(e.detail===0&&Date.now()-endAt<400))return;
 cur=b;window.KBL=1;draw();const nb=document.querySelector('#kg [data-a="'+b.dataset.a+'"][data-s="'+b.dataset.s+'"]');cur=nb;nb.classList.add('on');nb.textContent='PRESS KEY';nb.focus();addEventListener('keydown',onKey,true)});
g('kb-rs').onclick=()=>{if(cur){stop()}kbReset();draw();try{msgFlash('Controls reset to default')}catch(x){}};
const so=g('st-open');draw();document.addEventListener('click',e=>{if(e.target.closest('#st-open,#set'))draw()});
})();
