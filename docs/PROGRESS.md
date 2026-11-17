# Progress

Plan: `~/.claude/plans/14-cassette-deck-a-generic-resilient-goose.md`. Built from Gitguy268/ultra-realistic-vinyl-player
(branch fix/typescript-peer-conflict) in `~/ultra-realistic-cassette-deck` (the Sandisk drive was unmounted).

| Gate                 | State                                                                                                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Scaffold           | Done 2026-11-17: vinyl-only modules removed, verify pieces green                                                                                                                                                                                                            |
| 2 Spec and core      | Done: spec/deck.ts (+json), core/{tape,program,transport,wear,door}.ts, tests                                                                                                                                                                                               |
| 3 Worklet            | Done: audio/tape/{dsp,chain}.ts, worklets/tape.worklet.ts; reference.test.ts holds NR per band to [S3]                                                                                                                                                                      |
| 4 Scene              | Done: scene/deck/{build,pose}.ts, materials/{deck-materials,printing,cassette-label}.ts                                                                                                                                                                                     |
| 5 Interaction and UI | Done: deck.ts, app.ts, stage.ts, deck2d.ts, index.html; func smoke (.scratch/func.mjs) green                                                                                                                                                                                |
| 6 Sounds and details | Mechanism sounds + wind whine done; detail passes open                                                                                                                                                                                                                      |
| 7 Browser checks     | In progress: new check-transport (28/28), check-reverse (11/11), check-tape (9/10: wow-flutter-off jitter open); vinyl audio/deck/parts/sfx/label/details checks set aside in .scratch/old-checks; the other vinyl checks still need porting; check-all.js list not updated |
| 8 Docs and assets    | REFERENCE.md done; README, CHANGELOG, DECISIONS, PARITY, icons, og, screenshots, demo open                                                                                                                                                                                  |
| 9 Publish            | Open                                                                                                                                                                                                                                                                        |

Verified by hand in Chromium: demo plays, music search, cue at 7×, hiss −76.5 dBFS (NR B) vs −68.3 (off),
auto-reverse, eject/take out/turn over, power, no reload on queue changes, single file from file://,
Pages subpath (/ultra-realistic-cassette-deck/): demo, service worker scope, icons.

Dev: `npx vite --port 4195` + `node .scratch/shot.mjs "view=hero" out.png`; `node .scratch/func.mjs`.

## Open finding (2026-11-17, end of session)

check-tape's "wow and flutter off" case still measures ~0.14 % pitch jitter. `.scratch/wf.mjs` showed the
tape rate at 0.06 (engine source playbackRate clamped to 0.0625) a few seconds after Play on a fresh
library (one 40 s track, selectTrack + windTo + play): the transport is not at speed there. Look at the
interaction of selectTrack(…, false) → stop, windTo, and Play's engage, before trusting the jitter number.

## Left to do

- Finish porting the browser checks; update scripts/check-all.js; PARITY.md + check-parity.js.
- README (house style), CHANGELOG, DECISIONS, CONTRIBUTING/SECURITY wording, NOTICE (no-affiliation line),
  favicon/icons/og.png (scripts/render-assets.js), screenshots, demo.webp.
- Firefox/WebKit spot run; `npm run verify` as a whole.
- Publish: gh repo create, push, Pages, Vercel (gitguy268-ultra-realistic-cassette-deck, --archive=tgz),
  rolling release via ~/rolling-release gen.py with the single index.html, README live links, portfolio card.
