(function(){
var $=function(i){return document.getElementById(i)},mode='room';
function sel(m){mode=m;$('mroom').classList.toggle('sel',m==='room');$('msolo').classList.toggle('sel',m==='solo')}
sel('solo');
/* press ripple + haptic on every home button */
document.querySelector('.hs').addEventListener('pointerdown',function(e){
 var b=e.target.closest&&e.target.closest('.hb,.zb');if(!b||b.id==='pav')return;
 var r=b.getBoundingClientRect(),w=document.createElement('span');w.className='rip';
 var s=document.createElement('b');s.style.left=(e.clientX-r.left)/r.width*100+'%';s.style.top=(e.clientY-r.top)/r.height*100+'%';
 w.appendChild(s);b.appendChild(w);setTimeout(function(){w.remove()},600);
 try{navigator.vibrate&&navigator.vibrate(8)}catch(x){}});
$('mroom').onclick=function(){sel('room')};
$('msolo').onclick=function(){sel('solo')};
/* START */
var cards=['pmain','pnew','pcode'],cur='pmain',pt=0;
function show(id,instant){
 cards.forEach(function(c){var el=$(c);
  if(c===id){el.hidden=false;el.classList.remove('out');if(!instant){el.classList.remove('in');void el.offsetWidth;el.classList.add('in')}}
  else if(!el.hidden){if(instant){el.hidden=true}else{el.classList.add('out');setTimeout(function(){if(cur!==c){el.hidden=true}el.classList.remove('out')},200)}}});
 cur=id}
function openPop(){clearTimeout(pt);$('pop').classList.remove('closing');cards.forEach(function(c){$(c).hidden=true;$(c).classList.remove('in','out')});$('pop').hidden=false;show('pmain')}
function closePop(){if($('pop').hidden)return;$('pop').classList.add('closing');clearTimeout(pt);pt=setTimeout(function(){$('pop').hidden=true;$('pop').classList.remove('closing')},200)}
function shut(){clearTimeout(pt);$('pop').hidden=true;$('pop').classList.remove('closing')}
$('mstart').onclick=function(){if(mode==='solo')$('solo').click();else openPop()};
$('pclose').onclick=closePop;
$('pnclose').onclick=$('pcclose').onclick=function(){show('pmain')};
$('pcreate').onclick=function(){show('pnew');setTimeout(function(){$('rn').focus()},320)};
$('pjoin').onclick=function(){show('pcode');setTimeout(function(){$('rm').focus()},320)};
function bad(el){el.classList.remove('bad');void el.offsetWidth;el.classList.add('bad');el.focus()}
/* CREATE: room name goes to the cloud (rooms/<code>/name) once the room code exists - see lobby.js */
$('pmk').onclick=function(){var n=($('rn').value||'').trim().slice(0,20);
 if(!n){var p=($('nm').value||'').trim()||'Player';n=(p+"'s Room").slice(0,20)}
 window.CSK_ROOM_NAME=n;shut();$('host').click()};
$('pgo').onclick=function(){var r=$('rm');if(r.value.length<5){bad(r);return}shut();$('join').click()};
['rn','rm'].forEach(function(id){$(id).addEventListener('keydown',function(e){e.stopPropagation();
 if(e.key==='Enter'){e.preventDefault();$(id==='rn'?'pmk':'pgo').click()}if(e.key==='Escape')show('pmain')},true)});
/* profile: tap avatar to sign in with Google (when signed out) */
$('pav').onclick=function(){if($('acc').dataset.s==='guest')$('acbtn').click()};
var phImg=document.querySelector('#pav .pho img'),phSrc='',phOrig='';
/* Google gives a tiny 96px avatar (...=s96-c); ask for a sharper square crop so it stays crisp when scaled up */
function hi(u){u=String(u||'');if(/googleusercontent\.com/.test(u))return u.replace(/=s\d+(-c)?(?=$|[?#])/,'=s256-c').replace(/([?&])sz=\d+/,'$1sz=256');return u}
phImg.addEventListener('error',function(){if(phOrig&&phOrig!==phSrc&&phImg.dataset.fb!=='1'){phImg.dataset.fb='1';phImg.src=phOrig;return}$('acc').dataset.photo='0'});
phImg.addEventListener('load',function(){if(phImg.naturalWidth>0)$('acc').dataset.photo='1'});
function photo(){var a=window.ARA&&ARA.account&&ARA.account(),u=a&&a.photo?hi(a.photo):'',acc=$('acc');
 if(!u){phSrc=phOrig='';if(phImg.getAttribute('src'))phImg.removeAttribute('src');acc.dataset.photo='0';return}
 if(u!==phSrc){phSrc=u;phOrig=a.photo;phImg.dataset.fb='';phImg.src=u}
 if(phImg.complete&&phImg.naturalWidth>0)acc.dataset.photo='1'}
var mo=new MutationObserver(photo);mo.observe($('acc'),{attributes:true,attributeFilter:['data-s']});mo.observe($('acn'),{childList:true,characterData:true,subtree:true});
var nm=$('nm'),nv=$('nmv'),nt=$('nmt'),last=null;
function name(){var v=(nm.value||'').trim()||'Player';if(v===last)return;nt.textContent=v;if(!nv.clientWidth)return;last=v;nv.classList.remove('mq');
 requestAnimationFrame(function(){var o=nt.offsetWidth-nv.clientWidth;if(o>2){nv.style.setProperty('--s',-(o+8)+'px');nv.style.setProperty('--d',Math.max(4,o/25)+'s');nv.classList.add('mq')}})}
var lvn=$('lvn'),lvl=$('lvl'),lvf=$('lvf'),lvx=$('lvx'),lvLast=0;
/* character level: number beside the art's "Lv.", progress bar toward the next level (e.g. 3 -> 4) */
function level(){if(!window.CSK_LVL)return;var i;try{i=CSK_LVL()}catch(e){return}
 var d=String(i.lv).length;lvn.textContent=i.lv;lvn.dataset.d=d>3?3:d;
 lvx.textContent=i.max?'MAX':i.next;if(i.max)lvx.setAttribute('data-m','');else lvx.removeAttribute('data-m');lvf.style.width=(i.p>0?Math.max(5,i.p*100):0).toFixed(1)+'%';
 lvl.title='Level '+i.lv+(i.max?' (max)':' \u00b7 '+i.cur+' / '+i.need+' XP to level '+i.next);
 if(lvLast&&i.lv>lvLast){lvn.classList.remove('up');void lvn.offsetWidth;lvn.classList.add('up')}lvLast=i.lv}
setInterval(function(){photo();name();level()},500);photo();name();level();
})();
