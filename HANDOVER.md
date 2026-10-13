# CSuperKnights — Visual Overhaul: Final Project Notes

## Status: Complete (Phase 1 + Phase 2)

The visual overhaul is finished. This file documents what changed, how
the project is structured, what was intentionally left alone and why,
and a short list of optional ideas if the project is picked up again
later.

---

## Summary

The game originally shipped as **one 2,422,379-byte `fkk.html` file** —
all CSS, all game logic, and a large base64 sound bank inlined together
in a single document. The home screen and settings dialog used plain
system fonts, flat dark boxes and inline placeholder icons.

The project is now:
- **Split into separate HTML/CSS/JS/asset files**, with every element
  `id`/`class` the game's JavaScript depends on kept **byte-for-byte
  identical** to the original. No gameplay code was rewritten.
- **Re-skinned throughout** — home menu, settings dialog, pause menu,
  button-layout editor, scoreboard, minimap frame and small HUD chrome
  all now share one consistent visual language: a dark glass-panel
  look, a gold gradient accent, condensed display type for headings and
  buttons, and layered SVG vector art (arena + knight silhouettes) on
  the home screen and a new loading splash.
- **Verified working end-to-end** in a headless browser: home menu →
  settings → Play Solo → in-match HUD → pause → button-layout editor →
  scoreboard, at both desktop and mobile viewport sizes, with no
  JavaScript errors introduced by the split or the re-skin.

**Nothing about core gameplay (canvas rendering, physics, bot AI,
multiplayer/Firebase networking, controls, scoring) was changed.** Every
change in this project is CSS, SVG assets, or small additive markup/JS
that the original game script never reads from or depends on.

---

## Final file structure

```
index.html                → page shell (was 2,200 lines inline, now ~175)
styles/
  game-core.css            → original game CSS, extracted unmodified
                             (canvas HUD positioning/sizing, dialogs,
                             editor, swap/crate panel mechanics, etc.)
  home-base.css             → original "home6" home-menu layout rules,
                             extracted unmodified (structure only)
  theme-vars.css            → design tokens: colors, fonts, shadows,
                             radii, easing — the single place to retune
                             the palette
  theme-home.css             → home menu + settings dialog re-skin
                             (Phase 1): buttons, cards, logo, inputs
  theme-hud.css               → in-match HUD + pause menu + editor +
                             scoreboard + loading splash re-skin
                             (Phase 2)
js/
  sfx-data.js                → original base64 sound bank, split out so
                             index.html stays readable (~2MB, unmodified)
  game.js                    → all original gameplay/menu/network logic,
                             concatenated in original order, unmodified
assets/
  hero-bg.svg                 → layered vector background (arena towers,
                             knight silhouettes, embers, floor rings),
                             used behind both the home menu and the
                             loading splash
  icons.svg                   → SVG symbol sprite: play, join, host,
                             settings, shield/logo, map icons, plus
                             pause/resume/home/reset/crate/medkit added
                             in Phase 2 for future use
HANDOVER.md                 → this file
```

### Why it's split this way
- **`game-core.css` / `home-base.css` vs `theme-*.css`:** the original
  rules stay intact as a base layer that the game's canvas-sizing math
  (`--uis`, `zoom`, fixed-position HUD elements) depends on. The theme
  files load *after* them and only ever add colors, gradients, fonts,
  shadows and motion — never layout, position, or sizing. If a palette
  change is ever wanted, `theme-vars.css` and `theme-home.css` /
  `theme-hud.css` are the only files that should need touching.
- **`sfx-data.js` stays separate** because it's ~2MB of base64 audio on
  a single line; keeping it out of `index.html` keeps the page source
  readable.
- **`game.js` stays as one file,** not split further into net/account/
  settings modules, because the original inline scripts share top-level
  variables and rely on executing in a specific order. Splitting it
  into ES modules would need those shared globals converted to explicit
  imports/exports — a real refactor with real regression risk, not a
  visual change, so it was deliberately left out of this project (see
  "Not done" below).

---

## What the re-skin actually changed

- **Typography:** `Rajdhani` (condensed, bold — for headings, buttons,
  callouts) paired with `Inter` (body text), loaded from Google Fonts
  with a system-font fallback for offline use.
- **Buttons:** primary actions (Play Solo, Resume, Create Room) use a
  gold gradient with an inset highlight, a soft amber drop shadow, and
  a diagonal shine sweep on hover. Secondary buttons use a dark glass
  treatment with an amber hover glow. All buttons have a visible focus
  ring for keyboard accessibility.
- **Vector art:** `assets/hero-bg.svg` — arena towers, two facing knight
  silhouettes, a radial ember glow, and floor rings — sits behind the
  home menu (slow CSS drift animation) and behind the new loading
  splash. Respects `prefers-reduced-motion`.
- **Icons:** a shared `assets/icons.svg` symbol sprite replaces
  duplicated inline SVG paths, so new icons live in one place.
- **Settings dialog:** reorganized into glass cards with amber section
  headers, styled toggle switches and segmented controls.
- **Pause menu:** same glass-card treatment, gradient Resume button,
  dark glass secondary buttons (Button Layout / Exit to Home / the
  game's own dynamically-added Settings button all pick up the shared
  `.box button` styling automatically).
- **Button-layout editor:** themed panel, amber label and slider accent,
  gradient "Save & Close" button — the drag-to-position touch-control
  editor itself (canvas-based) is untouched.
- **Scoreboard, minimap frame, FPS counter, room-code pill, toast
  message, error banner, "back to home" button:** all brought onto the
  same glass-panel/amber-accent language instead of the original plain
  dark boxes.
- **New loading splash:** a full-screen panel showing the vector art,
  the shield mark and a progress bar, shown while fonts/Firebase/the
  game script initialize, then fades out. It cannot block play — it has
  a hard 4-second safety timeout even if something upstream never fires
  a `load` event.
- **Weapon-swap popup, crate-open panel, kill banners, kill feed:**
  intentionally left as-is. These already had bespoke glow/shine/HSL-
  themed animations in the original CSS that were well above the
  "boring HTML" bar — reskinning them further risked fighting their
  existing per-weapon color theming for no visible benefit.

## Not done (intentionally out of scope)

- **Splitting `js/game.js` into smaller modules.** As noted above, the
  original scripts share global state and rely on load order; doing
  this safely is a structural refactor, not a visual one, and carries
  real risk of subtle multiplayer/timing bugs. If this is wanted later,
  budget it as its own task with its own testing pass — not bundled
  into a visual project.
- **Bundling Google Fonts locally / fully offline play.** The game
  currently loads `Rajdhani`/`Inter` from Google Fonts and Firebase
  from Google's CDN. Both already have sensible fallback behavior
  (system fonts; the game's own "Firebase failed to load" message and
  solo-mode-still-works path), so this was left as a network dependency
  rather than vendoring ~5 font files and the Firebase SDK into the
  project.
- **A fully custom "Sign in with Google" button.** Kept Google's
  official multi-color "G" mark, since altering it isn't just a style
  choice — Google's brand guidelines require their sign-in buttons to
  use their actual mark.

## One technical note for deployment

`assets/icons.svg` is referenced via `<use href="assets/icons.svg#...">`
in several places (home logo, settings gear, play icon, splash mark).
**This requires the page to be served over `http(s)://`** — a real or
local web server. Opening `index.html` directly from disk (`file://`)
will show blank icons in some browsers due to same-origin restrictions
on cross-file SVG `<use>`. This is expected once the game is deployed to
any normal web host (which it already needs, for Firebase to work) and
is not a bug. If local double-click testing without a server is ever
needed, the icon markup can be inlined as a fallback.

---

## Testing performed

Using a local static file server and a headless Chromium browser:

- **Home menu** — desktop (1280×800) and mobile (390×844): renders
  correctly, inputs/buttons/map picker all styled and functional.
- **Settings dialog** — opens, all cards/toggles/sliders/segmented
  controls/keybinding grid render and respond.
- **Play Solo** — canvas game boots, HUD (health, ammo, kill counter,
  weapon-upgrade panel, minimap, medkits) renders and updates correctly.
- **Pause menu** — opens via the in-game pause button, themed buttons
  all present and clickable, at both desktop and mobile sizes.
- **Button-layout editor** — opens from the pause menu, themed panel
  renders over the live drag-to-position touch-control preview.
- **Scoreboard** — opens (hold Tab), themed card renders over gameplay
  without blocking input.
- **Loading splash** — shows on first paint, displays the vector art
  clearly, fades out automatically.
- Confirmed via a static ID-diff that every `id` attribute present in
  the original single file still exists somewhere in the project (the
  only "missing" ones are the old `<style id="…">`/`<script id="sfxdata">`
  wrapper tags, which no longer need an id now that their contents are
  real files — nothing in the game ever selected a stylesheet by id).
- The only console/network errors seen during testing were Google Fonts
  and Firebase CDN calls being blocked by the *test sandbox's* outbound
  network policy — not by anything in this project. Both will load
  normally once the project is hosted anywhere with normal internet
  access.

---

## If this project is picked up again later

Nothing here is required — the visual goal of this project is done —
but if there's appetite for more:

1. Re-skin the weapon-swap and crate-open popups to use the same amber
   palette as the rest of the UI instead of their current per-weapon
   HSL theming (would need care not to break their existing color-coded
   rarity/weapon-type system).
2. Split `js/game.js` into modules, as its own scoped refactor with its
   own test pass.
3. Vendor the two Google Fonts and the Firebase SDK locally for fully
   offline play.
4. Add light/alternate color themes using `theme-vars.css`'s token
   system (it's already structured so a second palette is a copy of
   that one file).

---

## Home screen = full-screen artwork (latest change)

- `assets/home-bg.jpg` (1983x793) is the whole home screen. It is stretched to
  fill the viewport (no gaps, nothing cropped).
- Real buttons sit invisibly on top of the painted ones. Positions live in
  `index.html` as `--x --y --w --h` in **artwork pixels**; `styles/home-image.css`
  converts them to % so they stay aligned at any screen size.
- Each button has a `.face` (a copy of its painted region) that is shown on
  hover / press and shrunk+dimmed for a "pressed" feel, plus a tap ripple
  (`js/home-fx.js`) and the existing click sound + haptic tick.
- `#nm` (callsign) sits on the top-right chip; `#rm` is the room-code field;
  `#acbl` shows "SIGN OUT" over the Google button when signed in.
- The ARENA / FORTRESS buttons are gone (kept hidden so game.js still binds);
  the map is picked at random on every load of the home screen (`selLv` in game.js).
- The old animated home canvas loop is no longer started.
- To move a button: edit its `--x/--y/--w/--h` (and `--clip` for the press shape).
- On a phone held upright the existing "rotate your phone" screen is shown.

---

## Room waiting lobby (latest change)

Create Room / Join Room no longer drop a player straight into a live match. Both now land
in a waiting room first:

- **Login-gated room creation.** "Create Room" requires Google sign-in (`ARA.hint()`); the
  button dims and shows a tooltip when signed out, and a clear toast appears if clicked
  anyway.
- **20 seats, 8 playable.** The lobby shows 20 seats (per spec), but the match's own netcode
  caps real matches at `MAXH` (8) — seats 9–20 render as visually locked/unavailable rather
  than being joinable. If the real cap is ever raised, only `MAXH` and the locked-seat check
  in `js/lobby.js` need to change.
- **Seats, not teams.** Players click any open seat to claim it; seats sync live for everyone
  in the room via a new `rooms/<CODE>/lobby/<id>` Firebase node (added alongside, not instead
  of, the existing `host`/`st`/`wd`/`in` nodes — nothing about the match's wire protocol
  changed).
- **Gmail avatar + host tag.** Each occupied seat shows the player's Google profile photo
  (`photoURL`, now carried through `login()`/`window.ARA.account()`) or an initials fallback
  if absent. The host's seat carries a red "HOST" banner.
- **Ready-up + host start.** Each player toggles READY; the host's START MATCH button only
  enables once every occupied seat is ready. Starting writes `rooms/<CODE>/lstart`, which
  every client (host included) watches to begin an identical 15-second "match starting"
  countdown, then hands off into the original `start(mode, room)` — gameplay itself is
  untouched.
- **Host-leave cleanup.** If the host leaves the lobby, the whole room is torn down (same as
  the existing host-disconnect behavior mid-match) and any players still waiting are bounced
  back to the home screen with a message, rather than being left in a dead lobby.

New files: `js/lobby.js`, `styles/theme-lobby.css`. Small additive edits to `index.html`
(lobby markup + script/link tags) and `js/game.js` (`photoURL` now carried in the login hint
and exposed via `window.ARA.account()` — two small, additive lines only).

**Not verified against a live Firebase project** (this environment has no outbound network).
The flow was instead verified with a headless-browser test harness that mocks the Firebase
Realtime Database/Auth SDK end-to-end — login, room create/join, seat selection, roster sync
across two simulated clients, ready-gating, the 15s countdown, host-leave cleanup, and the
handoff into the real match all passed. Worth a real-device smoke test once deployed, same as
any other change to this project per the testing note above.

---

## Full-screen button + auto full-screen (added)

- `index.html`: new `<button id="fsb" class="hs-fs">` inside `.hs-ui` (top, left of the profile plate).
- `home-image.css`: `.hs-fs` styles (gold octagon, true square at any aspect, expand/collapse icons).
- `fullscreen.js` (new, loaded after `home-fx.js`): toggles full screen from the button, keeps the icon in sync
  (`fullscreenchange`), hides the button where the browser has no Fullscreen API (e.g. iPhone Safari), and
  requests full screen **inside the click handler** of `#solo`, `#host`, `#join` (browsers require a real gesture).
  - `#host` is skipped while it has `.lob-locked-btn` (signed out) or is disabled.
  - `#join` is skipped until a 5-character room code is typed.
  - On phones, also tries `screen.orientation.lock('landscape')` once full screen is on.
- It does not touch game state; `game.js` / `lobby.js` are unchanged.

---

## Quality lock + mobile lobby fit (latest change)

**Blur on mobile Chrome — cause & fix (`game.js`).** The adaptive "90 fps governor" lowered the canvas
render scale (100% → 85 → 72 → 60 → 50%) and turned off glows/shadows whenever frames ran slow. Text is drawn
on the canvas, so it went blurry. `perfGov()` / `perfTier()` are now no-ops: render scale is always 1.0
(device pixel ratio, capped at 2) and shadows are always on. The FPS counter still works.

**FPS.** Frame rate is set by the display's refresh rate (`requestAnimationFrame`); a web page cannot force
120 fps. Nothing in the game caps it any more. For 120 fps on a phone: use a 120 Hz device, turn off
battery saver / "adaptive refresh" limits, and run in full screen.

**Lobby (`theme-lobby.css`).** Seats are always a fixed 10 × 2 grid (same as PC), stretched to the visible
height on short screens (`max-height:600px`) so all 20 seats show with no scrolling. Portrait phones get 5 × 4.
Locked seats are the same size as the others on every device.

---

## Waiting room + loading screen artwork (latest change)

Both screens are now full-screen artwork (1983x793, stretched to fill the screen like the home screen) with
real, live elements laid over the painted ones. Positions are in artwork pixels (`--x --y --w --h`).

- `lobby-bg.jpg` – waiting-room art. The placeholder text ("Player 01..20", "20 PLAYERS - GAME WILL START
  SOON", "START") was painted out so live data can be drawn there. Original upload kept out of the project.
- `loading-bg.jpg` – loading art with the painted "72%" bar fill removed; a real fill + % is drawn in the frame.
- Seats: the 20 painted frames (5 x 4). Seats 1-8 playable, 9-20 shown locked. Seat positions live in
  `SX/SW/SY/SH` at the top of the render section in `lobby.js`.
- Status strip (room code, players, hint) sits where the painted subtitle was; tap the code to copy it.
- EXIT = `#lob-leave`. The big gold button is `#lob-start` for the host and `#lob-ready` for everyone else.
- Behaviour change: the host no longer has to press READY. START enables once every NON-host player is ready.
- Loading bar: real checkpoints (`__cskProg(n)` between the script tags in `index.html`), creeps between them,
  hits 100% on window load, then fades out. 7 s safety timeout so it can never block play.
- The old lobby CSS (`.lob-wrap` etc.) was replaced; `theme-lobby.css` now also holds the loading-screen styles.

### Follow-up tweaks (waiting room)
- START needs at least 2 players (host + 1) and every non-host ready; alone in a room it stays disabled.
- Lobby shows the player's callsign (the name typed on the home screen) - never the Google name/Gmail. Only the
  Google profile picture is used from the account. (`myAccount()` in lobby.js)
- Avatar enlarged ~30% (covers the painted ring, has its own silver ring); HOST tag moved to the seat corner.

---

## Loading screen on every switch, host kick, callsign-only names (latest change)

**Loading screen (`loading.js`, markup `#csk-load` in index.html, styles in theme-lobby.css).**
Shown for Create/Join Room, lobby -> match, leaving the lobby, being kicked, host leaving, Play Solo.
`CSKLoad.show()` / `CSKLoad.hide({fast:1})` / `CSKLoad.around(fn)`. Min on-screen time 1.2 s (`MIN_MS`), 25 s safety close.
The tip painted into `loading-bg.jpg` was painted out; a live `.sp-tip` sits there instead. `CSKTips` rotates tips every
2.3 s from a shuffled bag (no repeats until all are shown; a new run never starts on the last tip). Edit the `TIPS` array
in loading.js to change the tip list. The first-boot splash uses the same rotator.

**Host kick.** Host sees a kick button on other players' seats (tap once = "KICK?", tap again = remove; hidden once the
countdown starts). Writes `rooms/<CODE>/kick/<key>` = server timestamp, keys = persistent device id (`csk-did` in
localStorage) and account uid. Kicked client is sent home; rejoin is blocked for `KICK_COOL` (120 s) by both the server
record and a local `csk-kick:<CODE>` flag. Enforcement is client-side: Firebase rules must allow writes to `rooms/<CODE>/kick`,
and a hard guarantee would need rules too.

**Callsign only.** `ARA.account().name`, the hidden account widget and the lobby now use the permanent callsign
(`ARA.callsign()`), never the Google display name/email. Only the profile photo comes from Google.

Tested with a mocked Firebase (two simulated clients): 34/34 checks. Not yet tested against live Firebase.

---

## Minimap removed, kick popup, waiting-room scenery, full screen at match start

- **Minimap removed entirely:** `<canvas id="mm">`, its settings row, its CSS, its draw code and the `mm` setting in game.js.
- **Kick = tap a profile.** The host taps another player's seat -> small popup (name + KICK OUT). Tap elsewhere / Esc closes it.
  Popup code is in lobby.js (`openPop` / `placePop` / `doKick`), styles `.lob-pop` in theme-lobby.css. The 120 s lockout is unchanged.
- **PC scenery (`lobby-fx.js`, `.fx-*` in theme-lobby.css):** knights marching along the bottom in 3 depth layers (far = small and
  heavily blurred, mid = softly blurred, near = sharp + glow), drifting fog, rising embers, bottom haze. Only on desktop
  (`hover:hover`, fine pointer, width >= 900px) and not with reduced-motion. Edit the `plan` array in lobby-fx.js to change knights.
- **Full screen at match start:** browsers only allow it from a tap, and the 15 s countdown is not one. So full screen is now requested
  on READY, START and a tap on the countdown overlay (fullscreen.js `CSKFullscreen`), plus once more when the match begins.
  If the browser is still windowed, the countdown shows "Tap anywhere for full screen".
  iPhone Safari has no Fullscreen API, so it cannot do this there.

---

## Low-latency netcode: direct WebRTC link (latest change)

**Problem.** Every packet went client -> Firebase (Singapore) -> host -> Firebase -> client: four long hops, 200-300 ms ping.

**Fix (`rtc.js`, new).** Clients now talk to the host directly over WebRTC data channels. Firebase is used only for the handshake and as an automatic fallback.
- `u` channel: unordered, no retransmits (snapshots `st`, inputs `in`). `r` channel: reliable (world data `wd`, `bye`, 500 ms keepalive).
- The link is opened in the waiting lobby (`CSKRtc.start()` from `attachRoom`), so it is already up when the match starts.
- `CSK_HybridNet` replaces `FirebaseNet` in `makeNet()`; same interface. A client whose direct link is down or silent >1.5 s sends inputs over both paths and accepts Firebase snapshots; the host starts writing Firebase `st` as soon as it sees a Firebase input, and stops 3 s after the last one.
- `game.js` edits (all small): `makeNet`; host snapshot rate 30 Hz on direct links with <=4 peers (20 Hz otherwise); client input rate 60 Hz on the direct link (30 Hz otherwise); interpolation floor 60 ms (was 90) on the direct link; positions rounded to 0.1 px and velocities to whole px/s on the wire (~35% smaller snapshots); ping readout shows "P2P" when direct. Simulation is untouched.

**Required Firebase rule** (signaling only): allow read/write on `rooms/$code/rtc`, e.g. inside your existing `rooms/$code` rule:
`"rtc": { ".read": true, ".write": true }`  (tighten to your auth model as needed). Without it the game still works, just over the old Firebase relay.

**Optional TURN.** Players behind symmetric / carrier-grade NAT (common on mobile data) cannot connect peer-to-peer with STUN alone and use the Firebase fallback. To help them, define `window.CSK_ICE_SERVERS` (STUN + your TURN credentials) before `rtc.js` loads.

**Tested:** real WebRTC loopback in headless Chromium with mocked Firebase signaling (2 clients + host: link up in ~100 ms, 100% of snapshots/inputs delivered, zero Firebase traffic while direct, forced link drop -> fallback to Firebase -> recovery) and a load/solo smoke test of the full project. Not tested against live Firebase or across real networks.

---

## Relay server tier (latest change) - for stable in-country latency

P2P cannot connect for many mobile users (carrier-grade / symmetric NAT), and they silently fell back to Firebase in Singapore (200-300 ms).
Tier order per client is now: **direct P2P -> in-region relay server -> Firebase**.

- `relay-server.js` (+ `relay-package.json`, `relay.Dockerfile`, `relay-fly.toml`, `RELAY-DEPLOY.md`; all files in this project are flat, no folders): a small Node WebSocket forwarder. Host is authoritative as before;
  the relay only forwards (client->host, host->all clients) and caches the last world-data packet for late joiners. Deploy it in your players' country.
- `rtc.js`: `WsRelay` client + 3-tier `HybridNet`. Configure `window.CSK_RELAY_URL` in `index.html` (or `?relay=wss://...`). The relay stays idle when P2P works.
- The in-match readout now ends with the active path: `P2P`, `RELAY` or `SLOW` (Firebase). Use it to diagnose.
- Tested locally (real WebSocket server + real WebRTC in headless Chromium, mocked Firebase): relay-only, P2P-only (relay idle), and Firebase-only fallback all pass,
  including late-joiner world data. Not tested on live networks.

---

## Battleground visual upgrade (v8) - `battle-fx.js`

The arena (floor, walls, pickups, bullets, particles, lighting) was dull; it is now fully re-painted by a new **draw-only** file, `battle-fx.js` (loaded before `game.js`). Gameplay, physics, netcode and the HUD logic are untouched.

**What changed**
- Floor: baked flagstone texture (bevels, cracks, inlays) + soft grass/sand/water colour patches and zone light pools (baked once per level into a 1/8-res map), animated rune rings, a royal emblem at the map centre, glowing zone names, drifting cloud shadows, an energy barrier at the map edge.
- Level 1 = emerald courtyard (teal stone, green grass, gold trim). Level 2 = violet wastes (plum stone, magma pools, magenta trim). Palettes live in `PAL` at the top of the file.
- Decor re-drawn: swaying grass, mossy rocks, rippling ponds / bubbling magma, flowering bushes / glow fungus, glowing crystals, floor sigils.
- Walls: raised 3D look (front face, lit top edge, brick texture, corner pillars, rivets), animated light-dash trim, and flickering braziers that light the area.
- Pickup pads get a coloured light pool (+ light beam for guns); coins glow and twinkle.
- Bullets are glowing comets; every shot has a muzzle flash, smoke puff and ejected shell casing.
- Hits, kills, pickups, dash, spawn, bomb blast, chest/upgrade: additive spark bursts, light flashes, shock rings, scorch marks on the ground (kills / bombs).
- Players: colour glow under each character, new health bar (trailing damage segment, low-HP pulse), outlined names, pop-in damage numbers.
- Screen: vignette, low-HP red pulse, hit flash, small camera "punch" zoom on your shots / hits / kills, ambient fireflies (L1) or rising embers (L2).

**Safety / performance**
- `game.js` calls `window.BFX` inside try/catch; if the file fails to load or throws, the original drawing code runs instead.
- Auto "lite" mode: if the frame rate stays under ~38 fps for 2.5 s, clouds, ambient motes and the big glow sprites switch off (resolution is never reduced, so text stays sharp). `PFQ.lq` also triggers the cheaper path.
- Tested in headless Chromium (software rendering, so absolute fps is not representative) at 1280x720 and 844x390, both levels, with no console errors. **Please test on a real phone.**

**game.js edits (all small):** hook call in `onEv`; `burst()` particles flagged as glow; render() wrapped so BFX draws floor/walls/pads/coins/bullets/players/rings/particles/texts/post-fx with the old code kept as fallback; `SZ` zoom-punch in the world transform; `BFX.reset()` in `start()`.

---

## v12 — New login screen + name/password setup

- `login.css`, `login.js`, `login-bg.jpg`, `login-btn-google.png`, `login-btn-go.png`, `setup-card.png`, `setup-btn.png` (new).
- `#login` markup added in `index.html` before the waiting-room lobby; shown whenever nobody is signed in.
- `game.js` `settleName()` now calls `CSKLogin.ask()` (popup) and `CSKLogin.ready()` (hides the login screen).
- Name: `users/<uid>/callsign` (written once). Password: Firebase Auth email/password credential linked to the Google account.
- Needs **Authentication -> Sign-in method -> Email/Password** enabled in the Firebase console.

---

## Random loading screens (latest change)

- The old `loading-bg.jpg` (single stretched art with painted bar) is **gone**. Replaced by four scenes, `loading-1.jpg` ... `loading-4.jpg`
  (1.0 = knights + castle, 2 = cave platformer, 3 = snow bridge, 4 = lava castle). They are the scene area only: the painted bar,
  "LOADING..." and % of the source panels were cropped off.
- A random scene is picked every time a loader appears (first-boot splash and every `CSKLoad.show()`), never the same one twice in a
  row (last pick kept in localStorage `csk-load-last`). The list + per-image focus point live in the `ART` array in `loading.js`.
  To add a scene: drop the jpg in, add it to `ART` (and to `ASSETS` in `asset-cache.js`).
- Fit: art is 2.5:1 and always covers the screen (`object-fit:cover`, no stretching, no bars). Screens narrower than 2.5:1 trim the sides
  around the focus point `x` set per image in `ART`.
- The bar, "LOADING..." label, % and tip are live HTML in a strip at the bottom (`loading.css`, which replaces the old loading rules in
  `theme-lobby.css`). Element ids are unchanged (`sp-fill/sp-pct/sp-tip`, `ld-fill/ld-pct/ld-tip`), plus new `sp-bg` / `ld-bg` for the art.
- `loading.js` now loads from `<head>` so the splash art can be chosen and preloaded immediately. `CSKAssets.url(name)` returns the cached
  blob URL of an asset (used so random scenes also load from the local cache).

---

## No auto level 2, always-full-screen (latest change)

- Winning a solo match no longer queues level 2. The end-screen button is always **BACK TO HOME** and goes home; the old
  `ar-auto` localStorage flag is no longer written (a stale one is cleared on load). Level 2 is still pickable manually (`#l2`).
- Full screen (`fullscreen.js`): the game goes full screen on the player's first tap/click/key after the page opens (browsers need a
  gesture). The game never exits full screen itself: the victory screen no longer calls `exitFullscreen` (removed in `victory.js`).
  Only the player can leave (full-screen button or Esc). That choice is remembered for the session (`sessionStorage csk-fs-off`) so
  Back to Home's page reload does not force it back on; the full-screen button turns it on again.
- Note: Back to Home still reloads the page, and every browser drops full screen on reload, so the first tap after returning home
  re-enters full screen.
