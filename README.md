# Glass Pitch

Holographic arcade soccer for **Meta Ray-Ban Display** glasses. Vanilla HTML/CSS/JS, 600×600, dark/additive-display theme, D-pad (swipe) + pinch (tap) controls.

## Play

- **Swipe ← ↑ → ↓** — steer the highlighted player. They auto-run, so you only steer.
- **Pinch (tap / Enter)** — one context button. The chip at the bottom of the screen always shows what it does:
  - **PASS** — slide the ball to the best teammate ahead.
  - **SHOOT** — when you reach shooting range; steer first to aim the corner (away from the keeper).
  - **TACKLE** — when defending and near the ball.
  - **SWITCH** — when far from play, pick the next presser.
- **↑↓↑↓** (or **Esc** on desktop) — pause.

Control auto-switches to the player nearest the action; teammates make runs, mark up, and your keeper saves on its own.

## Features

- 8 fictional teams with distinct kits and ATT/MID/DEF/PAC/GK ratings.
- Full pitch (always on screen — no scrolling camera), 4-3-3 formations, role-based AI for both teams.
- Two halves with a match clock, goals, throw-ins, corners, goal kicks, light fouls, possession/shots stats.
- Difficulty (Easy/Normal/Hard) and half length (Short/Normal/Long) in Settings; record (W-D-L) persisted in `localStorage`.

## Develop / test

Open `index.html` in a browser; arrow keys + Enter drive it. Enable **Touch Controls** (Settings or pause menu) for an on-screen D-pad.

The match loop is gated to the match screen. Because `requestAnimationFrame` is throttled in headless previews, the simulation is also driveable directly:

```js
__pitch.start('sol', 'vrd');   // kick off Solaris vs Verde
__pitch.simulate(30);          // advance 30 sim-seconds and render a frame
__pitch.steer('left'); __pitch.tap();   // aim + act as the active player
__pitch.score();               // "SOL 1 – 0 VRD"
```

## Deploy (Render)

Static site — `render.yaml` is included. Point a Render Static Site at this folder (publish path `.`), deploy, and add the resulting HTTPS URL to the glasses via the Meta AI app → Devices → Display Glasses → Web apps. Any HTTPS static host works.
