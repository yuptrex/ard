/* Knight eye blink: hides the glowing eye pixels (found automatically inside small boxes) for ~140ms at random
   intervals, on every artwork that shows the knights. Canvas overlay only; the art itself is untouched. */
(function(){
  var LOGO=[[206,66,246,82],[115,105,142,122],[298,105,322,122]]; /* red, blue, green eyes in login-bg logo coords */
  var LD={'ld-day.jpg':[710,35,1.78],'ld-dusk.jpg':[710,35,1.78],'ld-night.jpg':[714,38,1.76],'ld-bw.jpg':[706,45,1.7]};
  function ld(f){var p=LD[f];if(!p)return null;return LOGO.map(function(b){return [[p[0]+(b[0]-60)*p[2]-3,p[1]+(b[1]-10)*p[2]-3,p[0]+(b[2]-60)*p[2]+3,p[1]+(b[3]-10)*p[2]+3]]})}
  var HOME=[[[354,379,376,397],[392,387,410,398]],[[142,458,170,480]],[[534,472,552,488]]];
  var LOGIN=[[LOGO[0]],[LOGO[1]],[LOGO[2]],[[286,543,338,564]],[[108,596,140,616]]];
  var LOBBY=[[[192,60,222,73]],[[285,90,299,102]]];
  var VICT=[[[150,50,179,62]],[[234,83,248,95]]];
  var surfaces=[];
  function rnd(a,b){return a+Math.random()*(b-a)}
  function build(s,im,groups){
    var W=im.naturalWidth||im.width,H=im.naturalHeight||im.height; if(!W) return;
    var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d'),D;
    x.drawImage(im,0,0);
    try{D=x.getImageData(0,0,W,H).data}catch(e){return}
    s.cv.width=W;s.cv.height=H;
    s.groups=groups.map(function(g){
      var eyes=[];
      g.forEach(function(b){
        var x0=Math.max(0,Math.round(b[0])),y0=Math.max(0,Math.round(b[1])),x1=Math.min(W,Math.round(b[2])),y1=Math.min(H,Math.round(b[3])),w=x1-x0,h=y1-y0;
        if(w<2||h<2) return;
        var m=new Uint8Array(w*h),dr=0,dg=0,db=0,dn=0,i,j;
        for(j=0;j<h;j++)for(i=0;i<w;i++){var p=((y0+j)*W+x0+i)*4,r=D[p],gg=D[p+1],bb=D[p+2],mn=Math.min(r,gg,bb),l=(r+gg+bb)/3;
          if(mn>150&&l>180)m[j*w+i]=1; else if(l<85){dr+=r;dg+=gg;db+=bb;dn++}}
        if(dn){dr/=dn;dg/=dn;db/=dn}else{dr=22;dg=14;db=18}
        var o=document.createElement('canvas');o.width=w;o.height=h;var ox=o.getContext('2d'),id=ox.createImageData(w,h),q=id.data;
        for(j=0;j<h;j++)for(i=0;i<w;i++){var on=0;
          for(var a=-1;a<=1&&!on;a++)for(var b2=-1;b2<=1;b2++){var xx=i+b2,yy=j+a;if(xx>=0&&yy>=0&&xx<w&&yy<h&&m[yy*w+xx]){on=1;break}}
          if(on){var k=(j*w+i)*4;q[k]=dr;q[k+1]=dg;q[k+2]=db;q[k+3]=m[j*w+i]?255:200}}
        ox.putImageData(id,0,0);eyes.push({c:o,x:x0,y:y0});
      });
      return {eyes:eyes,next:performance.now()+rnd(500,3000),until:0,closed:false};
    });
    s.dirty=true;
  }
  function add(el,getGroups,place){
    var s={el:el,cv:document.createElement('canvas'),groups:[]};
    s.cv.className='hs-blink';s.cv.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    place(s.cv);s.ctx=s.cv.getContext('2d');surfaces.push(s);
    s.load=function(){var g=getGroups(el);if(g)build(s,el,g)};
    return s;
  }
  function imgSurface(img,getGroups){
    var s=add(img,getGroups,function(cv){img.parentNode.insertBefore(cv,img.nextSibling)});
    img.addEventListener('load',s.load);if(img.complete&&img.naturalWidth)s.load();
  }
  function img(sel,groups){var el=document.querySelector(sel);if(el)imgSurface(el,function(){return groups})}
  function init(){
    img('.hs-bg',HOME);img('.lg-bg',LOGIN);img('.lob-bg',LOBBY);
    ['sp-bg','ld-bg'].forEach(function(id){var el=document.getElementById(id);
      if(el)imgSurface(el,function(e){var f=e.dataset.art||'ld-bw.jpg';return ld(f)})});
    /* victory: CSS background + the stage is rebuilt on every show */
    var vimg=new Image();vimg.src='victory-bg.png';var vs=null;
    function vcheck(){var st=document.getElementById('vs-st');if(!st)return;
      if(vs&&vs.cv.parentNode===st)return;
      if(vs)surfaces.splice(surfaces.indexOf(vs),1);
      vs=add(vimg,function(){return VICT},function(cv){st.appendChild(cv)});
      if(vimg.complete&&vimg.naturalWidth)vs.load();else vimg.onload=vs.load}
    setInterval(vcheck,800);
  }
  var mq=matchMedia('(prefers-reduced-motion:reduce)');
  function loop(t){
    requestAnimationFrame(loop);
    if(mq.matches) return;
    for(var i=0;i<surfaces.length;i++){var s=surfaces[i];
      if(!s.cv.offsetParent){continue}
      for(var k=0;k<s.groups.length;k++){var g=s.groups[k];
        if(!g.closed&&t>=g.next){g.closed=true;g.until=t+rnd(110,170);s.dirty=true}
        else if(g.closed&&t>=g.until){g.closed=false;g.next=t+rnd(2200,6000);if(Math.random()<.2)g.next=t+rnd(250,420);s.dirty=true}}
      if(s.dirty){s.dirty=false;s.ctx.clearRect(0,0,s.cv.width,s.cv.height);
        s.groups.forEach(function(g){if(g.closed)g.eyes.forEach(function(e){s.ctx.drawImage(e.c,e.x,e.y)})})}
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  requestAnimationFrame(loop);
})();
