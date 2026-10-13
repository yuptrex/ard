/* ============ LOADING SCREEN + ROTATING TIPS ============
   Loaded right after the splash markup (before game.js), so both the first-boot splash and every
   later screen switch (home -> waiting room, waiting room -> match, leaving, being kicked, solo)
   share the same code.

   - CSKTips.attach(el)  : puts a tip into el and swaps it for a different one every few seconds.
                           Tips come from a shuffled bag, so nothing repeats until all were shown,
                           and a new run never starts on the tip the previous run ended on.
   - CSKLoad.show()      : covers the screen with a random loading scene (bar creeps forward, tips rotate).
   - CSKLoad.hide(opts)  : finishes the bar to 100% and fades out. Stays up for at least MIN_MS so the
                           screen never just flashes, unless opts.fast is set (used for errors).
   Everything here is presentation only: it never reads or changes game state. */
(function(){
'use strict';
var TIPS=[
 'Work with your team. Together you are stronger!',
 'Press B to drop a bomb, press B again to detonate it.',
 'Press Q to fire a grapple rope: hit a wall to zip across, hit an enemy to drag them in.',
 'Dash with Shift to dodge incoming fire.',
 'Spend coins on weapon upgrades with 1-4.',
 'Hold Tab to see the full scoreboard.',
 'Bombs go dead when they leave your screen, so keep them in view.',
 'First to 15 kills wins the round.',
 'Tap the room code in the waiting room to copy it and share it with friends.',
 'Sign in with Google to keep your kills, wins and streak.',
 'Your callsign is permanent, so choose it well.',
 'On a phone you can move and resize the touch buttons from Settings.',
 'The host can remove players from the waiting room.',
 'Ready up fast: the host can only start once everyone else is ready.'
];

/* ---------- loading art ----------
   Four scenes (ld-*.jpg, 1984x793). The first-boot splash is ALWAYS the black & white one; every loader after
   that picks randomly from the other three, never the same one twice in a row.
   x = horizontal focus (0..1) used when the screen is narrower than the art. bar = the painted progress
   bar's inner rectangle in image pixels [x,y,w,h]: the live fill is laid exactly over it. */
var ART=[
 {f:'ld-bw.jpg',   x:.5,bar:[681,550,597,28]},
 {f:'ld-night.jpg',x:.5,bar:[693,562,605,27]},
 {f:'ld-day.jpg',  x:.5,bar:[691,566,613,27]},
 {f:'ld-dusk.jpg', x:.5,bar:[691,566,613,27]}
];
var lastArt=0;
function pickArt(){
 var pool=[];for(var k=1;k<ART.length;k++)if(k!==lastArt)pool.push(k);
 lastArt=pool[Math.random()*pool.length|0];
 return ART[lastArt]}
function setArt(img,a){
 if(!img||!a)return;
 var url=(window.CSKAssets&&CSKAssets.url&&CSKAssets.url(a.f))||a.f,st=img.parentNode;   /* local cached copy when we have one */
 if(st&&st.style){st.style.setProperty('--oxn',a.x);st.style.setProperty('--bx',a.bar[0]);st.style.setProperty('--by',a.bar[1]);st.style.setProperty('--bw',a.bar[2]);st.style.setProperty('--bh',a.bar[3])}
 img.dataset.art=a.f;img.src=url}
window.CSKLoadArt={files:ART.map(function(a){return a.f}),pick:pickArt,set:setArt};
var first=ART[0];
window.CSKLoadArt.first=first;
try{var pl=document.createElement('link');pl.rel='preload';pl.as='image';pl.href=first.f;pl.setAttribute('fetchpriority','high');document.head.appendChild(pl)}catch(e){}

var ROTATE_MS=2300,FADE_MS=240,MIN_MS=1200;
var bag=[],lastTip='';

function nextTip(){
 if(!bag.length){
  bag=TIPS.slice();
  for(var i=bag.length-1;i>0;i--){var j=Math.random()*(i+1)|0,t=bag[i];bag[i]=bag[j];bag[j]=t}
  /* never start a fresh bag on the tip that was just shown */
  if(bag.length>1&&bag[bag.length-1]===lastTip){var k=Math.random()*(bag.length-1)|0,x=bag[k];bag[k]=bag[bag.length-1];bag[bag.length-1]=x}
 }
 lastTip=bag.pop();
 return lastTip}

var CSKTips={
 /* returns a stop() function */
 attach:function(el){
  if(!el)return function(){};
  var timer=0,swap=0;
  el.textContent='Tip: '+nextTip();el.style.opacity=1;
  timer=setInterval(function(){
   el.style.opacity=0;
   swap=setTimeout(function(){el.textContent='Tip: '+nextTip();el.style.opacity=1},FADE_MS)},ROTATE_MS);
  return function(){clearInterval(timer);clearTimeout(swap)}},
 all:TIPS
};
window.CSKTips=CSKTips;

/* ---------- full-screen loader used for every screen switch ---------- */
var el=null,bgEl=null,fill=null,pct=null,tipEl=null,stopTips=null,iv=0,hideT=0,fadeT=0,
    shownAt=0,target=0,shown=0,closing=0,visible=0,safetyT=0;

function paint(){var p=Math.round(shown);fill.style.width=shown+'%';pct.textContent=p+'%'}
function tick(){
 var age=Date.now()-shownAt;
 if(!closing){var creep=Math.min(90,age/26);if(creep>target)target=creep}
 var goal=closing?100:target;
 /* eases toward the goal; once closing, it sprints to 100% so the exit takes ~0.3 s instead of dragging */
 shown+=closing?Math.max((goal-shown)*.4,1.6):(goal-shown)*.16+(goal>shown?.15:0);if(shown>goal)shown=goal;
 paint();
 if(closing&&shown>=99.5){shown=100;paint();clearInterval(iv);iv=0;fadeT=setTimeout(finish,220)}}
function finish(){
 if(!el)return;
 el.classList.remove('on');visible=0;
 clearTimeout(safetyT);
 if(stopTips){stopTips();stopTips=null}
 setTimeout(function(){if(!visible&&el)el.hidden=true},520)}

var CSKLoad={
 show:function(){
  if(!el)return;
  clearTimeout(hideT);clearTimeout(fadeT);
  closing=0;
  if(!visible){
   shownAt=Date.now();target=0;shown=0;paint();
   if(bgEl)setArt(bgEl,pickArt());                /* a different random scene each time */
   el.hidden=false;
   void el.offsetWidth;                 /* let the browser see hidden=false before .on so the fade-in plays */
   el.classList.add('on');visible=1;
   if(stopTips)stopTips();
   stopTips=CSKTips.attach(tipEl)}
  if(!iv)iv=setInterval(tick,33);
  /* a loader must never trap the player: force it closed if something upstream never calls hide() */
  clearTimeout(safetyT);safetyT=setTimeout(function(){CSKLoad.hide({fast:1})},25000)},
 hide:function(opts){
  if(!el||!visible)return;
  var fast=opts&&opts.fast,wait=fast?0:Math.max(0,MIN_MS-(Date.now()-shownAt));
  clearTimeout(hideT);
  hideT=setTimeout(function(){closing=1;if(!iv)iv=setInterval(tick,33)},wait)},
 /* run fn() behind the loader; fn may return a promise. Always hides, even if fn throws. */
 around:function(fn){
  CSKLoad.show();
  var done=function(){CSKLoad.hide()};
  try{var r=fn();if(r&&r.then)return r.then(function(v){done();return v},function(e){done();throw e});done();return r}
  catch(e){done();throw e}},
 isOn:function(){return !!visible}
};
window.CSKLoad=CSKLoad;

function init(){
 el=document.getElementById('csk-load');if(!el)return;
 bgEl=document.getElementById('ld-bg');fill=document.getElementById('ld-fill');pct=document.getElementById('ld-pct');tipEl=document.getElementById('ld-tip');
 if(!fill||!pct||!tipEl)el=null}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
