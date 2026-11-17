# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

The cassette deck, built from the engine of
[Ultra-Realistic Vinyl Player](https://github.com/Gitguy268/ultra-realistic-vinyl-player).

### Added

- A 3D model of a generic early-1980s silver front-loading cassette deck: brushed face with its
  silkscreen, piano keys that latch, a smoked door on an oil-damped hinge, twin needle VU meters
  with a lamp, a three-digit mechanical counter, slide switches, a knurled output knob, a power
  switch and LEDs, a head block that turns over for reverse. Four finishes. No maker's name or logo.
- The Compact Cassette: shell, window, hubs, tape packs that grow and shrink with the tape, and a
  written label for each side listing its tracks. Out of the deck it lies on the credenza and can be
  turned over or wound by hand.
- A tape transport modelled from the tape itself: 4.76 cm/s with ±3 % pitch, pack radii from tape
  length and thickness, fast wind that speeds up as the take-up pack grows, clear leader, end-of-tape
  sensing, auto-reverse in three modes, cue and review at 7×, music search, and a counter that counts
  reel turns.
- The queue laid onto C46, C60, C90 or C120 cassettes as a mixtape, side A then side B, with more
  cassettes when one is full and the next put in when a tape ends.
- A tape chain in an AudioWorklet: noise reduction B and C as sliding-band companders tuned to the
  published per-band reductions, tape hiss by type, playback EQ at 120 or 70 µs (a mismatch is heard,
  and mistracks through NR), head bump, treble saturation, dropouts and creases at fixed places on
  the tape, azimuth error on the reverse side, wow and flutter.
- Mechanism sounds: keys, solenoid, release, eject spring, door latch, the head turning, the tape
  pulling tight, and the fast-wind whine.
- [docs/REFERENCE.md](docs/REFERENCE.md) with the cited figures, held by `tests/reference.test.ts`;
  [docs/PARITY.md](docs/PARITY.md) mapping every feature of the vinyl player.
- 23 headless browser checks for the tape deck.

### Kept from the vinyl player

- The library in IndexedDB, folder and drop import, tags, cover art, liner notes; the queue with
  shuffle, repeat and reordering; Media Session.
- The Winamp ten-band EQ with its presets and .eqf import, shared with the vinyl player.
- The label visualizers (MilkDrop, bars, lines, scope, spectrogram, radial), now on the cassette.
- The library desktop, the room, the lighting, the camera and its tour, the 2D fallback, recovery
  from a lost WebGL context, the installable PWA, keyboard shortcuts and reduced motion.
- A one-file `index.html` built from the same source, now shipped in the rolling release.
