/* ============ ROOM LOBBY ============
 Purely additive layer, loaded after game.js. Create Room / Join Room no longer drop the
 player straight into a live match — they land here first. The match itself still starts
 by calling the game's own start(mode, room) exactly as before; nothing about gameplay,
 netcode or the wire protocol is touched.

 Firebase layout (new nodes only, alongside the ones game.js already owns):
  rooms/<CODE>/lobby/<id>   { name, photo, seat (0-19), ready (0/1), host (0/1), t }
  rooms/<CODE>/kick/<key>   server timestamp written by the host when a player is removed. <key> is the
                            player's persistent device id (and their account uid when signed in), so a
                            reload does not shake the 120 s lockout. Clients ignore records older than
                            KICK_COOL, so nothing needs cleaning up.
 rooms/<CODE>/lstart       epoch ms written once by the host; clients watch it to begin
                            their own 15s "match starting" countdown in lockstep.

 Seats: 20 are shown, but only MAXH (8) can ever be occupied by a real player — the match's
 own netcode has no room for more. Seats beyond MAXH are shown locked, not joinable. */
(function(){
const $=id=>document.getElementById(id);
const SEATS=20;
const KICK_COOL=120000;   /* a removed player must wait this long before joining that room again */
let lobRoot=null,lobRef=null,startRef=null,kickRef=null,mySeat=-1,myReady=0,amHost=0,code='',roster={},
    countdownT=null,enteredMatch=0,nameT=null,tOff=0;
const LOAD=()=>window.CSKLoad||{show(){},hide(){},around:f=>f()};

/* Name shown in the lobby = the player's callsign (the permanent in-game name chosen at login) and nothing else.
   The Google display name / Gmail address is never used. Only the Google profile picture is taken from the account. */
function callsign(){
 let n='';
 try{if(window.ARA&&ARA.callsign)n=ARA.callsign()||''}catch(e){}
 if(!n){   /* not locked yet: fall back to the name field, but refuse anything that looks like the Google identity */
  n=(($('nm')&&$('nm').value)||'').trim();
  const a=(window.ARA&&ARA.account&&ARA.account())||null;
  if(n.indexOf('@')>=0)n=''}
 n=n.slice(0,12);
 return n||'Player'}
function myAccount(){
 const a=(window.ARA&&ARA.account&&ARA.account())||null;
 return{uid:a?a.uid:myId,name:callsign(),photo:(a&&a.photo)||''}}

/* ---------- persistent identity (survives reloads) used for the kick lockout ---------- */
function devKey(){
 let k='';try{k=localStorage.getItem('csk-did')||''}catch(e){}
 if(!k){k='d'+Math.random().toString(36).slice(2,10)+Date.now().toString(36);try{localStorage.setItem('csk-did',k)}catch(e){}}
 return k}
function uidKey(){const a=(window.ARA&&ARA.account&&ARA.account())||null;return a&&a.uid?'u'+String(a.uid).replace(/[.#$\[\]\/]/g,'_'):''}
const serverNow=()=>Date.now()+tOff;
function loadOffset(){
 try{return FBdb.ref('.info/serverTimeOffset').once('value').then(s=>{tOff=+s.val()||0}).catch(()=>{})}catch(e){return Promise.resolve()}}
function fmtLeft(ms){const t=Math.max(1,Math.ceil(ms/1000)),m=(t/60)|0,sec=t%60;return m+':'+(sec<10?'0':'')+sec}
/* how long (ms) this player is still locked out of room rc; 0 = free to join */
async function kickLeft(rc){
 let left=0;
 try{const e=+localStorage.getItem('csk-kick:'+rc)||0;if(e>Date.now())left=e-Date.now()}catch(e){}
 try{
  await loadOffset();
  const keys=[devKey(),uidKey()].filter(Boolean);
  const snaps=await Promise.all(keys.map(k=>FBdb.ref('rooms/'+rc+'/kick/'+k).once('value')));
  snaps.forEach(sn=>{const t=+sn.val();if(t){const l=t+KICK_COOL-serverNow();if(l>left)left=l}})
 }catch(e){}
 return left}

/* ---------- avatar ---------- */
function initials(n){return String(n||'?').trim().slice(0,1).toUpperCase()||'?'}
function avatarHTML(p){
 if(p.photo)return '<img src="'+p.photo.replace(/"/g,'&quot;')+'" alt="" referrerpolicy="no-referrer">';
 return '<i class="lob-ini">'+initials(p.name)+'</i>'}

/* ---------- rendering ---------- */
/* painted seat frames in the artwork (px in the 1983x793 image): 5 columns x 4 rows, numbered 1-20 */
const SX=[472,689,902,1115,1325],SW=[194,191,190,188,189],SY=[148,279,412,545],SH=[109,111,111,111];
const ICON_LOCK='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const ICON_CHECK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const allReady=()=>{const l=Object.values(roster);return l.length>1&&l.every(p=>p.ready||p.host)}   /* needs at least 2 players */; /* the host's START press is their "ready" */
function render(){
 const wrap=$('lob-seats');if(!wrap)return;
 const occ=Object.keys(roster).length;
 $('lob-cnt').textContent=occ+' / '+MAXH+' PLAYERS';
 const frag=document.createDocumentFragment();
 for(let i=0;i<SEATS;i++){
  const locked=i>=MAXH;
  const pid=Object.keys(roster).find(k=>roster[k].seat===i);
  const p=pid?roster[pid]:null;
  const el=document.createElement('div');
  el.className='lob-seat'+(locked?' lob-locked':p?' lob-filled':' lob-open')+(p&&p.ready?' lob-rdy':'')+(pid===myId?' lob-me':'');
  const c=i%5,r=(i/5)|0;
  el.style.cssText='--x:'+SX[c]+';--y:'+SY[r]+';--w:'+SW[c]+';--h:'+SH[r];
  if(locked){
   el.innerHTML='<div class="lob-veil">'+ICON_LOCK+'</div><div class="lob-pill">LOCKED</div>';
  }else if(p){
   el.innerHTML='<div class="lob-glow"></div><div class="lob-av">'+avatarHTML(p)+'</div>'
    +(p.host?'<div class="lob-host-tag">HOST</div>':'')
    +(p.ready||p.host?'<div class="lob-ck">'+ICON_CHECK+'</div>':'')
    +'<div class="lob-pill">'+escapeHtml(p.name||'Player')+(pid===myId?'<small>(you)</small>':'')+'</div>';
   if(amHost&&pid!==myId&&!countdownT){
    el.classList.add('lob-pick');el.setAttribute('role','button');el.tabIndex=0;
    el.setAttribute('aria-label',(p.name||'Player')+': options');
    el.onclick=e=>{e.stopPropagation();openPop(pid)};
    el.onkeydown=e=>{if(e.key=='Enter'||e.key==' '){e.preventDefault();openPop(pid)}}}
  }else{
   el.innerHTML='<div class="lob-glow"></div><div class="lob-pill">OPEN SEAT</div>';
   el.setAttribute('role','button');el.tabIndex=0;
   el.onclick=()=>takeSeat(i);
   el.onkeydown=e=>{if(e.key=='Enter'||e.key==' '){e.preventDefault();takeSeat(i)}};
  }
  frag.appendChild(el)}
 wrap.innerHTML='';wrap.appendChild(frag);
 if(popPid)placePop();
 /* READY (players) / START (host) share the big gold button */
 const rb=$('lob-ready'),sb=$('lob-start');
 if(rb){
  rb.hidden=amHost;
  const lab=rb.querySelector('.lab');
  rb.disabled=mySeat<0;
  if(lab)lab.textContent=mySeat<0?'PICK A SEAT':(myReady?'NOT READY':'READY UP');
  rb.classList.toggle('on',!!myReady&&mySeat>=0)}
 if(sb){sb.hidden=!amHost;sb.disabled=!allReady()}
 const hint=$('lob-hint');
 if(hint){
  if(amHost)hint.textContent=occ<2?'WAITING FOR PLAYERS':(allReady()?'ALL READY':'WAITING FOR READY');
  else hint.textContent=mySeat<0?'PICK A SEAT':(myReady?'WAITING FOR HOST':'PRESS READY')}}
/* Host taps another player's seat -> small popup with "KICK OUT". Tap anywhere else / Esc to dismiss. */
let popPid='';
function closePop(){popPid='';const o=$('lob-pop');if(o)o.hidden=true}
function openPop(pid){
 if(!amHost||!roster[pid]||pid===myId||countdownT)return;
 sfx&&sfx('ui',{j:0});popPid=pid;placePop()}
function placePop(){
 const o=$('lob-pop');if(!o)return;
 const p=roster[popPid];
 if(!p||!amHost||countdownT){closePop();return}
 const i=p.seat,c=i%5,r=(i/5)|0,cx=SX[c]+SW[c]/2,W=176;
 o.style.cssText='--x:'+Math.round(cx-W/2)+';--y:'+(SY[r]+SH[r]-14)+';--w:'+W+';--h:78';
 $('lob-pop-n').textContent=p.name||'Player';
 o.hidden=false}
function doKick(pid){
 if(!amHost||!roster[pid]||pid===myId||countdownT)return;
 const p=roster[pid],ts=firebase.database.ServerValue.TIMESTAMP,up={};
 closePop();
 [p.dk,p.uk].forEach(k=>{if(k)up[k]=ts});
 if(!Object.keys(up).length)up['x'+pid]=ts;
 /* record first, then drop the seat, so the removed client always sees the kick */
 FBdb.ref('rooms/'+code+'/kick').update(up)
  .then(()=>lobRoot.child(pid).remove())
  .then(()=>netNote((p.name||'Player')+' was removed from the room.',0))
  .catch(()=>netNote('Could not remove that player. Try again.',1))}
/* this client was removed by the host */
function onKicked(){
 const rc=code;
 try{localStorage.setItem('csk-kick:'+rc,String(Date.now()+KICK_COOL))}catch(e){}
 const L=LOAD();L.show();
 detachRoom();hideLobby();
 L.hide();
 netNote('You were removed from room '+rc+' by the host. You can rejoin in '+fmtLeft(KICK_COOL)+'.',1)}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

/* ---------- Firebase wiring ---------- */
function writeMe(patch){
 if(!lobRef)return;
 const me=Object.assign({name:myAccount().name,photo:myAccount().photo||'',seat:mySeat,ready:myReady,host:amHost?1:0,dk:devKey(),uk:uidKey(),t:Date.now()},patch||{});
 lobRef.set(me).catch(()=>{})}
function takeSeat(i){
 if(mySeat===i)return;
 const taken=Object.values(roster).some(p=>p.seat===i);
 if(taken)return;
 mySeat=i;myReady=0;writeMe({seat:i,ready:0});render()}
function toggleReady(){
 if(mySeat<0)return;
 myReady=myReady?0:1;writeMe({ready:myReady});render()}

function attachRoom(roomCode,isHost){
 code=roomCode;amHost=!!isHost;
 try{window.CSKRtc&&CSKRtc.start(roomCode,!!isHost)}catch(e){}   /* open the direct link while everyone waits in the lobby */
 lobRoot=FBdb.ref('rooms/'+code+'/lobby');
 lobRef=lobRoot.child(myId);
 startRef=FBdb.ref('rooms/'+code+'/lstart');
 try{lobRef.onDisconnect().remove()}catch(e){}
 lobRoot.on('value',s=>{
  const v=s.val()||{};
  if(!amHost&&!s.exists()&&Object.keys(roster).length){
   /* the room vanished from under us (host left/closed it) while we still had a roster: bounce home */
   const L=LOAD();L.show();detachRoom();hideLobby();L.hide();netNote('The host left the room.',1);return}
  roster={};for(const k in v)roster[k]=v[k];
  render()},()=>{});
 if(!amHost){
  kickRef=FBdb.ref('rooms/'+code+'/kick');
  kickRef.on('value',s=>{
   const v=s.val();if(!v||enteredMatch||!code)return;
   const mine=[devKey(),uidKey()].filter(Boolean);
   /* only fresh records count: older than the cooldown means a previous, already-served removal */
   if(mine.some(k=>v[k]&&serverNow()-(+v[k])<KICK_COOL))onKicked()},()=>{})}
 clearInterval(nameT);
 nameT=setInterval(()=>{   /* callsign can finish loading after we sat down: refresh our seat name, never re-add a removed seat */
  if(lobRef&&roster[myId]&&roster[myId].name!==callsign())writeMe({})},1200);
 startRef.on('value',s=>{
  const v=s.val();
  if(v&&!countdownT&&!enteredMatch)beginCountdown()},()=>{});
 mySeat=amHost?0:-1;myReady=0;
 writeMe({});
 showLobby()}

function detachRoom(){
 try{window.CSKRtc&&CSKRtc.stop()}catch(e){}
 try{if(lobRoot)lobRoot.off()}catch(e){}
 try{if(startRef)startRef.off()}catch(e){}
 try{if(kickRef)kickRef.off()}catch(e){}
 clearInterval(nameT);nameT=null;closePop();
 if(amHost){
  /* the host leaving closes the room for everyone, same as the host disconnecting mid-match elsewhere */
  try{FBdb.ref('rooms/'+code).remove()}catch(e){}
 }else{
  try{if(lobRef)lobRef.remove()}catch(e){}
 }
 lobRoot=lobRef=startRef=kickRef=null;roster={};mySeat=-1;myReady=0;amHost=0;code='';
 clearInterval(countdownT);countdownT=null;
 const cnt=$('lob-count');if(cnt)cnt.hidden=true}

/* ---------- show / hide ---------- */
function showLobby(){
 const lob=$('lob');if(!lob)return;
 lob.hidden=false;
 const codeEl=$('lob-code');if(codeEl)codeEl.querySelector('b').textContent=code;
 render()}
function hideLobby(){const lob=$('lob');if(lob)lob.hidden=true}

/* ---------- countdown + handoff to the real match ---------- */
function beginCountdown(){
 setTimeout(render,0);   /* drops the host's kick buttons: nobody can be removed once the countdown is running */
 const cnt=$('lob-count'),n=$('lob-count-n');
 if(!cnt||!n)return;
 cnt.hidden=false;
 const fh=$('lob-count-fs');if(fh)fh.hidden=!!(window.CSKFullscreen&&CSKFullscreen.isFs());
 let left=15;n.textContent=left;closePop();
 clearInterval(countdownT);
 countdownT=setInterval(()=>{
  left--;
  if(left<=0){clearInterval(countdownT);countdownT=null;enterMatch();return}
  n.textContent=left},1000)}
function enterMatch(){
 if(enteredMatch)return;enteredMatch=1;
 const L=LOAD(),host=amHost,rc=code;
 L.show();
 try{window.CSKFullscreen&&CSKFullscreen.enter()}catch(e){}   /* works if the browser still counts a recent tap; READY/START already asked */
 try{if(lobRoot)lobRoot.off()}catch(e){}
 try{if(startRef)startRef.off()}catch(e){}
 try{if(kickRef)kickRef.off()}catch(e){}
 clearInterval(nameT);nameT=null;
 try{if(lobRef)lobRef.remove()}catch(e){}
 /* give the loader one frame to paint before the match boots, then reveal the match underneath it */
 setTimeout(()=>{
  hideLobby();
  const cnt=$('lob-count');if(cnt)cnt.hidden=true;
  try{start(host?'host':'join',rc)}finally{L.hide()}},120)}

/* ---------- login gate + wiring the home buttons ---------- */
function requireLogin(){
 if(window.ARA&&ARA.hint())return true;
 netNote('Sign in with Google to create a room.',1);
 return false}

function goOnlineLobby(mode){
 audioInit();
 if(!fbInit()){netNote('Could not load Firebase. Check your internet connection and reload.',1);return}
 const L=LOAD();
 const busyUI=b=>{$('host').disabled=b;$('join').disabled=b};
 const fail=e=>{busyUI(0);L.hide({fast:1});netNote(typeof e=='string'?e:netErr(e),1)};
 if(mode=='host'){
  if(!requireLogin())return;
  L.show();busyUI(1);$('msg').textContent='';
  waitUp(9000).then(()=>withTimeout(createRoomCode(),9000)).then(c=>{
   busyUI(0);enteredMatch=0;attachRoom(c,true);L.hide();try{const rn=String(window.CSK_ROOM_NAME||'').trim().slice(0,20);window.CSK_ROOM_NAME='';if(rn)FBdb.ref('rooms/'+c+'/name').set(rn).catch(()=>{})}catch(e){}
  }).catch(fail);
  return}
 const rc=cleanRoom($('rm').value);
 if(!ROOM_RE.test(rc)){netNote(rc.length<5?'Enter the 5-character room code from the host.':'Room codes never contain I, L, O, 0 or 1 \u2014 check the code and try again.',1);$('rm').focus();return}
 L.show();busyUI(1);
 waitUp(9000).then(()=>withTimeout(checkRoom(rc),9000)).then(async r=>{
  if(r=='none')return fail('Room '+rc+' was not found. Check the code, or ask the host to create the room first.');
  if(r=='full')return fail('Room '+rc+' is full ('+MAXH+' players).');
  /* removed by this room's host in the last 2 minutes? */
  const left=await withTimeout(kickLeft(rc),9000);
  if(left>0)return fail('The host removed you from room '+rc+'. You can rejoin in '+fmtLeft(left)+'.');
  busyUI(0);enteredMatch=0;attachRoom(rc,false);L.hide()
 }).catch(fail)}

function leaveLobby(){
 const L=LOAD();L.show();
 detachRoom();hideLobby();
 $('msg').textContent='';
 L.hide()}

function syncHostLock(){
 const h=$('host'),acc=$('acc');if(!h||!acc)return;
 const signed=acc.dataset.s==='in';
 h.classList.toggle('lob-locked-btn',!signed);
 h.title=signed?'':'Sign in with Google to create a room'}

function wire(){
 const h=$('host'),j=$('join');
 if(h)h.onclick=()=>goOnlineLobby('host');
 if(j)j.onclick=()=>goOnlineLobby('join');
 const acc=$('acc');
 if(acc&&window.MutationObserver){
  new MutationObserver(syncHostLock).observe(acc,{attributes:true,attributeFilter:['data-s']});
  syncHostLock()}
 /* Play Solo: game.js handles the click itself; we only put the loading screen over the switch (capture phase = runs first) */
 const so=$('solo');if(so)so.addEventListener('click',()=>{const L=LOAD();L.show();setTimeout(()=>L.hide(),60)},true);
 const pk=$('lob-pop-kick');if(pk)pk.onclick=e=>{e.stopPropagation();doKick(popPid)};
 document.addEventListener('pointerdown',e=>{if(popPid&&!e.target.closest('#lob-pop,.lob-pick'))closePop()},true);
 document.addEventListener('keydown',e=>{if(e.key=='Escape'&&popPid)closePop()});
 const lv=$('lob-leave');if(lv)lv.onclick=()=>{sfx&&sfx('ui',{j:0});leaveLobby()};
 const rb=$('lob-ready');if(rb)rb.onclick=()=>{sfx&&sfx('ui',{j:0});toggleReady()};
 const sb=$('lob-start');if(sb)sb.onclick=()=>{if(sb.disabled)return;sfx&&sfx('ui',{j:0});if(startRef)startRef.set(Date.now()).catch(()=>{})};
 const ce=$('lob-code');if(ce)ce.onclick=()=>{
  const u=/^https?:/.test(location.protocol)?location.origin+location.pathname+'?room='+code:'',t=u||code;
  try{navigator.clipboard.writeText(t)}catch(e){}};
}
if(document.readyState=='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
})();
