# Glass Pitch

Holographic arcade soccer for **Meta Ray-Ban Display** glasses. Vanilla HTML/CSS/JS, 600×600, dark/additive-display theme, D-pad (swipe) + pinch (tap) controls.

## Play

- **Play Now** starts an exhibition immediately. **Choose Teams** lets you pick both clubs before Kick Off. In team selection, left/right changes the club and returns focus to the confirmation button; up/down selects other controls. Pinching a carousel button keeps it selected for repeated changes. Back from the opponent step returns to your team; Back from the line-ups returns to the opponent.
- **Swipe ← ↑ → ↓** — steer the player with the cyan ring and pointer. Directions follow the selected camera. With possession you keep dribbling; off the ball, hold a direction or swipe again to keep moving.
- **Pinch (tap / Enter)** — one context button. The chip at the bottom of the screen always shows what it does:
  - **PASS** — slide the ball to the best teammate ahead.
  - **SHOOT** — when you reach shooting range; steer first to aim the corner (away from the keeper).
  - **TACKLE** — when defending and near the ball.
  - **SWITCH** — when far from play, pick the next presser.
- **Menu**, **↑↓↑↓**, or **Esc** — pause. Keyboard Tab also reaches Menu; Enter and focused-button click behave consistently.
- Menus keep the selected control after changing a setting. Substitutions select a replacement player, then return to the roster; Cancel/Back restores the outgoing player. Returning from a submenu or confirmation restores its opening button.
- **Browser Back** pauses live play, backs out of nested menus one step, then saves and returns to the title from the pause menu. Another Back at the title can leave the site. **Esc** closes pause to resume; **Save & Return to Title** is also available in both match and penalty/free-kick pause menus. The native-history guard uses one extra same-URL entry, including across reloads. A host-level system exit that sends no web event cannot be intercepted by the page.
- On a controller connected to the device running the browser, use the stick/D-pad to steer, A for the action and B/Start to pause; Start resumes. Controller and phone directional input do not trigger the glasses pause gesture.

Control stays with your defender until you switch; it moves to your carrier on gaining possession and to the receiver only after a pass is caught. Teammates and keepers run automatically. Sprint is disabled. Phone controls use native touch targets and menus.

## Features

- 8 fictional teams with distinct kits and ATT/MID/DEF/PAC/GK ratings.
- Full pitch (always on screen — no scrolling camera), 4-3-3 formations, role-based AI for both teams.
- Two halves with a match clock, goals, throw-ins, corners, goal kicks, light fouls, possession/shots stats.
- Difficulty (Easy/Normal/Hard/Pro) and half length (Short/Normal/Long); local W-D-L record, career and tournaments.
- Original procedural stadium and shaped players with baked shading, distinct home/away kit patterns and a higher-contrast ball; batched geometry, 600px render buffer, DPR 1 and no real-time lights or shadows in the art renderer.
- Existing `glasspitch_v1` and v3 `glasspitch_match_v1` saves remain compatible. Goal celebrations, halftime, free kicks, player attributes, match statistics and penalty shootouts survive Continue. Replacing a competition invalidates only that competition's saved fixture, and completed tie-breaks settle once.

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
node tests/entry.browser.cjs
node tests/controls.browser.cjs
node tests/neural-navigation.browser.cjs
node tests/lifecycle.browser.cjs
node tests/tutorial.browser.cjs
node tests/art.browser.cjs
```

Set `PITCH_URL`, `PITCH_EVIDENCE` and `PLAYWRIGHT_PATH` for your local server, evidence directory and Playwright installation. Tests use isolated browser contexts and block external requests. The suites cover entry and focus, phone/controller input, five full simulated matches, both camera/half direction projections, pause/background behavior, goals, free kicks, legacy saves and complete competition fixture schedules. Physical glasses performance still needs device confirmation; software-GPU timing is not a device benchmark.

## Deploy (Render)

Static site — `render.yaml` is included. Run `node scripts/build-static.cjs` and publish `dist`. The build includes only eight runtime files, versions every asset dependency (including Three.js), and emits `release.json` with checksums. Keep HTML/assets revalidating through the configured cache header. The existing production URL is https://glasspitch.onrender.com/; it stays the same for installed web apps. Tests, development tools and fixtures are excluded from the published directory.
