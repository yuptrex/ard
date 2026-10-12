/* Home screen press feedback: pressed-face + tap ripple + haptic tick.
   Purely visual; the buttons' real actions are bound in game.js. */
(function(){
  var root=document.querySelector('.hs'); if(!root) return;
  function down(e){
    var b=e.target.closest&&e.target.closest('.hs-btn'); if(!b||b.disabled) return;
    b.classList.add('is-down');
    var fx=b.querySelector('.fx'); if(!fx) return;
    var r=b.getBoundingClientRect(), s=document.createElement('span');
    s.className='hs-rip';
    s.style.left=((e.clientX-r.left)/r.width*100)+'%';
    s.style.top=((e.clientY-r.top)/r.height*100)+'%';
    fx.appendChild(s);
    setTimeout(function(){ if(s.parentNode) s.parentNode.removeChild(s); },620);
  }
  function up(){
    var l=root.querySelectorAll('.hs-btn.is-down');
    for(var i=0;i<l.length;i++) l[i].classList.remove('is-down');
  }
  root.addEventListener('pointerdown',down);
  ['pointerup','pointercancel','pointerleave','dragend','blur'].forEach(function(n){
    root.addEventListener(n,up,true);
  });
  addEventListener('pointerup',up); addEventListener('blur',up);
})();
