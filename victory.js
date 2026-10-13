/* Victory screen: uses victory-bg.png as the artwork, overlays live data. VS.show(snap,myId) / VS.hide() */
(function(){
const W=1672,H=941;
const PROV=["Great knights don't just fight... they make history.","Steel breaks, but a knight's will never does.","The crown is heavy, but only the brave can carry it.","Every scar is a chapter of a legend.","Kingdoms fall. Legends never do.","Fear the knight who has nothing left to lose.","Glory is earned one battle at a time.","When the dust settles, only the worthy stand.","Rise like a flame, strike like thunder.","A true king is crowned on the battlefield."];
if(!document.getElementById('vs-font')){const l=document.createElement('link');l.id='vs-font';l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Exo+2:ital,wght@0,700;0,800;1,600&display=swap';document.head.appendChild(l)}
let root,st,on=0,pi=0,pt=0;
/* preload the artwork + fonts as soon as the game loads, so the results screen appears instantly */
const BG=new Image();BG.src='victory-bg.png';if(BG.decode)BG.decode().catch(()=>{});
if(document.fonts&&document.fonts.load){['700 20px "Exo 2"','800 20px "Exo 2"','italic 600 16px "Exo 2"'].forEach(f=>document.fonts.load(f).catch(()=>{}))}
const el=(c,t,p)=>{const e=document.createElement(t||'div');if(c)e.className=c;(p||st).appendChild(e);return e};
function fit(){if(!root)return;st.style.transform=`scale(${innerWidth/W},${innerHeight/H})`}
function pic(e,url,name,hue){e.style.backgroundImage='';e.style.background=`hsl(${hue||40} 60% 30%)`;e.textContent=(name||'?')[0].toUpperCase();
 if(!url)return;const im=new Image();im.referrerPolicy='no-referrer';im.onload=()=>{e.style.backgroundImage=`url("${url.replace(/"/g,'')}")`;e.textContent=''};im.src=url}
function photoOf(p,myId){return p.id==myId?((window.ARA&&ARA.account()||{}).photo||p.photo||''):(p.photo||'')}
function build(snap,myId){
 if(!root){root=el('','div',document.body);root.id='vs';st=document.createElement('div');st.id='vs-st';root.appendChild(st);addEventListener('resize',fit)}
 st.innerHTML='';
 const w=snap.w,rows=[...snap.p].sort((a,b)=>(b.id==w.id)-(a.id==w.id)||b.k-a.k||a.d-b.d).slice(0,10);
 el('vr-fx');
 rows.forEach((p,i)=>{const n=el('nm'+(i?'':' w1'));n.style.top=(354+i*40-16)+'px';n.textContent=p.name;if(p.id==myId)n.style.color='#ffe9a0';
  const k=el('kl');k.style.top=(354+i*40-16)+'px';k.textContent=p.k});
 const wp=rows[0]||{};
 const pc=el('','div');pc.id='vs-pic';pic(pc,photoOf(wp,myId),wp.name,wp.hue);
 el('','div').id='vs-pn';st.lastChild.textContent=wp.name||'';
 el('','div').id='vs-pk';st.lastChild.textContent=wp.k||0;
 const pv=el('','div');pv.id='vs-pv';pv.textContent=PROV[pi%PROV.length];
 const hb=el('','button');hb.id='vs-home';hb.type='button';hb.setAttribute('aria-label','Back to home');
 hb.onclick=e=>{const r=hb.getBoundingClientRect(),i=document.createElement('i'),d=Math.max(r.width,r.height)*2;
  i.style.cssText=`width:${d}px;height:${d}px;left:${e.clientX-r.left-d/2}px;top:${e.clientY-r.top-d/2}px`;
  hb.appendChild(i);hb.disabled=true;
  setTimeout(()=>{const h=document.getElementById('home');if(h)h.click();else location.reload()},180)};
 const fb=el('','button');fb.id='vs-fs';fb.type='button';fb.setAttribute('aria-label','Full screen');fb.innerHTML='<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#ffd45a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
 fb.onclick=()=>{const d=document,de=d.documentElement,fs=d.fullscreenElement||d.webkitFullscreenElement;
  try{fs?(d.exitFullscreen||d.webkitExitFullscreen).call(d):(de.requestFullscreen||de.webkitRequestFullscreen).call(de)}catch(e){}};
 if(!(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen))fb.hidden=true;
 fit()}
window.VS={
 show(snap,myId){if(on)return;on=1;pi=0;build(snap,myId);root.classList.add('on');
  pt=setInterval(()=>{const pv=document.getElementById('vs-pv');if(!pv)return;pv.classList.add('f');setTimeout(()=>{pi=(pi+1)%PROV.length;pv.textContent=PROV[pi];pv.classList.remove('f')},500)},5000)},
 hide(){if(!on)return;on=0;clearInterval(pt);root&&root.classList.remove('on')}};
})();
