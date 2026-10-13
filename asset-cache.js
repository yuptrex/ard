/* ============ LOCAL ASSET CACHE ============
   Downloads every big static image once, keeps it in IndexedDB as a blob, and swaps each <img src>
   to the local copy. First visit: fetched with live byte progress (drives the loading bar).
   Later visits: read straight from IndexedDB, so loading art and every screen show instantly.
   CSKAssets.preload(onProgress(fraction 0..1)) -> Promise.  CSKAssets.url(name) -> local blob URL. */
(function(){
'use strict';
var BUILD='v21';   /* bump when any asset file changes, so old cached copies are dropped */
var ASSETS=['ld-bw.jpg','ld-night.jpg','ld-day.jpg','ld-dusk.jpg','home-art2.jpg','lobby-bg.jpg','login-bg.jpg','victory-bg.png',
 'setup-card.png','setup-btn.png','login-btn-go.png','login-btn-google.png','rm-main.webp','rm-create.webp','rm-join.webp','hero-bg.svg'];
/* Stage 1 (before login): only what the splash + sign-in screen show. Stage 2 (after login): the rest.
   On low-end devices the big screens (victory, lobby, room cards) are not pre-downloaded at all; they load on demand. */
var BOOT=['ld-bw.jpg','login-bg.jpg','login-btn-go.png','login-btn-google.png'],
    LAZY=['victory-bg.png','lobby-bg.jpg','rm-main.webp','rm-create.webp','rm-join.webp'];
function listFor(which){
 var all=ASSETS.slice();
 if(which==='boot')return BOOT.slice();
 if(which==='main')all=all.filter(function(n){return BOOT.indexOf(n)<0});
 if(window.CSK_LOW)all=all.filter(function(n){return LAZY.indexOf(n)<0});
 return all}
var DB='csk-assets',STORE='files',VER=1;
function openDB(){return new Promise(function(res,rej){
 var r=indexedDB.open(DB,VER);
 r.onupgradeneeded=function(){r.result.createObjectStore(STORE)};
 r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)}})}
function idbGet(db,key){return new Promise(function(res){
 var tx=db.transaction(STORE,'readonly').objectStore(STORE).get(key);
 tx.onsuccess=function(){res(tx.result||null)};tx.onerror=function(){res(null)}})}
function idbSet(db,key,blob){return new Promise(function(res){
 var tx=db.transaction(STORE,'readwrite').objectStore(STORE).put(blob,key);
 tx.onsuccess=function(){res(1)};tx.onerror=function(){res(0)}})}
function idbClean(db){try{   /* drop copies saved by older builds */
 var s=db.transaction(STORE,'readwrite').objectStore(STORE),q=s.openCursor();
 q.onsuccess=function(){var c=q.result;if(!c)return;if(String(c.key).indexOf(BUILD+':')!==0)c.delete();c.continue()}}catch(e){}}
var URLS={};
function applySrc(name,url){
 URLS[name]=url;
 var els=document.querySelectorAll('img[src="'+name+'"]');
 for(var i=0;i<els.length;i++)els[i].src=url}
/* fetch with byte progress; falls back to a plain blob() when streaming isn't available */
function fetchBlob(name,onFrac){
 return fetch(name).then(function(r){
  if(!r.ok)throw new Error(r.status);
  var len=+r.headers.get('content-length')||0,type=r.headers.get('content-type')||'';
  if(!r.body||!r.body.getReader||!len)return r.blob().then(function(b){onFrac(1);return b});
  var rd=r.body.getReader(),parts=[],got=0;
  return(function pump(){return rd.read().then(function(x){
   if(x.done){onFrac(1);return new Blob(parts,{type:type})}
   parts.push(x.value);got+=x.value.length;onFrac(Math.min(.99,got/len));return pump()})})()})}

window.CSKAssets={
 url:function(name){return URLS[name]||''},
 preload:function(onProgress,which){
  var ASSETS=listFor(which),n=ASSETS.length,fr=ASSETS.map(function(){return 0});
  function report(){var s=0;for(var i=0;i<n;i++)s+=fr[i];onProgress&&onProgress(s/n)}
  var dbP;
  try{dbP=openDB()}catch(e){dbP=Promise.reject(e)}
  return dbP.then(function(db){
   idbClean(db);
   return Promise.all(ASSETS.map(function(name,i){
    var key=BUILD+':'+name;
    return idbGet(db,key).then(function(blob){
     if(blob){applySrc(name,URL.createObjectURL(blob));fr[i]=1;report();return}
     return fetchBlob(name,function(f){fr[i]=f;report()}).then(function(blob){
      applySrc(name,URL.createObjectURL(blob));fr[i]=1;report();
      idbSet(db,key,blob)
     }).catch(function(){fr[i]=1;report()})})}))
  },function(){
   /* IndexedDB unavailable (private mode etc.): warm the normal browser cache instead */
   return Promise.all(ASSETS.map(function(name,i){
    return fetch(name).then(function(r){return r.blob()}).catch(function(){}).then(function(){fr[i]=1;report()})}))
  })}
};
})();
