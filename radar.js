/* ============ RADAR: nearby-player discovery ============
 Replaces typing a 5-letter room code with a "scan for nearby players" screen.
 Purely additive — loaded after lobby.js. Does not touch gameplay, netcode, or the
 wire protocol. The only thing this file changes is HOW a room code reaches the
 existing attachRoom(code, isHost) / checkRoom(code) functions already in lobby.js.

 What actually makes the ping low: once two devices are on the SAME WIFI, rtc.js
 opens a direct WebRTC data channel between them. When both devices sit behind the
 same router, ICE finds a LOCAL ("host") candidate and packets never leave the
 router — typically 1-10 ms. Firebase is never in that path; it is only used here
 as a tiny, short-lived "I exist, here is my room code" beacon so two phones on the
 same WiFi can find each other without either typing a code or any server-side game
 logic running anywhere. Once the match starts, Firebase's only remaining job
 (besides this beacon, which is gone by then) is saving stats — exactly as before.

 Firebase layout (new node only):
  radar/<deviceId>  { name, photo, code, host, seats, cap, t }   t = server timestamp,
                     refreshed every BEACON_MS while the host's radar/lobby screen is open.
                     Removed onDisconnect and when hosting stops. Clients treat any beacon
                     older than STALE_MS as gone (handles crashed tabs with no onDisconnect fire).

 Flow:
  HOST:  tap "Create Room" -> same createRoomCode() as before -> starts broadcasting a beacon
         under radar/<deviceId> while the waiting lobby is open. No code is shown to type;
         players nearby just see the host appear on their radar.
  JOIN:  tap "Scan Nearby" -> opens a radar sweep UI -> reads radar/ -> lists any beacon
         younger than STALE_MS as a blip, with the host's name/photo and a live "seats open"
         count. Tapping a blip runs the same checkRoom()+attachRoom(code,false) path the
         typed-code flow already used. A continuous sweep keeps listening for 60s and then
         idles (tap again to re-scan) rather than running forever in the background.

 This file does not disable the typed room-code box — it sits next to it as an additional,
 default-first way in. Nothing about Create Room, Join Room by code, or the match itself
 changes. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const BEACON_MS=4000;      /* how often the host refreshes its beacon while broadcasting */
const STALE_MS=12000;      /* a beacon not refreshed in this long is treated as gone */
const SCAN_MS=60000;       /* one scan "sweep" runs this long, per the 1-minute scan window */
const JOIN_WINDOW_MS=60000;/* how long a freshly-created room keeps accepting radar joins before the host must restart broadcasting (soft UX cue only, not a hard join cutoff) */

let myBeaconRef=null,myBeaconT=null,scanRef=null,scanT=null,scanEndT=null,hostSince=0,scanning=0,beaconing=0,blips={};

/* ---------- identity reuse (same persistent device id lobby.js already keeps) ---------- */
function devId(){
 let k='';try{k=localStorage.getItem('csk-did')||''}catch(e){}
 if(!k){k='d'+Math.random().toString(36).slice(2,10)+Date.now().toString(36);try{localStorage.setItem('csk-did',k)}catch(e){}}
 return k}

function meInfo(){
 const a=(window.ARA&&ARA.account&&ARA.account())||null;
 let n='';try{n=(window.ARA&&ARA.callsign&&ARA.callsign())||''}catch(e){}
 if(!n)n=(($('nm')&&$('nm').value)||'Player').trim().slice(0,12)||'Player';
 return{name:n,photo:(a&&a.photo)||''}}

/* ---------- host side: broadcast a beacon while the waiting lobby is open ---------- */
function startBeacon(code){
 if(!FBdb||beaconing)return;
 beaconing=1;hostSince=Date.now();
 const id=devId(),ref=FBdb.ref('radar/'+id);
 myBeaconRef=ref;
 const write=()=>{
  const info=meInfo();
  ref.set({name:info.name,photo:info.photo,code:code,host:1,
   seats:(window.CSKLobbyOpenSeats?CSKLobbyOpenSeats():0),cap:8,
   t:firebase.database.ServerValue.TIMESTAMP,opened:hostSince}).catch(()=>{})};
 try{ref.onDisconnect().remove()}catch(e){}
 write();
 myBeaconT=setInterval(write,BEACON_MS)}
function stopBeacon(){
 beaconing=0;
 if(myBeaconT){clearInterval(myBeaconT);myBeaconT=null}
 if(myBeaconRef){try{myBeaconRef.onDisconnect().cancel()}catch(e){}try{myBeaconRef.remove()}catch(e){}myBeaconRef=null}}
window.CSKRadarHost={start:startBeacon,stop:stopBeacon};

/* ---------- scanning side ---------- */
function openRadarUI(){const el=$('radar');if(el)el.hidden=false;renderBlips()}
function closeRadarUI(){const el=$('radar');if(el)el.hidden=true}

function setSweep(on){
 const dish=$('radar-dish');if(dish)dish.classList.toggle('sweeping',!!on);
 const st=$('radar-status');if(st)st.textContent=on?'Scanning for nearby players\u2026':'Scan paused \u2014 tap to search again';
 const btn=$('radar-rescan');if(btn)btn.hidden=!!on}

function startScan(){
 if(!FBdb){netNote&&netNote('Could not load Firebase. Check your internet connection and reload.',1);return}
 if(scanning)return;
 scanning=1;blips={};renderBlips();setSweep(1);
 scanRef=FBdb.ref('radar');
 const upd=s=>{
  const v=s.val()||{};const now=Date.now();const next={};
  Object.keys(v).forEach(k=>{
   const b=v[k];if(!b||!b.host)return;
   const t=typeof b.t=='number'?b.t:now;      /* ServerValue.TIMESTAMP resolves to a number once written */
   if(now-t>STALE_MS)return;                  /* stale beacon: treat as gone even if remove() never fired */
   next[k]=b});
  blips=next;renderBlips()};
 scanRef.on('value',upd,()=>{});
 scanT=upd;
 clearTimeout(scanEndT);
 scanEndT=setTimeout(pauseScan,SCAN_MS)}
function pauseScan(){
 scanning=0;
 if(scanRef&&scanT){try{scanRef.off('value',scanT)}catch(e){}}
 scanRef=null;scanT=null;setSweep(0)}
function stopScan(){clearTimeout(scanEndT);pauseScan();blips={}}

function fmtAge(openedAt){
 if(!openedAt)return'';
 const left=Math.max(0,JOIN_WINDOW_MS-(Date.now()-openedAt));
 if(left<=0)return'';
 return Math.ceil(left/1000)+'s'}

function renderBlips(){
 const wrap=$('radar-list');if(!wrap)return;
 const keys=Object.keys(blips);
 const empty=$('radar-empty');
 if(empty)empty.hidden=keys.length>0;
 wrap.innerHTML='';
 keys.forEach(k=>{
  const b=blips[k];
  const seatsLeft=Math.max(0,(b.cap||8)-(b.seats||0));
  const row=document.createElement('button');
  row.type='button';row.className='radar-blip';
  row.disabled=seatsLeft<=0;
  const left=fmtAge(b.opened);
  row.innerHTML=
   '<i class="radar-blip-dot"></i>'+
   '<img class="radar-blip-av" src="'+(b.photo||'')+'" alt="" onerror="this.style.display=\'none\'">'+
   '<span class="radar-blip-txt"><b>'+esc(b.name||'Player')+'</b><small>'+(seatsLeft>0?seatsLeft+' seat'+(seatsLeft==1?'':'s')+' open':'Room full')+(left?' \u00b7 '+left+' left':'')+'</small></span>'+
   '<span class="radar-blip-go">'+(seatsLeft>0?'JOIN':'FULL')+'</span>';
  row.onclick=()=>joinBlip(b);
  wrap.appendChild(row)})}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}

async function joinBlip(b){
 if(!b||!b.code)return;
 const rc=b.code;
 stopScan();closeRadarUI();
 const L=(window.CSKLoad)||{show(){},hide(){},around:f=>f()};
 L.show();
 try{
  const left=await withTimeout(kickLeftSafe(rc),9000);
  if(left>0){L.hide({fast:1});netNote&&netNote('The host removed you from this room recently. Try again shortly.',1);return}
  const r=await withTimeout(checkRoom(rc),9000);
  if(r=='none'){L.hide({fast:1});netNote&&netNote('That room just closed. Scan again.',1);return}
  if(r=='full'){L.hide({fast:1});netNote&&netNote('That room is now full.',1);return}
  if(window.CSKAttachRoom)window.CSKAttachRoom(rc,false);
  L.hide()
 }catch(e){L.hide({fast:1});netNote&&netNote(netErr?netErr(e):'Could not join that room.',1)}}
function kickLeftSafe(rc){try{return window.CSKKickLeft?window.CSKKickLeft(rc):Promise.resolve(0)}catch(e){return Promise.resolve(0)}}

/* ---------- wiring ---------- */
function wire(){
 const sc=$('scan');
 if(sc)sc.onclick=()=>{audioInit&&audioInit();openRadarUI();startScan()};
 const close=$('radar-close');
 if(close)close.onclick=()=>{stopScan();closeRadarUI()};
 const re=$('radar-rescan');
 if(re)re.onclick=()=>startScan();
 addEventListener('beforeunload',stopBeacon)}
if(document.readyState=='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
})();
