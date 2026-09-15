# Glass Pitch

Holographic arcade soccer for **Meta Ray-Ban Display** glasses. Vanilla HTML/CSS/JS, 600×600, dark/additive-display theme, D-pad (swipe) + pinch (tap) controls.

## Play

- **Swipe ← ↑ → ↓** — steer the player with the cyan ring and pointer. Directions follow the selected camera. With possession you keep dribbling; off the ball, hold a direction or swipe again to keep moving.
- **Pinch (tap / Enter)** — one context button. The chip at the bottom of the screen always shows what it does:
  - **PASS** — slide the ball to the best teammate ahead.
  - **SHOOT** — when you reach shooting range; steer first to aim the corner (away from the keeper).
  - **TACKLE** — when defending and near the ball.
  - **SWITCH** — when far from play, pick the next presser.
- **Menu**, **↑↓↑↓**, or **Esc** — pause. Keyboard Tab also reaches Menu; Enter and focused-button click behave consistently.

Control stays with your defender until you switch; it moves to your carrier on gaining possession and to the receiver only after a pass is caught. Teammates and keepers run automatically. Sprint is disabled. Phone controls use native touch targets and menus.

## Features

- 8 fictional teams with distinct kits and ATT/MID/DEF/PAC/GK ratings.
- Full pitch (always on screen — no scrolling camera), 4-3-3 formations, role-based AI for both teams.
- Two halves with a match clock, goals, throw-ins, corners, goal kicks, light fouls, possession/shots stats.
- Difficulty (Easy/Normal/Hard/Pro) and half length (Short/Normal/Long); local W-D-L record, career and tournaments.
- Original procedural stadium, grass and kit details; batched geometry, 600px render buffer, DPR 1 and no real-time shadows.
- Existing `glasspitch_v1` and v3 `glasspitch_match_v1` saves remain compatible. Goal celebrations, halftime, free kicks, player attributes and match statistics survive Continue. Standalone penalty shootouts are not persistent saves.

## Develop / test

Serve this directory over HTTP (the local Three.js module needs a web origin); arrows/WASD + Enter/Space drive it. Touch controls appear on phones and can be enabled in Settings.

The match loop is gated to the match screen. Because `requestAnimationFrame` is throttled in headless previews, the simulation is also driveable directly:

```js
__pitch.start('sol', 'vrd');   // kick off Solaris vs Verde
__pitch.nav('match');         // skip the lineups in a test fixture
__pitch.hold();               // stop animation loops for deterministic checks
__pitch.simulate(30);         // advance 30 real seconds of match simulation
__pitch.steer('left'); __pitch.tap();   // aim + act as the active player
__pitch.score();               // "SOL 1 – 0 VRD"
```

`render_game_to_text()` summarizes visible match state; `advanceTime(ms)` advances the same simulation while respecting pause/halftime, including set-piece timing. Browser regression suites:

```sh
node tests/browser.cjs
node tests/edges.browser.cjs
```

Set `PITCH_URL`, `PITCH_EVIDENCE` and `PLAYWRIGHT_PATH` as needed. Defaults target local port 5223 and the installed development Playwright package. Tests use isolated browser contexts and block non-local requests. The suites cover 79 checks, including five full simulated matches, both camera/half direction projections, pause/background behavior, throw-ins, goals, free kicks, legacy saves and 390px mobile layout. Physical glasses performance still needs device confirmation; software-GPU timing is not a device benchmark.

## Deploy (Render)

Static site — `render.yaml` is included. Point a Render Static Site at this folder (publish path `.`), deploy, and add the resulting HTTPS URL to the glasses via the Meta AI app → Devices → Display Glasses → Web apps. Any HTTPS static host works.
