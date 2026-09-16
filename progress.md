# Glass Pitch upgrade

Original prompt: Give Glass Pitch the same substantial graphics, UI, and controls overhaul as the tabletop games. Preserve lightweight 600×600 Meta Display and native phone support, saves, and game rules. Verify controls, complete matches, persistence, and screenshots. Do not publish from this task.

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

## September15,2026 — Follow-up controls and production repair

User reports GlassPitch looked unchanged on glasses and controls prevented entering a match; requests latest GitHub and the same depth of improvements as Glass Spire. Clean local main already matches origin/main8b4eaff after fetch. Current production files match that release, so investigation includes actual focus/input failures rather than assuming missing deployment. Preserved exact pre-change sources under ../.visual-review/glasspitch-round2/before; local updated5261/frozen5262.

Confirmed entry traps: Up/Down can put focus on Back, Difficulty or a team arrow; Left/Right changes the displayed team without resetting focus, so pinch backs out or changes another setting rather than confirming. Held Enter repeats can skip several setup screens. Root changes make focus synchronous/current-screen, return confirmation focus after team changes, filter repeat activations, and add immediate Play Now. In-match directional input restores context-action focus. Controllers now pause/resume with Start rather than accidentally taking a penalty, sample all button edges and clear disconnected state; phone controls cannot accidentally trigger the glasses pause chord.

Parallel bounded work: persistence/competition identity and penalty-shootout recovery; original low-cost shaded player/ball art and kit readability; title/team UI and complete glasses/touch start-path verification. Scope includes publishing the repaired game to its existing production URL after integrated checks. Saves, origin and competition rules must be preserved.

### Follow-up delivered

- One-activation Play Now plus optional two-stage team selection, explicit confirmation labels, synchronous visible focus, no repeated Enter/Escape activation, and compact club cards that clear the header/actions at600px and native390px phone sizes.
- Controller Start pauses/resumes matches and penalties; B backs out, held/disconnected buttons reset correctly. Moving restores gameplay action focus, with no extra per-frame layout work. Touch/controller steering is separate from the glasses pause chord; Watch defaults to its visible Menu control.
- Penalty aim/result/winner states now survive Continue and settle once. Captured competition identity prevents a prior fixture mutating a replacement season/cup; unrelated saves remain. Knockout bracket scores follow the displayed team order.
- Original shaped/instanced players with baked shading, distinct home/away kit patterns and a clearer ivory/navy ball. Matched scenes retain59calls, with31,370triangles versus29,510 before; fixed600buffer,DPR1 and no runtime lights/shadows in the art path. Canvas2D/missing-art fallbacks remain.
- Tutorial skip/completion/background cannot overwrite a saved match with practice state. Practice clears old spectator state; controller and pitch-drag steering advance lessons on distinct input starts.
- Runtime-only static build includes8files, normalizes line endings for reproducible versioning, updates HTML/CSS/manifest/dynamic Three dependencies and emits checksums. Publish path isdist; tests, fixtures and source tools are excluded. Storage keys and production origin stay unchanged.

### Follow-up verification and release

Entry84, controls11, lifecycle58, legacy48+31, tutorial15 and art5 browser checks pass on isolated local profiles; art also has15 matched-scene checks. Supplied game client was run after meaningful changes, and real gameplay/menu/mobile/penalty/tutorial screenshots were opened. Complete fixture schedules were tested with controlled results; this does not claim a real-time multi-season playthrough or a physical glasses test.

Production baseline8b4eaff was captured in a disposable persistent browser profile before deployment, including a real saved match and changed settings. Root owns final built-package regression, GitHub main push, exact-commit Render deployment and post-release saved-profile/fresh-browser validation. Release evidence is under ../.visual-review/glasspitch-round2/release. No known blocking defects remain in the verified paths; physical hardware performance/input confirmation remains the practical follow-up.

## September 15, 2026 — Neural Band menu focus and Back repair

User reports pinching unexpectedly changes menus and Back tries to exit; clarified that the pinch problem occurs on setup/pause screens. Fetched origin/main; clean local f6decfde46c50d3d095c8b11145681bdcc0e3ea0 was already current. Exact tracked baseline is preserved in ../.visual-review/glasspitch-input/before (5272); updated source preview is 5271.

Confirmed against production using actual DOM-focused, coordinate-free clicks: substitution redraw always selected header Back; explicit team-carousel clicks always moved focus to Confirm; native browser Back bypassed in-app navigation. Returning to menus also discarded the opener, and opponent/lineup Back skipped setup stages. Official Meta gesture guidance confirms focused-element activation through Enter/click; no reliable contract promises that host/system exit emits a cancellable web event.

Fixed semantic focus preservation, safe bench/roster/Auto-subs selection, cancel restoration, repeatable carousel activation, current-screen Enter/Space activation, and opener restoration. Setup Back now revisits the previous selection. A bounded same-document history entry handles browser Back: play to pause, nested menus one step back, pause to saved title, title to the prior document. Escape resumes from pause. BrowserBack/GoBack/Backspace and Alt+Left use the browser Back route; held keys do not skip steps. No new per-frame work, libraries, or graphics assets.

Both pause menus offer Save & Return to Title. Saving is restricted to active match screens, so title pagehide cannot overwrite a parked shootout/free-kick with stale regulation state. Pending mini-game timers stop on exit; Continue restarts the saved phase. Save occurs before clearing spectator control. Independent review found cancelled Watch setup could leave Play Now AI-controlled; new matches reset control, while restarting or restoring an explicitly manual/spectator match preserves that choice, including legacy Watch saves.

Final validation: entry87, controls11, lifecycle58, legacy48+31, tutorial15, art5 and neural-navigation67 pass (322 checks). The neural suite delivered 288 genuine focused detail-0 clicks at 600×600 and real-touch 390×844, with no runtime errors or external requests. The earlier 47-case baseline run failed 37 cases as expected. Independent review added eight passing checks of manual/spectator choice through restart and reload; 100 layout/navigation states had no clipped selected targets. The original entry suite changed only for intentional behavior: held Back returns one setup stage, and touch team arrows remain selected until explicit Confirm.

Ran the supplied game client after runtime changes and opened its actual gameplay screenshots/text. Opened focused bench/roster/team screenshots at both sizes. Runtime-only build 5d8f61c1cdf78118 passes six package checks, including all eight manifest hashes, versioned assets, setup/kickoff/native Back, bench focus and saved Continue; packaged screenshots were inspected. Evidence: ../.visual-review/glasspitch-input/{regressions.json,client-gameplay,package-check} and ../.visual-review/glasspitch-band-audit/{final-controls,DIFF-REVIEW.md,CONTROLS-VERIFICATION.md}. No production publishing or GitHub push in this repair task; physical Meta Display input confirmation remains a device follow-up. Native system exit without a web event is outside the page's control.

### Approved production release

User approved publishing the reviewed band-control fixes. Release targets existing LiquidAzir/glasspitch main and https://glasspitch.onrender.com, with the same storage keys and production origin. Render is already configured to build the eight-file runtime-only dist with revalidating cache headers. Release evidence and completion status will be recorded in ../.visual-review/glasspitch-input/release/; verification includes exact live asset hashes, fresh input flows and a disposable cached profile carrying a pre-upgrade saved match. Runtime release fingerprint remains 5d8f61c1cdf78118.
