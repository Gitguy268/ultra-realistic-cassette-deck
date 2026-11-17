# Contributing

Thanks for helping. By taking part you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

```sh
npm ci
npm run dev
```

## Before you open a pull request

```sh
npm run verify
npm run check:links
npm run check:browser
```

## Code style

- TypeScript strict mode, explicit types, no `any`.
- Pure logic goes in modules with no DOM or Web Audio dependency and gets a
  Vitest unit test in `tests/`. Engine, UI and worklet code stays thin.
- No `console.log`, commented-out code, or task markers in committed code.
- Dependencies are exact-pinned and listed in [NOTICE](NOTICE); a unit test
  fails otherwise. Add one only with a clear reason, and prefer MIT, BSD,
  Apache-2.0, ISC or OFL licences.
- Derive numeric test expectations with a throwaway script before writing
  them, and keep test helpers in the same units as the code under test.
- No runtime requests to other origins. Fonts are self-hosted.
- Every control is keyboard-operable with a visible focus ring and an
  accessible name. Every animation respects `prefers-reduced-motion`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), checked
by commitlint in CI. Keep the subject lowercase and each commit small, with the
tree building and tests passing. Wrap body lines at 100 characters. Never
commit secrets, `.env` files or personal data.

## Manual tests

Automated checks run in headless Chromium and cannot hear. After a change to
audio, pointer handling, storage or the service worker, run the relevant steps
by hand on a production build (`npm run build && npm run preview`).

### Browser matrix

Fill in a row per browser you tested and paste it into the pull request.

| Browser                | Transport | Hiss and NR | Keyboard | Import | Offline | Reduced motion |
| ---------------------- | --------- | ----------- | -------- | ------ | ------- | -------------- |
| Chrome (desktop)       |           |             |          |        |         |                |
| Edge (desktop)         |           |             |          |        |         |                |
| Firefox (desktop)      |           |             |          |        |         |                |
| Safari (desktop)       |           |             |          |        |         |                |
| Chrome (Android phone) |           |             |          |        |         |                |
| Safari (iPhone)        |           |             |          |        |         |                |

On phones, serve the build over HTTPS or use the deployed preview: service
workers and AudioWorklet need a secure context.

### Transport

1. Import a few tracks and press Play: the solenoid clunks, the reels turn and
   the counter runs; the sound starts within a tenth of a second.
2. Hold ▶▶ during play: the music runs fast and high (cue); let go and it plays
   on at speed. Hold ◀◀: the same backwards (review).
3. Press Next: the head lifts, the tape winds with a whine and stops in the gap
   before the next track, then plays.
4. Stop, then Stop again: the door springs open on its damper. Take the cassette
   out, turn it over, put it back and shut the door: side B faces out.
5. Play to the end of side A (or drag the seek bar near it): the tape pulls
   tight, the head turns, and side B plays in ⊃⊂ and ∞, but stops in ⊐.

### Hiss and noise reduction

1. Play the gap between two tracks at a high level: the hiss is quiet with NR B
   and louder, and brighter, with NR off.
2. Play a track with NR off on a tape recorded with B: the treble is bright and
   breathy. With the tape selector at I on a Type II tape: the treble is bright.
3. Hiss at 0 is silent; at 100 it is clearly audible but never covers the music.
4. Condition **Chewed**: dropouts in the treble and short warbles at the creases.

### Keyboard

1. With focus away from any field, press Space, X, `[` and `]` (held), B, N, V,
   E, P and 0: each does what the shortcut list says.
2. Tab through the transport strip: every key is reachable and named.
3. Press `?`, check that Tab stays inside the dialog, and close it with Escape.
4. Press `F`: only the deck and the transport strip remain; Escape leaves.

### Import

1. **Add files**: pick several files of mixed formats (MP3, FLAC, M4A, OGG,
   WAV). Each appears in the queue with its tagged title and artist; files
   without tags use "Artist - Title" from the file name.
2. **Add folder**: pick a folder with subfolders and non-audio files. Only the
   audio is imported; progress reads "Importing 3 / 40…" and **Cancel** stops
   it, keeping what was already imported.
3. Drag files, and then a folder, from the file manager onto the page.
4. Include one corrupt or mislabelled file: the import must finish, and that
   track must show a "could not be played" message only when the head reaches it.
5. Reload. The library, queue order, current track, the tape's position and
   the counter persist.
   The saved track is only decoded when you first play it, so the page should
   open quickly even with a long track; Play starts it from where the tape
   stopped.
6. Select a track with cover art: the accent colour changes if it stays
   readable. Select one without: the default accent returns.
7. Press the ✕ on one track: it leaves the queue, focus moves to the next
   track, and it stays gone after a reload. The tape is laid again without it.
8. **Clear library**, confirm, reload: the library is empty.
9. Change the pitch, the level and the deck's switches, then reload: they
   are restored.

### Colours and track info

1. Open **Colours**, pick an accent: buttons, sliders, the label and the glow
   follow it, and the text on accent-coloured buttons stays readable.
2. Choose a text colour close to the background: a low-contrast warning
   appears. **Reset colours** restores the theme.
3. Open **Track info** with a track under the head, edit the artist and the
   notes, and tab away: the queue updates, and both survive a reload.
4. Type in one field and move straight to the next: nothing you type may be
   overwritten.

### Offline

1. Load the page once and wait a few seconds.
2. Switch the network off (DevTools, or airplane mode on a phone) and reload.
   The page, fonts and deck render, and a track already in the library plays.
3. Go back online, deploy or build a new version, and reload twice. A toast
   reading "A new version is available — Reload" appears. Nothing changes
   until you press **Reload**.
4. Install the app (browser menu, or "Add to Home Screen") and start it from
   its icon.

### Reduced motion

1. Turn on "Reduce motion" in the operating system settings and reload.
2. Start a track: no opening camera move, the reels still turn
   to follow playback, and audio is unaffected.
3. Eject: the door is open at once instead of gliding.
4. The VU needles jump a few times a second instead of swinging.
5. Turn the setting off again without reloading: motion resumes.

### Headless checks

The same flows, without sound, in Chromium:

```sh
npm run check:browser
```

It builds, serves the build on port 4194 and runs every `scripts/check-*.js`
in turn. To run one alone, start `npm run preview` and call it with `node`.

`check-tape.js` plays test tones through the built worklet and measures what
comes out (peak level, hiss with and without NR, EQ and NR mismatches, wow and
flutter, cue). It proves the signal is right, not that it sounds right.

`check-loading.js` imports a 21-minute generated file to test streaming mode. `check-offline.js` edits `dist/sw.js` to simulate a new
deploy; `check:browser` rebuilds afterwards, and you should too if you run it
alone.
