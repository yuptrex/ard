/* Home screen: animated water (river, waterfalls) + waving flags/banners.
   Re-draws only the masked pixels of home-art2.jpg onto a canvas above the image. */
(function(){
  var bg=document.querySelector('.hs-bg'); if(!bg) return;
  var W=1672,H=941;
  var R=[ // x0,y0,x1,y1,type
    [765,545,880,662,'fall'],[870,640,1190,810,'pool'],[1030,688,1112,752,'fall'],[785,655,875,725,'pool'],
    [45,238,178,480,'ban'],[1555,238,1672,455,'ban'],[1072,372,1128,462,'ban'],
    [1150,104,1206,134,'flag'],[1103,175,1135,192,'flag'],[1008,200,1055,224,'flag'],
    [1214,230,1254,250,'flag'],[898,318,930,332,'flag'],[1402,284,1434,300,'flag'],[702,476,758,498,'flag']
  ];
  var img=new Image(); img.onload=start; img.src=bg.getAttribute('src');
  function isWater(r,g,b){return (b>175&&g>110&&r<g-15)||(r>170&&g>190&&b>210)}
  function isRed(r,g,b){return r>150&&g<100&&b<110}
  function isBan(r,g,b){return r>150&&b<130&&r>g+25}
  function start(){
    var cv=document.createElement('canvas'); cv.width=W; cv.height=H; cv.className='hs-anim';
    cv.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    bg.parentNode.insertBefore(cv,bg.nextSibling);
    var src=document.createElement('canvas'); src.width=W; src.height=H;
    var sx=src.getContext('2d'); sx.drawImage(img,0,0,W,H);
    var S; try{S=sx.getImageData(0,0,W,H).data}catch(e){cv.remove();return}
    var ctx=cv.getContext('2d');
    R.forEach(function(r){
      var t=r[4]; r.f=t=='flag'?isRed:t=='ban'?isBan:isWater;
      r.w=r[2]-r[0]; r.h=r[3]-r[1]; r.m=new Uint8Array(r.w*r.h);
      for(var y=0;y<r.h;y++)for(var x=0;x<r.w;x++){
        var i=((r[1]+y)*W+r[0]+x)*4; r.m[y*r.w+x]=r.f(S[i],S[i+1],S[i+2])?1:0;
      }
      r.o=ctx.createImageData(r.w,r.h);
    });
    var last=0, mq=matchMedia('(prefers-reduced-motion:reduce)');
    function frame(ms){
      requestAnimationFrame(frame);
      if(ms-last<33||document.hidden||mq.matches||!cv.offsetParent) return; last=ms;
      var t=ms/1000;
      for(var k=0;k<R.length;k++){
        var r=R[k],ty=r[4],o=r.o.data,w=r.w,h=r.h,m=r.m,x0=r[0],y0=r[1];
        for(var y=0;y<h;y++)for(var x=0;x<w;x++){
          var dx,dy,add=0,gx=x0+x,gy=y0+y;
          if(ty=='pool'){dx=Math.sin(gy*.22+t*2.2+gx*.03)*1.7;dy=Math.sin(gx*.12-t*1.7)*.8;
            var s=Math.sin(gx*.06-t*3+gy*.15);add=s>0?s*28:0}
          else if(ty=='fall'){dx=Math.sin(gy*.3+t*3)*1.2;dy=0;
            var s2=Math.sin(gy*.45-t*9+gx*.7);add=s2>0?s2*42:0}
          else if(ty=='ban'){var f=y/h;dx=(Math.sin(t*1.8+gy*.04)*5+Math.sin(t*3.1+gy*.1)*1.5)*f;dy=0;
            add=Math.sin(t*1.8+gy*.04+1.2)*20*f}
          else{var f2=x/w;dy=Math.sin(gx*.5-t*7)*2.4*f2;dx=Math.sin(t*5-gx*.3)*1.3*f2;
            add=Math.sin(gx*.5-t*7)*16*f2}
          var sxp=x+Math.round(dx),syp=y+Math.round(dy);
          var oi=(y*w+x)*4;
          if(sxp<0||syp<0||sxp>=w||syp>=h){o[oi+3]=0;continue}
          if(!(m[y*w+x]||m[syp*w+sxp])){o[oi+3]=0;continue}
          var si=((y0+syp)*W+x0+sxp)*4;
          o[oi]=S[si]+add;o[oi+1]=S[si+1]+add;o[oi+2]=S[si+2]+add;o[oi+3]=255;
        }
        ctx.putImageData(r.o,x0,y0);
      }
    }
    requestAnimationFrame(frame);
  }
})();
