/* ============================================================================
   usb-link.js  -  optional USB hardware link (Web Serial)

   HOW TO USE: add ONE line to index.html, right AFTER the game.js line:
       <script src="usb-link.js"></script>
   Nothing else in the game is edited. If no device is connected (or the
   browser has no Web Serial: Safari/Firefox/iPhone), this file does nothing.

   WIRE FORMAT: one JSON object per line ("\n" at the end), 115200 baud.

   GAME -> DEVICE
     {"t":"hello","mw":4800,"mh":3200,"r":18,"lv":1,"walls":[[x,y,w,h],...]}
         sent on connect and again whenever the level changes
     {"t":"s","n":<counter>,"lv":1,
      "me":{"id","x","y","vx","vy","a","hp","sh","w","am","rv","dn","kt","mk","c","rel","td","al"},
      "p":[[id,x,y,vx,vy,a,hp,sh,w,am,al,bot],...],     other players + bots
      "b":[[x,y,vx,vy,ownerId],...],                    bullets (max 60)
      "k":[[x,y,type],...],                             pickups that are available
      "h":[[x,y],...],                                  medkits that are available
      "tr":[[x,y,ownerId,hp],...],                      turrets
      "bm":[[x,y,ownerId,armed],...]}                   bombs   (armed 1 = placed)
     sent about 20 times a second while a match is running

   DEVICE -> GAME  (any time; at least ~10 per second keeps control)
     {"dx":-1..1,"dy":-1..1,"a":<aim angle radians>,
      "f":0/1 fire, "d":0/1 dash, "r":0/1 reload, "t":0/1 turret,
      "b":0/1 bomb, "q":0/1 grapple, "g":0/1 swap gun, "u":0..4 upgrade}
     d, t, b, q, g, u fire ONCE per message. f and r are "held" while 1.
     If no valid message arrives for 0.4 s, the keyboard/touch controls
     take over again, so the game can never get stuck.
   ========================================================================== */
(function () {
  'use strict';
  if (!('serial' in navigator)) return;            // unsupported browser: do nothing

  var HZ = 20, STALE_MS = 400, MAX_BULLETS = 60;
  var port = null, writer = null, on = false, busy = false;
  var last = null, lastAt = 0, timer = 0, seq = 0, sentLv = -1, btn = null;

  /* ---------- small helpers ---------- */
  function g(name, fallback) {                      // read a game.js top-level variable safely
    try { return (0, eval)('typeof ' + name) === 'undefined' ? fallback : (0, eval)(name); }
    catch (e) { return fallback; }
  }
  function r1(v) { return Math.round((+v || 0) * 10) / 10; }
  function r2(v) { return Math.round((+v || 0) * 100) / 100; }
  function isBot(p) { return (p.bot || String(p.id).indexOf('bot') === 0) ? 1 : 0; }

  /* ---------- game -> device ---------- */
  function send(o) {
    if (!writer || busy) return;                    // skip a frame if the device is not keeping up
    busy = true;
    writer.write(JSON.stringify(o) + '\n').catch(function () {}).then(function () { busy = false; });
  }

  function sendHello() {
    var lv = g('LV', 0);
    sentLv = lv;
    send({ t: 'hello', mw: g('MW', 4800), mh: g('MH', 3200), r: g('R', 18), lv: lv, walls: g('WALLS', []) });
  }

  function tick() {
    if (!on) return;
    var s = g('snap', null), myId = g('myId', ''), i;
    if (!s || !s.p || !s.p.length) return;
    var m = null;
    for (i = 0; i < s.p.length; i++) if (s.p[i].id === myId) { m = s.p[i]; break; }
    if (!m) return;
    if (g('LV', 0) !== sentLv) { busy = false; sendHello(); return; }

    var P = [], B = [], K = [], H = [], T = [], BM = [], p, o;
    for (i = 0; i < s.p.length; i++) {
      p = s.p[i];
      if (p.id === myId) continue;
      P.push([p.id, p.x | 0, p.y | 0, p.vx | 0, p.vy | 0, r2(p.a), r1(p.hp), r1(p.sh), p.w, p.am, p.al ? 1 : 0, isBot(p)]);
    }
    var bl = s.b || [];
    for (i = 0; i < bl.length && B.length < MAX_BULLETS; i++) {
      o = bl[i]; B.push([o.x | 0, o.y | 0, o.vx | 0, o.vy | 0, o.o]);
    }
    var kl = s.k || [];
    for (i = 0; i < kl.length; i++) { o = kl[i]; if (o.on) K.push([o.x | 0, o.y | 0, o.t]); }
    var hl = s.h || [];
    for (i = 0; i < hl.length; i++) { o = hl[i]; if (o.on) H.push([o.x | 0, o.y | 0]); }
    var tl = s.t || [];
    for (i = 0; i < tl.length; i++) { o = tl[i]; T.push([o.x | 0, o.y | 0, o.o, r1(o.hp)]); }
    var bm = s.bm || [];
    for (i = 0; i < bm.length; i++) { o = bm[i]; BM.push([o.x | 0, o.y | 0, o.o, o.st ? 0 : 1]); }

    send({
      t: 's', n: ++seq, lv: g('LV', 0),
      me: { id: m.id, x: m.x | 0, y: m.y | 0, vx: m.vx | 0, vy: m.vy | 0, a: r2(m.a), hp: r1(m.hp), sh: r1(m.sh),
            w: m.w, am: m.am, rv: m.rv | 0, dn: m.dn, kt: m.kt | 0, mk: m.mk | 0, c: m.c | 0,
            rel: r2(m.rel), td: r2(m.td), al: m.al ? 1 : 0 },
      p: P, b: B, k: K, h: H, tr: T, bm: BM
    });
  }

  /* ---------- device -> game ---------- */
  function num(v, lo, hi) { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; }
  function bit(v) { return v ? 1 : 0; }

  function handleLine(line) {
    var o;
    try { o = JSON.parse(line); } catch (e) { return; }           // ignore boot messages / garbage
    if (!o || typeof o !== 'object' || typeof o.dx === 'undefined') return;
    var dx = num(o.dx, -1, 1), dy = num(o.dy, -1, 1), l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    last = { dx: dx, dy: dy, a: num(o.a, -1e4, 1e4), f: bit(o.f), d: bit(o.d), r: bit(o.r),
             t: bit(o.t), b: bit(o.b), q: bit(o.q), g: bit(o.g), u: Math.round(num(o.u, 0, 4)) };
    lastAt = performance.now();
  }

  /* ---------- plug into the game's input ---------- */
  /* game.js calls readInput() 60 times a second. We wrap it: while the device is
     alive its values replace the keyboard/touch ones; otherwise nothing changes. */
  var origReadInput = g('readInput', null);
  if (typeof origReadInput !== 'function') return;                 // game structure changed: stay out
  (0, eval)('readInput = function(){ return window.__uskInput.apply(this, arguments) }');
  window.__uskInput = function () {
    var o = origReadInput.apply(this, arguments);
    if (!on || !last || performance.now() - lastAt > STALE_MS) return o;
    if (g('paused', false)) return o;
    var a = last;
    o.dx = a.dx; o.dy = a.dy; o.a = a.a;
    o.f = a.f; o.d = a.d; o.r = a.r; o.t = a.t; o.b = a.b; o.q = a.q; o.g = a.g; o.u = a.u;
    try { (0, eval)('lastA = ' + a.a); } catch (e) {}
    a.d = a.t = a.b = a.q = a.g = a.u = 0;                         // one-shot actions fire once per message
    return o;
  };

  /* ---------- connect / disconnect ---------- */
  function setBtn() {
    if (!btn) return;
    btn.textContent = on ? 'USB: connected' : 'USB device';
    btn.style.background = on ? 'rgba(40,160,90,.85)' : 'rgba(20,20,26,.65)';
  }

  function cleanup() {
    on = false; busy = false; last = null;
    clearInterval(timer); timer = 0;
    try { if (writer) writer.close().catch(function () {}); } catch (e) {}
    try { if (port) port.close().catch(function () {}); } catch (e) {}
    writer = null; port = null; setBtn();
  }

  async function readLoop(p) {
    var dec = new TextDecoderStream();
    p.readable.pipeTo(dec.writable).catch(function () {});
    var rd = dec.readable.getReader(), buf = '';
    try {
      for (;;) {
        var res = await rd.read();
        if (res.done) break;
        buf += res.value;
        var i;
        while ((i = buf.indexOf('\n')) >= 0) {
          var line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (line) handleLine(line);
        }
        if (buf.length > 8192) buf = '';
      }
    } catch (e) { /* unplugged */ }
    if (port === p) cleanup();
  }

  async function connect() {
    if (on) { cleanup(); return; }
    try {
      var p = await navigator.serial.requestPort();
      await p.open({ baudRate: 115200 });
      port = p;
      var enc = new TextEncoderStream();
      enc.readable.pipeTo(p.writable).catch(function () {});
      writer = enc.writable.getWriter();
      on = true; seq = 0; setBtn(); sendHello();
      timer = setInterval(tick, 1000 / HZ);
      readLoop(p);
    } catch (e) { cleanup(); }                                     // cancelled picker or open failed
  }

  navigator.serial.addEventListener('disconnect', function (e) { if (e.target === port) cleanup(); });

  function mount() {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;padding:4px 10px;font:600 11px/1.4 system-ui,sans-serif;' +
      'color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:999px;opacity:.7;cursor:pointer';
    btn.addEventListener('click', function (e) { e.stopPropagation(); connect(); });
    document.body.appendChild(btn); setBtn();
  }
  if (document.body) mount(); else addEventListener('DOMContentLoaded', mount);
})();
