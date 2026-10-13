/* Home screen: drifting clouds. Each cloud sits inside a hand-placed, feathered region; pixels inside are re-sampled
   with a slow horizontal sway (+ tiny bob), fading to zero at the region edge so nothing tears and the castle,
   trees, banners and UI never move. Overlay canvas only; home-art2.jpg is untouched. */
(function(){
  var bg=document.querySelector('.hs-bg'); if(!bg) return;
  /* poly points, amplitude px, period s, phase, feather radius */
  var C=[
   {p:[1190,45,1250,15,1330,8,1395,40,1424,72,1418,96,1300,108,1230,100,1190,90,1175,78],a:16,T:26,f:0,r:6},
   {p:[755,128,790,108,830,100,880,115,905,128,900,150,840,160,770,152],a:12,T:21,f:1.7,r:5},
   {p:[451,175,481,154,515,158,546,135,588,115,635,108,665,122,700,145,711,191,746,214,758,256,815,262,815,285,650,285,451,285],a:9,T:30,f:3,r:7},
   {p:[1445,200,1470,170,1500,155,1545,150,1575,160,1570,185,1545,200,1500,206],a:7,T:24,f:.8,r:5},
   {p:[1315,232,1340,208,1380,200,1410,215,1405,240,1370,252,1330,250],a:6,T:19,f:2.4,r:4}
  ];
  function blur(a,w,h,r){ /* separable box blur on Float32Array */
    var t=new Float32Array(w*h),x,y,s,k,n=2*r+1;
    for(y=0;y<h;y++){s=0;for(k=-r;k<=r;k++)s+=a[y*w+Math.min(w-1,Math.max(0,k))];
      for(x=0;x<w;x++){t[y*w+x]=s/n;s+=a[y*w+Math.min(w-1,x+r+1)]-a[y*w+Math.max(0,x-r)]}}
    for(x=0;x<w;x++){s=0;for(k=-r;k<=r;k++)s+=t[Math.min(h-1,Math.max(0,k))*w+x];
      for(y=0;y<h;y++){a[y*w+x]=s/n;s+=t[Math.min(h-1,y+r+1)*w+x]-t[Math.max(0,y-r)*w+x]}}
  }
  function start(){
    var img=new Image();img.onload=function(){
      var W=img.naturalWidth,H=img.naturalHeight,sc=document.createElement('canvas');sc.width=W;sc.height=H;
      var sx=sc.getContext('2d');sx.drawImage(img,0,0);var S;try{S=sx.getImageData(0,0,W,H).data}catch(e){return}
      var cv=document.createElement('canvas');cv.width=W;cv.height=H;
      cv.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
      bg.parentNode.insertBefore(cv,bg.nextSibling);var ctx=cv.getContext('2d');
      C.forEach(function(c){
        var xs=c.p.filter(function(_,i){return i%2==0}),ys=c.p.filter(function(_,i){return i%2==1}),m=c.r*3+2;
        c.x0=Math.max(0,Math.min.apply(0,xs)-m|0);c.y0=Math.max(0,Math.min.apply(0,ys)-m|0);
        c.w=Math.min(W,Math.max.apply(0,xs)+m|0)-c.x0;c.h=Math.min(H,Math.max.apply(0,ys)+m|0)-c.y0;
        var mc=document.createElement('canvas');mc.width=c.w;mc.height=c.h;var mx=mc.getContext('2d');
        mx.fillStyle='#fff';mx.beginPath();
        for(var i=0;i<c.p.length;i+=2){var px=c.p[i]-c.x0,py=c.p[i+1]-c.y0;i?mx.lineTo(px,py):mx.moveTo(px,py)}
        mx.fill();var d=mx.getImageData(0,0,c.w,c.h).data,wt=new Float32Array(c.w*c.h);
        for(var j=0;j<wt.length;j++)wt[j]=d[j*4+3]/255;
        for(var k=0;k<3;k++)blur(wt,c.w,c.h,c.r);
        for(j=0;j<wt.length;j++){var v=Math.min(1,Math.max(0,(wt[j]-.04)/.9));wt[j]=v*v*(3-2*v)}
        c.wt=wt;c.o=ctx.createImageData(c.w,c.h);
      });
      var mq=matchMedia('(prefers-reduced-motion:reduce)'),last=0;
      function frame(ms){requestAnimationFrame(frame);
        if(ms-last<33||document.hidden||mq.matches||!cv.offsetParent)return;last=ms;var t=ms/1000;
        for(var n=0;n<C.length;n++){var c=C[n],o=c.o.data,w=c.w,h=c.h,om=6.2832/c.T;
          for(var y=0;y<h;y++){var gy=c.y0+y,dx=c.a*Math.sin(om*t+c.f+gy*.011),dy=1.6*Math.sin(om*t*1.3+c.f+3);
            for(var x=0;x<w;x++){var q=c.wt[y*w+x],oi=(y*w+x)*4;
              if(q<.02){o[oi+3]=0;continue}
              var ox=Math.round(dx*q),oy=Math.round(dy*q);
              if(!ox&&!oy){o[oi+3]=0;continue}
              var X=c.x0+x-ox,Y=gy-oy;if(X<0)X=0;else if(X>=W)X=W-1;if(Y<0)Y=0;else if(Y>=H)Y=H-1;
              var si=(Y*W+X)*4;o[oi]=S[si];o[oi+1]=S[si+1];o[oi+2]=S[si+2];o[oi+3]=255}}
          ctx.putImageData(c.o,c.x0,c.y0)}
      }
      requestAnimationFrame(frame)};
    img.src=bg.getAttribute('src');
  }
  if(document.readyState==='complete')start();else addEventListener('load',start);
})();
