# Lightweight match art

The player shapes, jersey patterns, stadium shading and ball panels are original
procedural artwork in `art.js`. They use the existing Three.js renderer, with no
downloaded models, image files or new dependencies.

`PitchArt.playerGeometry()` builds nine shared geometries once: a shaped head,
jersey, shorts, leg, arm, hair, sock, boot and sleeve. They retain the existing
hip/shoulder pivots and instanced animation. Baked vertex colors provide depth
without runtime lights or shadow maps. Per-player skin colors and existing team
colors remain independent. Home kits have a chest band; away kits have a diagonal
sash. The previous repeated fictitious jersey numbers are removed.

The ball uses a 256x128 original ivory/navy panel texture and a modestly enlarged
visual radius of one unit. The simulation's ball position, collision and passing
rules are unchanged. Its ground shadow stays on the pitch when the ball rises.
The original player geometry remains available if optional art fails to load;
Canvas2D remains available too.

Matched 600px and native 390px phone scenes in both cameras use 59 draw calls,
unchanged from the previous build, and 31,370 triangles versus 29,510 previously.
The render buffer remains 600x600 at pixel ratio one. The new art path has no
scene lights; the legacy fallback retains its original lights. These are browser
measurements, not physical Meta Display performance results.

Verification evidence is outside the repository under
`../.visual-review/glasspitch-round2/art/`: actual live baseline images, matched
before/after scenes, 56 opposing team pairings, model buffers and gait, airborne
ball, stable cached resources, PRNG preservation, and fallback screenshots.
The supplied develop-web-game client also exercised movement and the action
button in an isolated local match. No personal saves or remote account data
were used.

Run the reusable art regression with `node tests/art.browser.cjs` while serving
the app locally on port 5261. Set `PITCH_URL` for another loopback address and
`PITCH_ART_EVIDENCE` to choose the output folder. The test uses an isolated
browser, blocks external requests, and restricts its target to loopback addresses.
It uses the game's existing public test hooks.
