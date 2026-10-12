/* Full-screen button + auto full-screen on Play Solo / Create Room / Join.
   Self-contained: touches no game state. Browsers only allow full screen from
   inside a real tap/click, so the request is made synchronously in the click
   handler of each button (capture phase = before the game's own handler runs). */
(function(){
  var de=document.documentElement;
  var req=de.requestFullscreen||de.webkitRequestFullscreen||de.msRequestFullscreen;
  var ext=document.exitFullscreen||document.webkitExitFullscreen||document.msExitFullscreen;
  var btn=document.getElementById('fsb');

  function isFs(){return !!(document.fullscreenElement||document.webkitFullscreenElement||document.msFullscreenElement)}

  /* browser can't do it (e.g. iPhone Safari): hide the button, nothing else to do */
  if(!req){ if(btn) btn.hidden=true; return; }

  function enter(){
    if(isFs()) return;
    try{
      var p=req.call(de);
      var coarse=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
      if(p&&p.then){
        p.then(function(){
          /* on phones, also lock to landscape once full screen is on (ignored where unsupported) */
          if(coarse&&screen.orientation&&screen.orientation.lock){
            try{ screen.orientation.lock('landscape').catch(function(){}); }catch(e){}
          }
        }).catch(function(){});
      }
    }catch(e){}
  }
  function leave(){
    try{ var p=ext&&ext.call(document); if(p&&p.catch) p.catch(function(){}); }catch(e){}
  }

  function sync(){
    if(!btn) return;
    var on=isFs();
    btn.classList.toggle('on',on);
    btn.setAttribute('aria-pressed',on?'true':'false');
    var t=on?'Exit full screen':'Enter full screen';
    btn.setAttribute('aria-label',t); btn.title=t;
  }
  ['fullscreenchange','webkitfullscreenchange','MSFullscreenChange'].forEach(function(n){
    document.addEventListener(n,sync);
  });
  sync();

  if(btn) btn.addEventListener('click',function(){ isFs()?leave():enter(); });

  /* auto full screen when a game/room is started from home */
  function hook(id,ok){
    var el=document.getElementById(id); if(!el) return;
    el.addEventListener('click',function(){ if(!ok||ok(el)) enter(); },true);
  }
  hook('solo');
  /* waiting room: READY / START / the countdown overlay are real taps too, so full screen is requested there as well
     (the 15 s countdown itself is not a tap, so it can't ask) */
  hook('lob-ready');hook('lob-start');hook('lob-count');
  window.CSKFullscreen={enter:enter,isFs:isFs};
  /* Create Room: skip when signed-out/locked or busy (the click will just be rejected) */
  hook('host',function(el){ return !el.disabled&&!el.classList.contains('lob-locked-btn'); });
  /* Join: only when a 5-character room code has been typed */
  hook('join',function(el){
    var rm=document.getElementById('rm');
    return !el.disabled&&rm&&rm.value.replace(/[^A-Za-z0-9]/g,'').length>=5;
  });
})();
