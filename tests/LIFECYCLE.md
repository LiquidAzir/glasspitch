# Match and competition persistence

Run `node tests/lifecycle.browser.cjs` with `PITCH_URL` pointing to the local preview. `PLAYWRIGHT_PATH` and `PITCH_EVIDENCE` can override dependency/evidence paths. All contexts are disposable and external requests are blocked.

The second-round audit reproduced these defects against immutable commit8b4eaff:

- A tied knockout cleared the match save before penalties. Shootout progress could not be saved, including from its pause menu.
- Replacing Cup, League, Career or World Cup left a resumable match from the previous competition. Finishing that old match applied its result to the replacement competition.
- A user's knockout score was reversed in the bracket whenever their club occupied the second bracket position.

The fix preserves the existing storage keys and v3 regulation snapshots. New snapshots capture the competition identity, round/season and fixture when the match starts. Legacy snapshots without that marker still resume when their clubs match the current unplayed fixture. A reset invalidates only its corresponding competition; unrelated Friendly or other competition saves remain available.

Shootouts use a v3 `kind:shootout` envelope with penalty state and, for competition ties, the regulation snapshot. Aim, scored-kick presentation and decided-winner states persist. Continue resumes the appropriate pending presentation and applies the competition result once. Standalone penalties need no regulation teams. The selector uses the explicit `standalone` context; the previous boolean was already recognized and was not a separate reproduced defect.

Final validation: **58 lifecycle checks**, plus the existing **48 browser and31 edge checks**. Fixtures finish all3Cup,14League,14Career and5WorldCup matches to exercise progression without claiming a full real-time campaign playthrough. Real DOM controls cover Continue, selector, penalty action and pause. Both bracket positions are checked, as are legacy migration, stale same-team snapshots, exact score/context restoration and preservation of unrelated Friendly saves.

The existing Career-boost test now creates a real Career fixture through `careerAdvance()` instead of relabelling an unrelated Friendly; repeated Continue must retain the same boosted player attributes.

Evidence: `.visual-review/glasspitch-round2/systems/lifecycle-report.json`, `baseline-findings.json`, `competitions-baseline.json`, `shootout-continued.png`, and `client/`. The supplied develop-web-game client was run and its screenshot/text state were opened and inspected. Syntax and `git diff --check` passed. No commits or deployment by this agent.
