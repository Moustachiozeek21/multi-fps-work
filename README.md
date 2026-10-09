# TAC FPS — private-lobby browser shooter

A small real-time multiplayer FPS starter built with Three.js, Express and Socket.IO. It includes private six-character join codes, a 12-player cap, FFA/TDM rules, mouse-look and pointer lock, WASD/sprint/jump, three arcade weapon profiles, server-side hit checks, respawns, a live scoreboard, frag feed, and ten-minute matches.

## Run locally

Requires Node.js 20+ and npm.

```bash
npm install
npm start
```

Open http://localhost:3000 in a modern desktop browser. Create an FFA or TDM lobby, then share the displayed join code with other players on the same server. For testing on the same Wi-Fi, find the host computer's LAN IP and have others visit `http://HOST-LAN-IP:3000`. Allow inbound TCP port 3000 through the host firewall.

## Host it so coworkers can join remotely

Use a Node-capable host such as Render, Railway, Fly.io, or a small VPS. Deploy this folder as a Node web service:
- Build/install command: `npm install`
- Start command: `npm start`
- Set `NODE_ENV=production` if desired.
- The service must support long-lived WebSocket connections. Socket.IO falls back to HTTP polling, but WebSockets are preferred.
- Use the HTTPS URL provided by the host; browser pointer-lock works on localhost and secure contexts.
- Keep the service running: rooms live in memory, so restarts clear lobbies and all players must rejoin. For one small private coworker group, one server instance is simplest. Do not scale to multiple instances without adding a shared Socket.IO adapter and shared room state.
- Share the public game URL and the six-character code, not a separate invite URL. Only people with the code can join a room, but this is not authentication; do not expose it publicly if you want the room to stay private.

## Controls

- Click the canvas to capture the mouse; Escape releases it.
- WASD move, Shift sprint, Space jump, mouse aim, left-click fire.
- 1 rifle, 2 shotgun, 3 rocket profile.
- Scoreboard columns are kills and deaths; TDM assigns alternating Alpha/Bravo teams.
- Match starts when a second player joins; match timer is ten minutes. Empty rooms are removed.

## Important limitations / production hardening

This is a playable prototype, not a competitive anti-cheat-ready service. It uses server-side hit validation and movement bounds, but the server currently accepts client-reported positions, so a determined client can cheat. It uses in-memory room state and a simple ray-vs-player check (no server-side map collision), and weapon types differ mainly in damage/fire rate. TDM team scores are tracked server-side but the current HUD scoreboard lists individual stats. For a public deployment, add authentication/rate limits, authoritative movement and map collision, persistent/adapter-backed room state, reconnection handling, abuse monitoring, and automated tests. Use a single server instance for the included implementation.

## Files

- `server.js` — Socket.IO rooms, match clock, combat and respawns
- `public/index.html` — menu and HUD
- `public/game.js` — Three.js arena, controls, remote players, effects
- `public/style.css` — tactical UI styling
