/* Locks the page like a native app: no zoom, no long-press menu, no text/image selection or dragging (inputs stay editable). */
(function(){
var ed=function(t){return t&&t.closest&&t.closest('input,textarea,[contenteditable="true"]')},o={passive:false};
['gesturestart','gesturechange','gestureend'].forEach(function(n){document.addEventListener(n,function(e){e.preventDefault()},o)});
document.addEventListener('touchmove',function(e){if(e.touches&&e.touches.length>1)e.preventDefault()},o);
document.addEventListener('touchstart',function(e){if(e.touches&&e.touches.length>1)e.preventDefault()},o);
var lt=0;document.addEventListener('touchend',function(e){var n=Date.now();if(n-lt<320&&!ed(e.target))e.preventDefault();lt=n},o);
addEventListener('wheel',function(e){if(e.ctrlKey||e.metaKey)e.preventDefault()},o);
addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&/^(\+|-|=|_|0|Add|Subtract)$/.test(e.key))e.preventDefault()},true);
document.addEventListener('contextmenu',function(e){e.preventDefault()},true);
document.addEventListener('selectstart',function(e){if(!ed(e.target))e.preventDefault()},true);
document.addEventListener('dragstart',function(e){e.preventDefault()},true);
})();

/* Low-end / mobile detection. */
(function(){var m=navigator.deviceMemory||8,c=navigator.hardwareConcurrency||8,mob=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/Mac/.test(navigator.platform));
window.CSK_LOW=m<=4||c<=4;
try{if(window.CSK_LOW&&!localStorage.getItem('ar-set2'))localStorage.setItem('ar-set2',JSON.stringify({gfx:0,shk:1,fx:0}))}catch(e){}
})();
