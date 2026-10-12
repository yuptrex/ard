/* CSuperKnights relay server - a tiny in-region WebSocket hub (host <-> clients), like a game server's network layer.
   It does NOT run the game: the host's browser stays authoritative. It only forwards packets, so every hop is a
   short in-country hop instead of a round trip to Firebase in Singapore.
   Run:  copy relay-package.json -> package.json, then npm i && node relay-server.js   (PORT env var, default 8080)
   Env:  ALLOWED_ORIGINS=https://yourgame.com,https://yourgame.web.app   (optional, comma separated) */
const http=require('http');
const {WebSocketServer}=require('ws');
const PORT=+process.env.PORT||8080,MAX_CLIENTS=7,MAX_MSG=64*1024;
const ORIGINS=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
const ROOM_RE=/^[A-HJ-KM-NP-Z2-9]{5}$/,ID_RE=/^[A-Za-z0-9_-]{1,24}$/;
const rooms=new Map();   // code -> {host:ws|null, clients:Map(id->ws), wd:string|null}

const srv=http.createServer((q,r)=>{
 if(q.url==='/health'){r.writeHead(200,{'content-type':'text/plain'});r.end('ok '+rooms.size+' rooms');return}
 r.writeHead(404);r.end()});
const wss=new WebSocketServer({server:srv,perMessageDeflate:false,maxPayload:MAX_MSG,
 verifyClient:({origin},cb)=>{if(ORIGINS.length&&origin&&!ORIGINS.includes(origin))cb(false,403,'origin');else cb(true)}});

function drop(room,code){if(rooms.get(code)===room)rooms.delete(code)}
wss.on('connection',(ws,req)=>{
 try{req.socket.setNoDelay(true)}catch(e){}
 const u=new URL(req.url,'http://x'),code=(u.searchParams.get('room')||'').toUpperCase(),role=u.searchParams.get('role'),id=u.searchParams.get('id')||'';
 if(!ROOM_RE.test(code)||(role!=='host'&&role!=='client')||(role==='client'&&!ID_RE.test(id))){ws.close(4000,'bad request');return}
 ws.isAlive=true;ws.on('pong',()=>{ws.isAlive=true});
 let room=rooms.get(code);
 if(role==='host'){
  if(room&&room.host&&room.host.readyState===1)try{room.host.close(4001,'replaced')}catch(e){}
  if(!room){room={host:null,clients:new Map(),wd:null};rooms.set(code,room)}
  room.host=ws;
  ws.on('message',(d,bin)=>{
   const s=bin?d:d.toString();
   if(typeof s==='string'&&s.startsWith('{"t":"wd"'))room.wd=s;     // remember world data for late joiners
   for(const c of room.clients.values())if(c.readyState===1)c.send(s)});
  ws.on('close',()=>{if(room.host!==ws)return;room.host=null;for(const c of room.clients.values())try{c.close(4002,'host left')}catch(e){}drop(room,code)});
 }else{
  if(!room||!room.host){ws.close(4003,'no such room');return}
  if(room.clients.size>=MAX_CLIENTS&&!room.clients.has(id)){ws.close(4004,'full');return}
  const old=room.clients.get(id);if(old&&old!==ws)try{old.close(4001,'replaced')}catch(e){}
  room.clients.set(id,ws);
  if(room.wd)ws.send(room.wd);
  ws.on('message',(d,bin)=>{const h=room.host;if(h&&h.readyState===1)h.send(bin?d:d.toString())});
  ws.on('close',()=>{if(room.clients.get(id)===ws)room.clients.delete(id)});
 }
 ws.on('error',()=>{});
});
/* keepalive packet to clients (so they can tell the link is alive) + dead-socket sweep */
setInterval(()=>{for(const room of rooms.values())for(const c of room.clients.values())if(c.readyState===1)c.send('{"t":"ka"}')},500);
setInterval(()=>{for(const ws of wss.clients){if(ws.isAlive===false){ws.terminate();continue}ws.isAlive=false;try{ws.ping()}catch(e){}}},20000);
srv.listen(PORT,()=>console.log('CSK relay listening on :'+PORT));
