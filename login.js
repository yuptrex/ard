/* ============ LOGIN SCREEN + "SET YOUR NAME AND PASSWORD" POPUP ============
   - The login screen shows whenever nobody is signed in (Google, or Gmail + password).
   - First time: Google sign-in -> popup asks for a permanent name + a password.
       name     -> Realtime Database  users/<uid>/callsign   (written once, by transaction)
       password -> Firebase Authentication: an email/password login is LINKED to the same
                   Google account (stored hashed by Firebase, never in the database), so the
                   same account opens with Gmail + password on any other device.
   - game.js calls CSKLogin.ask() (needs a name and/or password) and CSKLogin.ready()
     (account is complete) from its existing sign-in flow. */
(function(){
'use strict';
var $=function(id){return document.getElementById(id)};
var LS=function(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}};
var root=$('login');if(!root)return;
var em=$('lg-em'),pw=$('lg-pw'),go=$('lg-go'),gg=$('lg-google'),tc=$('lg-tc'),terms=$('lg-terms'),msg=$('lg-msg'),form=$('lg-form');
var auth=null,busy=false,done=false,busyT=0,msgT=0;

var ERR={
 'auth/invalid-credential':'Wrong Gmail or password. If you have not set a password yet, sign in with Google first.',
 'auth/wrong-password':'Wrong Gmail or password.',
 'auth/user-not-found':'No account with that Gmail. Sign in with Google to create one.',
 'auth/invalid-email':'That does not look like a valid email address.',
 'auth/user-disabled':'This account has been disabled.',
 'auth/too-many-requests':'Too many tries. Wait a minute and try again.',
 'auth/network-request-failed':'No connection. Check your internet and try again.',
 'auth/operation-not-allowed':'This sign-in method is not switched on yet. Enable it in Firebase \u2192 Authentication \u2192 Sign-in method.',
 'auth/unauthorized-domain':'This web address is not authorised for sign-in yet. Add it in Firebase \u2192 Authentication \u2192 Settings \u2192 Authorized domains.',
 'auth/operation-not-supported-in-this-environment':'Sign-in needs the game opened from an https:// address, not a local file.',
 'auth/web-storage-unsupported':'This browser blocks the storage sign-in needs. Allow cookies/storage and retry.',
 'auth/account-exists-with-different-credential':'That Gmail is already registered another way. Sign in with Google.'
};
function errText(e){var c=e&&e.code||'';return ERR[c]||('Sign-in failed ('+(c||'unknown')+').')}

function getAuth(){
 if(auth)return auth;
 try{if(window.fbInit&&window.fbInit()&&window.firebase&&firebase.auth)auth=firebase.auth()}catch(e){}
 return auth}

function say(t,k){clearTimeout(msgT);msg.textContent=t||'';msg.dataset.k=k||'';if(t&&k==='bad')msgT=setTimeout(function(){if(msg.dataset.k==='bad')say('')},9000)}
function setBusy(b){busy=b;root.classList.toggle('is-busy',b);em.disabled=pw.disabled=b;clearTimeout(busyT);
 if(b)busyT=setTimeout(function(){if(busy&&!done){setBusy(false);say('This is taking longer than usual. Please try again.','bad')}},25000);refresh()}
function refresh(){var ok=tc.checked&&!busy&&em.value.trim()&&pw.value;go.classList.toggle('is-off',!ok);go.setAttribute('aria-disabled',ok?'false':'true')}
function shake(){terms.classList.remove('shake');void terms.offsetWidth;terms.classList.add('shake');setTimeout(function(){terms.classList.remove('shake')},600)}
function needTerms(){if(tc.checked)return false;say('Please agree to the Terms and Conditions first.','bad');shake();return true}

function show(){if(done)return;root.hidden=false;root.classList.remove('lg-out');document.body.classList.add('lg-open')}
function hide(){root.classList.add('lg-out');document.body.classList.remove('lg-open');setTimeout(function(){if(done)root.hidden=true},380)}

/* ---------- sign in ---------- */
function fail(e){setBusy(false);var c=e&&e.code||'';if(c==='auth/popup-closed-by-user'||c==='auth/cancelled-popup-request'){say('');return}say(errText(e),'bad')}
async function google(){
 if(busy||needTerms())return;
 var a=getAuth();if(!a){say('Could not reach the server. Check your connection or ad-blocker, then reload.','bad');return}
 setBusy(true);say('Opening Google\u2026');
 var p=new firebase.auth.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});
 try{await a.signInWithPopup(p);say('Signing in\u2026')}
 catch(e){if(e&&e.code==='auth/popup-blocked'){try{await a.signInWithRedirect(p);return}catch(x){e=x}}fail(e)}}
async function emailLogin(){
 if(busy)return;if(needTerms())return;
 var a=getAuth(),email=em.value.trim(),pass=pw.value;
 if(!email||!pass){say('Enter your Gmail and password.','bad');return}
 if(!/^\S+@\S+\.\S+$/.test(email)){say('That does not look like a valid email address.','bad');return}
 if(!a){say('Could not reach the server. Check your connection or ad-blocker, then reload.','bad');return}
 setBusy(true);say('Signing in\u2026');
 try{await a.signInWithEmailAndPassword(email,pass);say('Signing in\u2026')}catch(e){fail(e)}}

gg.addEventListener('click',google);
form.addEventListener('submit',function(e){e.preventDefault();emailLogin()});
[em,pw].forEach(function(i){i.addEventListener('input',function(){refresh();if(msg.dataset.k==='bad')say('')})});
tc.checked=LS('csk-terms')==='1';
tc.addEventListener('change',function(){LS('csk-terms',tc.checked?'1':'0');if(tc.checked&&msg.dataset.k==='bad')say('');refresh()});
$('lg-eye').addEventListener('click',function(){var on=pw.type==='password';pw.type=on?'text':'password';this.classList.toggle('on',on);this.setAttribute('aria-pressed',on);this.setAttribute('aria-label',on?'Hide password':'Show password')});
/* terms dialog (the link must not toggle the checkbox) */
var tm=$('lg-tm');
function openTerms(e){e.preventDefault();e.stopPropagation();tm.hidden=false;$('lg-tx').focus()}
$('lg-tl').addEventListener('click',openTerms);
$('lg-tl').addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' ')openTerms(e)});
$('lg-tx').addEventListener('click',function(){tm.hidden=true});
tm.addEventListener('click',function(e){if(e.target===tm)tm.hidden=true});
/* the game's keyboard handlers must not see typing on this screen */
['keydown','keyup'].forEach(function(n){root.addEventListener(n,function(e){e.stopPropagation()})});

/* ---------- small full-screen button ---------- */
(function(){var b=$('lg-fs'),de=document.documentElement;
 var req=de.requestFullscreen||de.webkitRequestFullscreen||de.msRequestFullscreen;
 var ext=document.exitFullscreen||document.webkitExitFullscreen||document.msExitFullscreen;
 if(!req){b.hidden=true;return}
 function isFs(){return !!(document.fullscreenElement||document.webkitFullscreenElement||document.msFullscreenElement)}
 function sync(){var on=isFs();b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);var t=on?'Exit full screen':'Enter full screen';b.setAttribute('aria-label',t);b.title=t}
 ['fullscreenchange','webkitfullscreenchange','MSFullscreenChange'].forEach(function(n){document.addEventListener(n,sync)});
 b.addEventListener('click',function(){
  if(isFs()){try{var p=ext&&ext.call(document);if(p&&p.catch)p.catch(function(){})}catch(e){}}
  else if(window.CSKFullscreen)window.CSKFullscreen.enter();
  else{try{var q=req.call(de);if(q&&q.catch)q.catch(function(){})}catch(e){}}});
 sync()})();

/* ---------- when to show the screen ---------- */
(function(){var a=getAuth();
 if(!a){setTimeout(function(){show();say('Could not reach the server. Check your connection or ad-blocker, then reload.','bad')},1500);return}
 a.onAuthStateChanged(function(u){if(!u)show()});
 /* (a restored session never shows this screen; game.js finishes it and calls ready()) */
})();

/* ---------- called by game.js ---------- */
var hasPassword=function(u){return !!(u&&u.providerData&&u.providerData.some(function(p){return p.providerId==='password'}))};
function ready(){done=true;setBusy(false);say('');try{CSKBoot.ensure()}catch(e){}hide()}

/* The popup. o = {user, claim, cleanName, nameRe, needName, needPw, name}. Resolves with the locked name ('' if none). */
function ask(o){return new Promise(function(resolve){
 if($('sp-pop')){$('sp-pop').remove()}
 var needName=!!o.needName,needPw=!!o.needPw,working=false;
 var eye='<svg class="e-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M1.8 12S5.6 5.2 12 5.2 22.2 12 22.2 12 18.4 18.8 12 18.8 1.8 12 1.8 12z"/><circle cx="12" cy="12" r="3.2"/></svg><svg class="e-off" viewBox="0 0 24 24" aria-hidden="true"><path d="M1.8 12S5.6 5.2 12 5.2c2 0 3.8.7 5.3 1.7M22.2 12S18.4 18.8 12 18.8c-2 0-3.8-.7-5.3-1.7"/><circle cx="12" cy="12" r="3.2"/><path d="M3.5 3.5l17 17"/></svg>';
 var pop=document.createElement('div');pop.id='sp-pop';pop.setAttribute('role','dialog');pop.setAttribute('aria-modal','true');pop.setAttribute('aria-label','Set your name and password');
 pop.innerHTML='<div class="sp-card"><img class="sp-art" src="setup-card.png" alt="" draggable="false">'
  +'<div class="sp-a sp-fld" style="--x:238.4;--y:332;--w:675.2;--h:73.6"><input class="sp-in" id="sp-nm" maxlength="12" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Enter your name" aria-label="Your name (permanent)"></div>'
  +'<div class="sp-a sp-fld sp-pw" style="--x:238.4;--y:464;--w:675.2;--h:72"><input class="sp-in" id="sp-pw" type="password" maxlength="64" autocomplete="new-password" placeholder="Enter your password" aria-label="Your password"><button class="sp-eye" id="sp-eye" type="button" aria-label="Show password" aria-pressed="false">'+eye+'</button></div>'
  +'<p class="sp-a sp-msg" id="sp-msg" role="alert" style="--x:238;--y:547;--w:675;--h:28"></p>'
  +'<button class="sp-a sp-go is-off" id="sp-go" type="button" aria-label="Continue" aria-disabled="true" style="--x:196.8;--y:577.6;--w:649.6;--h:129.6"><img src="setup-btn.png" alt="" draggable="false"></button></div>'
  +'<button class="sp-link" id="sp-out" type="button">Use a different account</button>';
 document.body.appendChild(pop);
 var q=function(s){return pop.querySelector(s)},nm=q('#sp-nm'),pp=q('#sp-pw'),btn=q('#sp-go'),m=q('#sp-msg');
 var HINT='Name is permanent \u00b7 Password: 6+ characters';
 function say2(t,k){m.textContent=t;m.dataset.k=k||''}
 if(!needName){nm.value=o.name||'';nm.readOnly=true;nm.title='Your name is permanent'}
 if(!needPw){pp.disabled=true;pp.placeholder='Password already set'}
 function nameErr(){if(!needName)return '';var n=o.cleanName(nm.value);if(!n)return nm.value?'Name needs at least 3 characters.':'';return n.length<3?'Name needs at least 3 characters.':!o.nameRe.test(n)?'Name: letters, numbers, spaces and . _ - only.':''}
 function pwErr(){if(!needPw)return '';return pp.value&&pp.value.length<6?'Password needs at least 6 characters.':''}
 var avail=null,availFor='',availT=0,availSeq=0;
 function nameOk(){if(!needName)return true;var c=o.cleanName(nm.value);return c.length>=3&&o.nameRe.test(c)}
 function valid(){var p=!needPw||pp.value.length>=6;if(!nameOk()||!p)return false;if(needName&&o.free&&avail===false&&availFor===o.cleanName(nm.value).toLowerCase())return false;return true}
 function lookup(){clearTimeout(availT);avail=null;if(!needName||!o.free||!nameOk())return;var n=o.cleanName(nm.value),seq=++availSeq;availFor=n.toLowerCase();
  availT=setTimeout(function(){if(!working)say2('Checking name\u2026','');o.free(n).then(function(ok){if(seq!==availSeq||working)return;avail=ok;if(ok===false)say2('That name is already taken. Choose another.','bad');else if(ok===true)say2('Name is available \u2713','ok');check()})},350)}
 function check(){var e=nameErr()||pwErr();if(!working){if(e)say2(e,'bad');else if(needName&&avail===false&&availFor===o.cleanName(nm.value).toLowerCase())say2('That name is already taken. Choose another.','bad');else if(!(needName&&avail===true&&availFor===o.cleanName(nm.value).toLowerCase()))say2(HINT,'')}var ok=valid()&&!working;btn.classList.toggle('is-off',!ok);btn.classList.toggle('on',ok);btn.setAttribute('aria-disabled',ok?'false':'true')}
 nm.addEventListener('input',function(){check();lookup()});pp.addEventListener('input',check);
 [nm,pp].forEach(function(i){i.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();btn.click()}})});
 q('#sp-eye').addEventListener('click',function(){var on=pp.type==='password';pp.type=on?'text':'password';this.classList.toggle('on',on);this.setAttribute('aria-pressed',on);this.setAttribute('aria-label',on?'Hide password':'Show password')});
 q('#sp-out').addEventListener('click',function(){var b=$('acbtn');if(b)b.click();else{try{auth&&auth.signOut()}catch(e){}location.reload()}});
 ['keydown','keyup'].forEach(function(n){pop.addEventListener(n,function(e){if(e.key==='Tab'){var f=[].slice.call(pop.querySelectorAll('button,input')).filter(function(x){return !x.disabled&&x.offsetParent});if(f.length){var a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}}e.stopPropagation()})});
 function pwFail(e){var c=e&&e.code||'';
  if(c==='auth/weak-password')return 'Password is too weak. Use 6+ characters.';
  if(c==='auth/operation-not-allowed')return 'Email/password sign-in is not switched on. Enable it in Firebase \u2192 Authentication \u2192 Sign-in method.';
  if(c==='auth/requires-recent-login')return 'For safety, please use "Use a different account" and sign in with Google again, then retry.';
  if(c==='auth/email-already-in-use'||c==='auth/credential-already-in-use')return 'That Gmail already has a password login on another account.';
  if(c==='auth/network-request-failed')return 'No connection. Check your internet and try again.';
  return 'Could not save your password ('+(c||'unknown')+').'}
 btn.addEventListener('click',async function(){
  if(working||!valid())return;working=true;btn.classList.remove('on');btn.classList.add('work');pp.disabled=nm.readOnly=true;say2('Saving\u2026','');
  var name=o.name||'';
  try{
   if(needPw){
    var u=o.user;
    try{await u.linkWithCredential(firebase.auth.EmailAuthProvider.credential(u.email,pp.value))}
    catch(e){if(e&&e.code==='auth/provider-already-linked')await u.updatePassword(pp.value);else throw e}
    needPw=false}
   if(needName){name=await o.claim(o.cleanName(nm.value));needName=false}
  }catch(e){
   working=false;btn.classList.remove('work');
   var c=e&&e.code||'',den=String(c).toUpperCase().indexOf('PERMISSION')>=0||/permission[_ ]denied/i.test(String(e&&e.message||''));
   if(needPw)pp.disabled=false;if(needName)nm.readOnly=false;
   check();
   say2(c==='name-taken'?'That name is already taken. Choose another.':needPw?pwFail(e):den?'Names cannot be saved yet: the database rules do not allow users/<uid>/callsign.':'Could not reach the server. Check your connection and try again.','bad');
   return}
  say2('Saved \u2713','ok');
  try{navigator.vibrate&&navigator.vibrate([12,40,18])}catch(e){}
  setTimeout(function(){pop.classList.add('out');setTimeout(function(){pop.remove();resolve(name)},400)},650)});
 check();setTimeout(function(){(needName?nm:pp).focus()},650)})}

refresh();
window.CSKLogin={ask:ask,ready:ready,hasPassword:hasPassword};
})();
