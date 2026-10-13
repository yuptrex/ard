/* Living art: slow pulsing glow on the red gems + gentle magic-flame particles from the knights' swords.
   Purely visual overlays on top of the supplied artwork (pointer-events:none). Coordinates are artwork pixels. */
(function(){
var LOW=!!window.CSK_LOW,NS='http://www.w3.org/1999/xhtml';
function gems(host,W,H,pts,ox,oy){if(!host||host.__g)return;host.__g=1;ox=ox||0;oy=oy||0;
 pts.forEach(function(p,i){var e=document.createElement('i');e.className='gem';
  e.style.cssText='left:'+((p[0]-ox)/W*100)+'%;top:'+((p[1]-oy)/H*100)+'%;width:'+(p[2]*2/W*100)+'%;animation-delay:'+(-(i*0.9%4.4)).toFixed(2)+'s';host.appendChild(e)})}
/* home screen */
var hs=document.querySelector('.hs-ui');
gems(hs,1672,941,[[1407,705,26],[1407,882,24],[85,770,22],[518,768,22],[299,863,24]]);
/* room popup cards (images are stretched to the card, so use image pixels) */
gems(document.getElementById('pmain'),1000,700,[[500,70,48],[60,112,26],[938,112,26],[147,336,30],[853,336,30]]);
gems(document.getElementById('pnew'),620,767,[[310,82,44],[310,262,24],[73,552,30],[548,552,30],[310,630,26],[310,708,30]]);
/* settings (cropped artwork 46,24 -> 1456x982) */
gems(document.querySelector('#st .sx'),1456,982,[[746,70,34],[724,901,36]]);
/* "set your name" card is built on demand */
new MutationObserver(function(){var c=document.querySelector('.sp-card');if(c&&!c.__g)gems(c,1042,798,[[524,68,26]])}).observe(document.body,{childList:true,subtree:true});
/* ---- sword magic ---- */
var SW={
 home:{root:'.hs',W:1672,H:941,s:[
  {a:[4,478],b:[66,570],c:[120,225,255]},
  {a:[300,548],b:[518,660],c:[255,170,40]},
  {a:[622,584],b:[714,522],c:[130,255,90]}]},
 login:{root:'#login',W:1672,H:941,s:[
  {a:[12,592],b:[72,682],c:[120,225,255]},
  {a:[232,645],b:[396,745],c:[255,170,40]},
  {a:[454,690],b:[522,634],c:[130,255,90]}]}};
function sprite(c){var s=document.createElement('canvas');s.width=s.height=48;var x=s.getContext('2d'),g=x.createRadialGradient(24,24,0,24,24,24);
 g.addColorStop(0,'rgba(255,255,240,1)');g.addColorStop(.12,'rgba(255,255,230,.95)');g.addColorStop(.3,'rgba('+c+',.95)');g.addColorStop(.65,'rgba('+c+',.4)');g.addColorStop(1,'rgba('+c+',0)');x.fillStyle=g;x.fillRect(0,0,48,48);return s}
function start(k){var cfg=SW[k],root=document.querySelector(cfg.root);if(!root)return;
 var cv=document.createElement('canvas');cv.className='swf';cv.setAttribute('aria-hidden','true');
 var ref=root.querySelector('.hs-bg,.lg-bg');ref?ref.insertAdjacentElement('afterend',cv):root.appendChild(cv);
 var x=cv.getContext('2d'),sp=cfg.s.map(function(s){return sprite(s.c.join(','))}),P=[],last=0,acc=[0,0,0],W=0,H=0,cap=LOW?30:70,rate=LOW?7:15;
 function size(){var r=cv.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,LOW?1:1.5);W=Math.max(1,r.width);H=Math.max(1,r.height);cv.width=W*d;cv.height=H*d;x.setTransform(d,0,0,d,0,0)}
 size();addEventListener('resize',size);
 function tick(t){var dt=Math.min(.05,(t-last)/1000||.016);last=t;
  if(document.hidden||!cv.offsetParent||document.body.classList.contains('noanim')){x.clearRect(0,0,W,H);P.length=0;setTimeout(function(){requestAnimationFrame(tick)},300);return}
  var sx=W/cfg.W,sy=H/cfg.H,u=Math.min(sx,sy);
  cfg.s.forEach(function(s,i){acc[i]+=dt*rate;while(acc[i]>=1&&P.length<cap){acc[i]--;var f=Math.random();
   P.push({x:(s.a[0]+(s.b[0]-s.a[0])*f)*sx,y:(s.a[1]+(s.b[1]-s.a[1])*f)*sy,vx:(Math.random()-.5)*10*u,vy:-(26+Math.random()*30)*u,l:0,L:1.6+Math.random()*1.6,r:(10+Math.random()*14)*u,i:i,w:Math.random()*6})}acc[i]=Math.min(acc[i],1)});
  x.clearRect(0,0,W,H);x.globalCompositeOperation='source-over';
  for(var j=P.length-1;j>=0;j--){var p=P[j];p.l+=dt;if(p.l>=p.L){P.splice(j,1);continue}
   var q=p.l/p.L;p.x+=(p.vx+Math.sin(p.l*3+p.w)*8*u)*dt;p.y+=p.vy*dt;
   var a=Math.sin(Math.PI*Math.min(1,q*1.15))*1,r=p.r*(1-q*.55);x.globalAlpha=a;x.drawImage(sp[p.i],p.x-r,p.y-r,r*2,r*2)}
  x.globalAlpha=1;x.globalCompositeOperation='source-over';
  if(LOW)setTimeout(function(){requestAnimationFrame(tick)},33);else requestAnimationFrame(tick)}
 requestAnimationFrame(tick)}
start('home');start('login');
})();
