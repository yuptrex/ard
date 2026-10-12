/* ============ rtc.js - direct peer-to-peer fast path (WebRTC data channels) ============
 Why: the original netcode relays every packet through Firebase Realtime Database
      (client -> Firebase -> host -> Firebase -> client). Each hop is a round trip to the
      database region, which is where 200-300 ms of ping comes from.
 What: players now talk to the host DIRECTLY over WebRTC data channels (UDP-style, no relay).
      Firebase is only used for the handshake (signaling) and as an automatic fallback, so a
      player whose network blocks peer-to-peer still plays exactly as before.

 Channels per client <-> host:
   'u'  unordered, maxRetransmits:0   host -> client snapshots ('st')  and  client -> host inputs ('in')
        (lossy on purpose: an old snapshot or input is worthless, the netcode already tolerates loss)
   'r'  ordered, reliable             world data ('wd') and 'bye'

 Tier 2 (rtc.js WsRelay): when peer-to-peer is impossible (strict mobile NAT) traffic goes through an in-region
   WebSocket relay (relay-server.js) instead of Firebase. Set window.CSK_RELAY_URL='wss://...' (or open the page with ?relay=wss://...).
   Tier order per client: direct P2P -> relay server -> Firebase.

 Signaling (Firebase):  rooms/<CODE>/rtc/<clientId>/{o,oc,a,ac}
   o  client's offer      oc  client's ICE candidates
   a  host's answer       ac  host's ICE candidates
 Your Firebase rules must allow read/write on rooms/<CODE>/rtc (see HANDOVER.md).

 Optional TURN server (helps players behind strict mobile / carrier NAT) - define BEFORE this file loads:
   window.CSK_ICE_SERVERS=[{urls:'stun:stun.l.google.com:19302'},
                           {urls:'turn:YOUR.TURN.HOST:443?transport=tcp',username:'...',credential:'...'}];
*/
(function(){
'use strict';
const RTCP=window.RTCPeerConnection||window.webkitRTCPeerConnection;
const ICE=(Array.isArray(window.CSK_ICE_SERVERS)&&window.CSK_ICE_SERVERS.length)?window.CSK_ICE_SERVERS:
 [{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302','stun:stun.cloudflare.com:3478']}];
const PCFG=()=>({iceServers:ICE,bundlePolicy:'max-bundle',iceCandidatePoolSize:2});
const HEALTH_MS=1500;          /* client counts the direct link as healthy if the host spoke within this window */
const BUF_MAX=64e3;            /* drop (never queue) lossy packets when the send buffer backs up: queued = late = lag */
const now=()=>performance.now();
const jp=s=>{try{return JSON.parse(s)}catch(e){return null}};
const warned={};
const warn=(k,e)=>{if(warned[k])return;warned[k]=1;try{console.warn('[rtc] '+k+' - falling back to Firebase relay:',e&&(e.code||e.message)||e)}catch(x){}};

class Session{
 constructor(code,isHost){
  this.code=code;this.host=!!isHost;this.onmsg=null;this.onpeer=null;this.dead=0;
  this.up=0;this.lastRx=0;this.hp={};this.tries=0;this.pc=null;this.ch={};this.oid='';this.rdy=0;this.q=[];
  this.rt=0;this.dt=0;this.listen=[];this.ref=null;
  let db=null;try{db=fbInit()}catch(e){}
  if(!RTCP||!db){this.dead=1;return}
  this.root=db.ref('rooms/'+code+'/rtc');
  if(this.host){this.initHost();this.ka=setInterval(()=>this.hsend('r','{"t":"ka"}'),500)}else this.connect()}

 /* ---------- shared ---------- */
 bind(ch,H){
  ch.onopen=()=>this.state(H);ch.onclose=()=>this.state(H);ch.onerror=()=>{};
  ch.onmessage=e=>{const t=now();if(H)H.lastRx=t;this.lastRx=t;if(typeof e.data!=='string')return;
   const m=jp(e.data);if(m&&m.t!=='ka'&&this.onmsg)this.onmsg(m)}}
 state(H){
  const C=H?H.ch:this.ch,up=!!(C.r&&C.u&&C.r.readyState==='open'&&C.u.readyState==='open');
  if(H){if(up!==!!H.up){H.up=up?1:0;H.lastRx=now();if(this.onpeer)this.onpeer(H.id,up)}}
  else if(up!==!!this.up){this.up=up?1:0;this.lastRx=now();if(up)this.tries=0;if(this.onpeer)this.onpeer(typeof myId!=='undefined'?myId:'',up)}}
 close(){
  this.dead=1;clearTimeout(this.rt);clearTimeout(this.dt);clearInterval(this.ka);
  try{this.root&&this.root.off()}catch(e){}
  this.teardownLocal();
  for(const id in this.hp){const H=this.hp[id];clearTimeout(H.dt);try{H.refs.forEach(r=>r.off())}catch(e){}this.closePeer(H)}
  this.hp={}}

 /* ---------- HOST ---------- */
 initHost(){this.root.on('child_added',s=>this.hostPeer(s.key),e=>warn('signaling',e))}
 hostPeer(id){
  if(this.dead||this.hp[id])return;
  const ref=this.root.child(id),H={id,pc:null,oid:'',rdy:0,q:[],early:{},ch:{},up:0,lastRx:0,dt:0,refs:[ref.child('o'),ref.child('oc')]};
  this.hp[id]=H;
  ref.child('o').on('value',s=>{const o=jp(s.val());if(!o||!o.sdp||o.oid===H.oid)return;this.hostAnswer(H,o)},e=>warn('signaling',e));
  ref.child('oc').on('child_added',s=>{const c=jp(s.val());if(!c||!c.c)return;
   if(c.oid===H.oid)this.addCand(H,c.c);
   else if(+c.oid>+H.oid)(H.early[c.oid]||(H.early[c.oid]=[])).push(c.c)},e=>warn('signaling',e))}
 addCand(H,c){if(H.rdy&&H.pc)H.pc.addIceCandidate(c).catch(()=>{});else H.q.push(c)}
 closePeer(H){
  const was=H.up,pc=H.pc;H.pc=null;H.up=0;H.rdy=0;H.q=[];H.ch={};
  try{pc&&pc.close()}catch(e){}
  if(was&&this.onpeer)this.onpeer(H.id,false)}
 async hostAnswer(H,o){
  try{
   this.closePeer(H);clearTimeout(H.dt);
   const oid=H.oid=o.oid,pc=new RTCP(PCFG());H.pc=pc;
   pc.onicecandidate=e=>{if(e.candidate&&H.pc===pc)this.root.child(H.id+'/ac').push(JSON.stringify({oid,c:e.candidate.toJSON()})).catch(()=>{})};
   pc.ondatachannel=e=>{if(H.pc!==pc)return;H.ch[e.channel.label]=e.channel;this.bind(e.channel,H);this.state(H)};
   pc.onconnectionstatechange=()=>{if(H.pc!==pc)return;const s=pc.connectionState;
    if(s==='failed'||s==='closed')this.closePeer(H);
    else if(s==='disconnected'){clearTimeout(H.dt);H.dt=setTimeout(()=>{if(H.pc===pc&&pc.connectionState!=='connected')this.closePeer(H)},4000)}};
   await pc.setRemoteDescription({type:'offer',sdp:o.sdp});
   if(H.pc!==pc)return;
   H.rdy=1;const pend=H.q.concat(H.early[oid]||[]);H.q=[];for(const k in H.early)if(+k<=+oid)delete H.early[k];
   for(const c of pend)pc.addIceCandidate(c).catch(()=>{});
   const a=await pc.createAnswer();await pc.setLocalDescription(a);
   if(H.pc!==pc)return;
   await this.root.child(H.id+'/a').set(JSON.stringify({oid,sdp:pc.localDescription.sdp}))}
  catch(e){warn('host handshake',e)}}
 peersUp(){let n=0;for(const id in this.hp)if(this.hp[id].up)n++;return n}
 /* host -> every connected client. Returns how many peers it was handed to. */
 hsend(label,s){
  let n=0;
  for(const id in this.hp){const H=this.hp[id];if(!H.up)continue;const c=H.ch[label];
   if(!c||c.readyState!=='open')continue;
   if(label==='u'&&c.bufferedAmount>BUF_MAX)continue;
   try{c.send(s);n++}catch(e){}}
  return n}

 /* ---------- CLIENT ---------- */
 teardownLocal(){
  for(const r of this.listen)try{r.off()}catch(e){}
  this.listen=[];this.rdy=0;this.q=[];
  const pc=this.pc;this.pc=null;this.ch={};this.up=0;
  try{pc&&pc.close()}catch(e){}}
 lost(){
  this.up=0;clearTimeout(this.rt);
  if(!this.dead&&this.tries<4)this.rt=setTimeout(()=>this.connect(),800)}
 async connect(){
  if(this.dead)return;
  this.teardownLocal();this.tries++;
  const id=typeof myId!=='undefined'?myId:'x',oid=String(Date.now()),pc=new RTCP(PCFG()),ref=this.root.child(id);
  this.pc=pc;this.oid=oid;this.ref=ref;
  const r=pc.createDataChannel('r',{ordered:true}),u=pc.createDataChannel('u',{ordered:false,maxRetransmits:0});
  this.ch={r,u};this.bind(r,null);this.bind(u,null);
  pc.onicecandidate=e=>{if(e.candidate&&this.pc===pc)ref.child('oc').push(JSON.stringify({oid,c:e.candidate.toJSON()})).catch(()=>{})};
  pc.onconnectionstatechange=()=>{if(this.pc!==pc)return;const s=pc.connectionState;
   if(s==='failed'||s==='closed')this.lost();
   else if(s==='disconnected'){clearTimeout(this.dt);this.dt=setTimeout(()=>{if(this.pc===pc&&pc.connectionState!=='connected')this.lost()},4000)}};
  try{
   await ref.remove();
   if(this.pc!==pc||this.dead)return;
   try{ref.onDisconnect().remove()}catch(e){}
   const la=ref.child('a'),lc=ref.child('ac');this.listen=[la,lc];
   la.on('value',s=>{const a=jp(s.val());if(!a||a.oid!==oid||this.rdy||this.pc!==pc||pc.remoteDescription)return;
    pc.setRemoteDescription({type:'answer',sdp:a.sdp}).then(()=>{
     if(this.pc!==pc)return;this.rdy=1;const q=this.q;this.q=[];for(const c of q)pc.addIceCandidate(c).catch(()=>{})}).catch(e=>warn('client handshake',e))},e=>warn('signaling',e));
   lc.on('child_added',s=>{const c=jp(s.val());if(!c||c.oid!==oid||!c.c||this.pc!==pc)return;
    if(this.rdy)pc.addIceCandidate(c.c).catch(()=>{});else this.q.push(c.c)},e=>warn('signaling',e));
   const off=await pc.createOffer();await pc.setLocalDescription(off);
   if(this.pc!==pc)return;
   await ref.child('o').set(JSON.stringify({oid,sdp:pc.localDescription.sdp}))}
  catch(e){warn('client handshake',e)}
  clearTimeout(this.rt);
  this.rt=setTimeout(()=>{if(!this.up&&!this.dead&&this.tries<4)this.connect()},8000)}
 healthy(){return !!this.up&&now()-this.lastRx<HEALTH_MS}
 /* client -> host. Returns true if the packet was handled (sent, or deliberately dropped because congested). */
 csend(label,s){
  const c=this.ch[label];if(!c||c.readyState!=='open')return false;
  if(label==='u'&&c.bufferedAmount>BUF_MAX)return true;
  try{c.send(s);return true}catch(e){return false}}}

/* ---------- tier 2: in-region WebSocket relay ---------- */
class WsRelay{
 constructor(code,isHost){
  this.code=code;this.host=!!isHost;this.onmsg=null;this.onpeer=null;this.ws=null;this.up=0;this.lastRx=0;this.tries=0;this.dead=0;this.rt=0;
  let url=window.CSK_RELAY_URL||'';try{url=new URLSearchParams(location.search).get('relay')||url}catch(e){}
  this.url=String(url||'').replace(/\/+$/,'');
  if(!this.url||typeof WebSocket==='undefined'){this.dead=1;return}
  this.open()}
 open(){
  if(this.dead)return;
  const id=typeof myId!=='undefined'?myId:'x';
  let ws;try{ws=new WebSocket(this.url+'/?room='+this.code+'&role='+(this.host?'host':'client')+'&id='+encodeURIComponent(id))}catch(e){warn('relay',e);this.dead=1;return}
  this.ws=ws;
  ws.onopen=()=>{if(this.ws!==ws)return;this.up=1;this.lastRx=now();this.tries=0;if(this.onpeer)this.onpeer(true)};
  ws.onmessage=e=>{this.lastRx=now();if(typeof e.data!=='string')return;const m=jp(e.data);if(m&&m.t!=='ka'&&this.onmsg)this.onmsg(m)};
  ws.onerror=()=>{};
  ws.onclose=()=>{if(this.ws!==ws)return;this.up=0;this.ws=null;if(this.onpeer)this.onpeer(false);
   if(!this.dead&&this.tries<12){this.tries++;this.rt=setTimeout(()=>this.open(),Math.min(4000,400*this.tries))}}}
 healthy(){return !!this.up&&now()-this.lastRx<HEALTH_MS}     /* the server sends a keepalive to clients every 500 ms */
 send(s){const w=this.ws;if(!w||w.readyState!==1)return false;if(w.bufferedAmount>BUF_MAX)return true;try{w.send(s);return true}catch(e){return false}}
 close(){this.dead=1;clearTimeout(this.rt);const w=this.ws;this.ws=null;this.up=0;try{w&&w.close()}catch(e){}}}

/* one session per room, started in the waiting lobby so the link is already up when the match begins */
const CSKRtc={
 session:null,relay:null,
 start(code,isHost){this.stop();
  try{this.session=new Session(code,isHost)}catch(e){warn('start',e);this.session=null}
  try{this.relay=new WsRelay(code,isHost)}catch(e){warn('relay',e);this.relay=null}
  return this.session},
 take(code,isHost){const s=this.session;if(s&&s.code===code&&s.host===!!isHost)return s;return this.start(code,isHost)},   /* a dead session (no WebRTC here) is still the session: never rebuild it, that would drop the relay link */
 takeRelay(code,isHost){const r=this.relay;return(r&&r.code===code&&r.host===!!isHost)?r:null},
 stop(){const s=this.session,r=this.relay;this.session=this.relay=null;if(s)try{s.close()}catch(e){}if(r)try{r.close()}catch(e){}}};
window.CSKRtc=CSKRtc;

/* ---------- drop-in replacement for FirebaseNet: same interface, direct link first, Firebase as fallback ---------- */
class HybridNet{
 constructor(code,isHost){
  this.host=!!isHost;this.code=code;this.onmsg=null;this.lastFbIn=-1e9;this.lastWsIn=-1e9;this.wsSeen={};this._rs=0;this.pendGone=0;
  this.fb=new FirebaseNet(code,isHost);
  this.root=this.fb.root;
  this.rtc=CSKRtc.take(code,isHost);
  this.ws=CSKRtc.takeRelay(code,isHost);
  this.fb.onmsg=m=>this.fromFb(m);
  if(this.rtc){
   this.rtc.onmsg=m=>{if(this.onmsg)this.onmsg(m)};
   this.rtc.onpeer=(id,up)=>{if(up)this._rs=1}}      /* new direct peer: push the world data to it again */
  if(this.ws){this.ws.onmsg=m=>this.fromWs(m);this.ws.onpeer=up=>{if(up)this._rs=1}}
  if(!this.host)this.gt=setInterval(()=>{if(this.pendGone&&!(this.t1||this.t2)){this.pendGone=0;if(this.onmsg)this.onmsg({t:'gone'})}},500)}
 get resend(){return(this.fb.resend||this._rs)?1:0}
 set resend(v){this.fb.resend=v;this._rs=v}
 /* tier 1: direct peer-to-peer.  tier 2: relay server.  (host: "is anyone using it right now") */
 get t1(){const r=this.rtc;return !!r&&(this.host?r.peersUp()>0:r.healthy())}
 get wsClients(){const t=performance.now();let n=0;for(const id in this.wsSeen)if(t-this.wsSeen[id]<3000)n++;return n}
 get t2(){const w=this.ws;return !!w&&!!w.up&&(this.host?this.wsClients>0:w.healthy())}
 get fbRecent(){return performance.now()-this.lastFbIn<3000}
 get noFast(){return(!this.rtc||this.rtc.dead)&&(!this.ws||this.ws.dead)}
 get link(){const l=this.fb.link;return(l===false&&!this.host&&(this.t1||this.t2))?true:l}
 /* true when a fast tier carries the traffic: game.js uses it to raise send rates / trim buffering */
 get fast(){return this.host?((this.t1||this.t2)&&!this.fbRecent):(this.t1||this.t2)}
 get path(){return this.host?'HOST':this.t1?'P2P':this.t2?'RELAY':'SLOW'}
 /* host snapshot interval: 30 Hz for small rooms on fast tiers, 20 Hz otherwise (protects the host's upload) */
 get snapDt(){if(!(this.host&&this.fast))return .05;const n=(this.rtc?this.rtc.peersUp():0)+this.wsClients;return n<=4?1/30:.05}
 fromFb(m){
  if(this.host){if(m.t==='in')this.lastFbIn=performance.now()}
  else{
   const h=this.t1||this.t2;
   if(h&&(m.t==='st'||m.t==='wd'))return;            /* a faster tier already delivers these */
   if(m.t==='gone'&&h){this.pendGone=1;return}}
  if(this.onmsg)this.onmsg(m)}
 fromWs(m){
  if(this.host){if(m.t==='in'){const t=performance.now();this.lastWsIn=t;if(m.id)this.wsSeen[m.id]=t}}
  else if(this.t1&&(m.t==='st'||m.t==='wd'))return;  /* direct link is healthy: this is a duplicate */
  if(this.onmsg)this.onmsg(m)}
 send(m,str){
  const s=str||JSON.stringify(m),r=this.rtc,w=this.ws;
  if(this.host){
   const t=performance.now();
   if(m.t==='st'){
    if(r)r.hsend('u',s);
    if(w&&w.up&&t-this.lastWsIn<3000)w.send(s);
    if(this.noFast||t-this.lastFbIn<3000)this.fb.send(m,s)}
   else if(m.t==='wd'){if(r)r.hsend('r',s);if(w&&w.up)w.send(s);this.fb.send(m,s)}
   else this.fb.send(m,s)}
  else{
   if(m.t==='in'){
    if(r)r.csend('u',s);                                   /* sent on the direct link whenever it is open (even if shaky) */
    if(this.t1)return;
    if(w&&w.up){w.send(s);if(w.healthy())return}           /* tier 2 */
    this.fb.send(m,s)}                                      /* tier 3 */
   else if(m.t==='bye'){if(r)r.csend('r',s);if(w)w.send(s);this.fb.send(m,s)}
   else this.fb.send(m,s)}}
 close(){clearInterval(this.gt);try{this.fb.close()}catch(e){}CSKRtc.stop()}}
window.CSK_HybridNet=HybridNet;
})();
