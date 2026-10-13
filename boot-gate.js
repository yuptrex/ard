/* ============ BOOT GATE: light until login, heavy after ============
   Signed out (no saved account on this device):
     - only the splash + sign-in screen assets are loaded (CSKAssets 'boot' group)
     - the home screen is not rendered (html.csk-pre), so its 1 MB artwork is never fetched or decoded
     - the 2 MB sound bank is not loaded and no audio engine is created
   After login (Firebase reports a user): the sound bank and the remaining art load, then the home screen unlocks.
   Returning players (saved account) skip the gate and load everything up front, as before.
   (Google sign-in itself lives in login.js and game.js.) */
(function(){
'use strict';
var root=document.documentElement,pre=false,started=false,done=false,loaderOn=false;
try{pre=!localStorage.getItem('ar-acct')}catch(e){}
window.CSK_PRE=pre;if(pre)root.classList.add('csk-pre');

function loadScript(src){return new Promise(function(res,rej){var s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s)})}
function sounds(){return loadScript('sfx-data.js').then(function(){try{window.CSK_decodeSounds&&window.CSK_decodeSounds()}catch(e){}}).catch(function(){})}
function hero(){var im=document.querySelector('.hs-bg');if(im&&!im.getAttribute('src'))im.src=(window.CSKAssets&&CSKAssets.url('home-art2.jpg'))||'home-art2.jpg'}

/* ---- unlock ---- */
function finish(){
 if(done)return;done=true;window.CSK_PRE=false;root.classList.remove('csk-pre');hero();
 if(loaderOn){loaderOn=false;try{CSKLoad.hide()}catch(e){}}}
function unlock(){
 if(!pre||started)return;started=true;
 var jobs=[sounds()];
 try{jobs.push(CSKAssets.preload(function(){},'main').catch(function(){}))}catch(e){}
 Promise.all(jobs).then(finish,finish);
 setTimeout(finish,30000);   /* never trap the player behind a stalled download */}
/* the sign-in screen is closing: if assets are still arriving, cover the wait with the normal loader */
function ensure(){
 if(!pre||done)return;if(!started)unlock();
 try{CSKLoad.show();loaderOn=true}catch(e){}}

window.CSKBoot={unlock:unlock,ensure:ensure,isPre:function(){return pre&&!done}};

document.addEventListener('DOMContentLoaded',function(){
 if(!pre){hero();sounds();return}
 /* first moment Firebase reports a signed-in user */
 var tries=0,iv=setInterval(function(){tries++;
  try{if(window.firebase&&firebase.apps&&firebase.apps.length&&firebase.auth){clearInterval(iv);firebase.auth().onAuthStateChanged(function(u){if(u)unlock()})}}catch(e){}
  if(tries>150)clearInterval(iv)},300);
 /* fallback: the account badge flips to "in" */
 var a=document.getElementById('acc');
 if(a&&window.MutationObserver)new MutationObserver(function(){if(a.dataset.s==='in')unlock()}).observe(a,{attributes:true,attributeFilter:['data-s']});
});
})();
