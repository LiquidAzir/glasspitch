# Glass Pitch upgrade

Original request: Give Glass Pitch the same substantial graphics, UI, and controls overhaul as the tabletop games. Preserve lightweight 600×600 Meta Display and native phone support, saves, and game rules. Verify controls, complete matches, persistence, and screenshots. Do not publish from this task.

## Baseline
- Main d0d73a053ff1b795f8d5aa365244dab88959232e; clean at start.
- Existing local Three.js renderer uses instanced players and a fixed 600px render buffer.
- Auditing existing v3 match saves and all actual input paths before changes.
- Evidence: ../.visual-review/next-trio/glasspitch/.

## Delivered
- Broadcast club identity, compact native phone menus, complete pitch framing, procedural grass and stadium, instanced player hair/boots/socks/kit panels, distinct keeper kits, cyan player ring/pointer, goal net depth, and matching penalty/free-kick canvas scenes.
- Context action and Menu are real focusable buttons. Enter and coordinate-free focused clicks agree. D-pad pause chord, Tab focus containment, default real-action focus, restart confirmation and >=44px phone controls verified.
- Fixed endlessly alternating touchline restarts; near-ball pinch now actually tackles; menu/halftime updates stop; backgrounding clears input and pauses; goal/restart/halftime/set-piece saves resume safely; career boosts no longer compound with Continue; full-time records award once; stale match commentary resets.
- Mini-game action controls and pause now work with focused clicks, including delayed results. Free-kick timing uses elapsed time rather than frame count.
- Existing local save keys and v3 format preserved with optional new metadata. No downloaded art, new library, dynamic shadow or increased render resolution.

## Validation / evidence
- `tests/browser.cjs`: 48 checks, including five complete AI matches and real 600px/390px phone paths.
- `tests/edges.browser.cjs`: 31 checks, including all 16 camera/half/direction combinations, safe corners/goals, paused draw count, penalty pause and set-piece save/reload.
- Required skill client run and actual match screenshot inspected: ../.visual-review/next-trio/glasspitch/client-final/.
- Before/after 600px and phone images: ../.visual-review/next-trio/glasspitch/{before,after}/. Final menus in tests/; both cameras and mini-games in edges/.
- Typical final view ~60 draw calls /29.6k triangles versus baseline32/20.9k, fixed600x600,DPR1, no shadow maps. Renderer and match simulation stop while paused. Existing tiny gamepad polling callback remains available to discover/controllers; no idle scene rendering.
- Screenshots and tests use Chromium SwiftShader. Actual Meta Display hardware testing remains for the device; no exhaustive claim for every multi-season career branch.
- No commit, push or deployment by this task. Root owns release.
