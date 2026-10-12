/* Waiting-room scenery (PC only): knights marching along the bottom of the screen in three depth layers
   (far = small + heavily blurred, mid = lightly blurred, near = sharp with a glow), drifting fog and rising embers.
   Pure decoration: builds its own DOM inside #lob-fx, reads/writes nothing in the game. Pauses itself when the
   waiting room is hidden (display:none stops CSS animations) and is skipped on touch devices / reduced motion. */
(function(){
'use strict';
var host=document.getElementById('lob-fx');if(!host)return;
var pc=window.matchMedia&&matchMedia('(hover:hover) and (pointer:fine) and (min-width:900px)').matches;
var calm=window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches;
if(!pc||calm)return;

var COLORS=['#3d7bff','#ff4a3d','#37d65c','#ffb02e','#b05cff'];
function knight(c){
 return '<svg viewBox="0 0 64 112" aria-hidden="true" style="--c:'+c+'">'
 +'<g class="k-leg kl"><rect x="20" y="70" width="11" height="34" rx="4" fill="#161e2c"/><rect x="18" y="98" width="16" height="9" rx="3" fill="#0c121c"/></g>'
 +'<g class="k-leg kr"><rect x="34" y="70" width="11" height="34" rx="4" fill="#1d2738"/><rect x="33" y="98" width="16" height="9" rx="3" fill="#0c121c"/></g>'
 +'<g class="k-body">'
 +'<path d="M16 44 Q32 36 48 44 L45 76 Q32 82 19 76Z" fill="var(--c)"/>'
 +'<path d="M16 44 Q32 36 48 44 L46 52 Q32 46 18 52Z" fill="#fff" opacity=".22"/>'
 +'<rect x="19" y="70" width="26" height="5" rx="2" fill="#0c121c" opacity=".55"/>'
 +'<g class="k-sword"><rect x="47" y="8" width="4" height="52" rx="2" fill="#dbe9ff"/><rect x="42" y="56" width="14" height="4" rx="2" fill="#ffd067"/><rect x="47" y="60" width="4" height="9" rx="2" fill="#5a3b1a"/></g>'
 +'<path d="M6 46 L22 42 L22 68 Q14 78 6 68Z" fill="#1a2436" stroke="#ffd067" stroke-width="1.6"/>'
 +'<path d="M10 50 L18 48 L18 64 Q14 70 10 64Z" fill="var(--c)" opacity=".9"/>'
 +'<path d="M20 30 Q32 6 44 30 L44 42 Q32 48 20 42Z" fill="#2a3446" stroke="#0c121c" stroke-width="1"/>'
 +'<rect x="23" y="29" width="18" height="4" rx="2" fill="#fff6c9"/>'
 +'<path d="M30 8 Q38 -4 52 6 Q44 8 42 18 Q38 10 30 12Z" fill="var(--c)"/>'
 +'</g></svg>'}

var h='<div class="fx-fog f1"></div><div class="fx-fog f2"></div>';
/* [layer, left-to-right?, colour, duration s, delay s, bottom %] */
var plan=[
 ['far',1,0,52,-6,2],['far',0,1,58,-30,3],['far',1,2,64,-44,1],['far',0,4,56,-16,3],
 ['mid',0,3,40,-8,0],['mid',1,0,46,-26,1],['mid',0,2,44,-36,0],
 ['near',1,1,32,-4,-1],['near',0,0,36,-20,-2]];
plan.forEach(function(k){
 h+='<div class="fx-k '+k[0]+(k[1]?'':' rev')+'" style="--d:'+k[3]+'s;--dl:'+k[4]+'s;--b:'+k[5]+'%">'
  +'<div class="fx-face">'+knight(COLORS[k[2]])+'</div><i class="fx-shadow"></i></div>'});
for(var i=0;i<26;i++){
 h+='<i class="fx-ember" style="--x:'+(Math.random()*100).toFixed(1)+'%;--s:'+(2+Math.random()*4).toFixed(1)+'px;--t:'+(6+Math.random()*8).toFixed(1)+'s;--dl:-'+(Math.random()*12).toFixed(1)+'s;--dx:'+((Math.random()*60-30)|0)+'px"></i>'}
h+='<div class="fx-haze"></div>';
host.innerHTML=h;
})();
