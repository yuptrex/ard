# Deploying the CSuperKnights relay (5 minutes)

The relay is a tiny WebSocket forwarder. Put it in the SAME country as your players (India: Mumbai / Delhi / Bangalore).
Your site is https, so the relay must be reachable as **wss://** (TLS). Fly.io below does that for you.

## Option A - Fly.io (Mumbai region `bom`)
Put these 4 files in one folder (or a separate GitHub repo): `relay-server.js`, `relay-package.json`, `relay.Dockerfile`, `relay-fly.toml`.
```
fly auth login
fly launch --no-deploy --copy-config -c relay-fly.toml    # pick a unique app name
fly deploy -c relay-fly.toml
```
Your relay address is `wss://<app-name>.fly.dev`. Check `https://<app-name>.fly.dev/health` shows `ok 0 rooms`.

## Option B - any VPS with an India region (AWS Mumbai, DigitalOcean Bangalore, Oracle Mumbai, ...)
```
cp relay-package.json package.json && npm i && PORT=8080 node relay-server.js      # run under pm2/systemd
```
Put Caddy or nginx in front for TLS (`reverse_proxy localhost:8080`, WebSocket upgrade is automatic in Caddy).

## Connect the game
In `index.html` set `window.CSK_RELAY_URL="wss://<app-name>.fly.dev";`
(For a quick test without editing: open the game with `?relay=wss://<app-name>.fly.dev`.)

Optional: `ALLOWED_ORIGINS=https://your-site.web.app` env var restricts which sites may use your relay.

## Check it works
Join a room: the readout at the top of the match shows `ROOM ABCDE - 2 online - 35 ms - P2P | RELAY | SLOW`.
- `P2P`   direct link (best)      - `RELAY` through your server (stable, in-country)
- `SLOW`  Firebase fallback (Singapore) - if you see this, the relay URL is wrong/unreachable or blocked.
