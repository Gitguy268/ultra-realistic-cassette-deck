# Progress

Plan: `~/.claude/plans/14-cassette-deck-a-generic-resilient-goose.md`. Built from
Gitguy268/ultra-realistic-vinyl-player (branch fix/typescript-peer-conflict) in
`~/ultra-realistic-cassette-deck` (the Sandisk drive was unmounted).

| Gate                 | State                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------- |
| 1 Scaffold           | Done 2026-11-17                                                                           |
| 2 Spec and core      | Done: spec/deck.ts (+json), core/{tape,program,transport,wear,door}.ts, unit tests        |
| 3 Worklet            | Done: audio/tape/{dsp,chain}.ts, tape.worklet.ts; reference.test.ts holds NR per band     |
| 4 Scene              | Done: scene/deck/{build,pose}.ts and materials; 139 draw calls                            |
| 5 Interaction and UI | Done                                                                                      |
| 6 Sounds and details | Done: mechanism sounds, wind whine, full-resolution window pass                           |
| 7 Browser checks     | Done: 23/23 in Chromium; transport, tape, modes in Firefox and WebKit; 60 fps with vsync  |
| 8 Docs and assets    | Done: README, CHANGELOG, DECISIONS, PARITY (30/30), REFERENCE, NOTICE, icons, shots, demo |
| 9 Publish            | Done 2026-11-18: repo, Pages, Vercel, rolling release, portfolio card                     |

## Notes

- The "wow and flutter off" jitter seen once was the check's own capture window reaching back
  before the switch; with a settled tape the period is steady to 1e-13 samples.
- Under heavy machine load the GPU stalls page loads for minutes; the harness allows 120 s.
- Rolling release: `~/rolling-release/custom/ultra-realistic-cassette-deck.yml` (the Pages site and
  the one-file build as `ultra-realistic-cassette-deck.html`); regenerate with gen.py.
- Dev: `npx vite --port 4195` with `node .scratch/shot.mjs "view=hero" out.png`.

## Published 2026-11-18

- Repo: https://github.com/Gitguy268/ultra-realistic-cassette-deck (public; topics set)
- Pages: https://gitguy268.github.io/ultra-realistic-cassette-deck/
- Vercel: project gitguy268-ultra-realistic-cassette-deck, deployed with the CLI from `git archive
HEAD` (`--archive=tgz`); Vercel authentication turned off (`vercel project protection disable
--sso`); https://gitguy268-ultra-realistic-cassette-deck.vercel.app added as a domain (the
  automatic alias was truncated to gitguy268-ultra-realistic-cassette.vercel.app).
- Rolling release `latest`: the web zip and `ultra-realistic-cassette-deck.html`.
- Portfolio: card in Players, docs page in the reel look, count 52.
- Dependabot opened 5 PRs; their first CI runs failed on the then-unformatted release workflow,
  and version bumps also need NOTICE updated (tests/notice.test.ts). Left for the owner to merge.
