# Parity with the vinyl player

This deck is the next member of a family whose reference is
[Ultra-Realistic Vinyl Player](https://github.com/Gitguy268/ultra-realistic-vinyl-player). Each row
takes one feature or check of that player and gives the cassette deck's counterpart and the
evidence that it exists: `u:` a unit test, `b:` a browser check script, `s:` a screenshot, `d:` a
decision in [DECISIONS.md](DECISIONS.md) where the feature has no counterpart on a tape deck.
`node scripts/check-parity.js --tick` checks that every piece of evidence is there.

| Row | Vinyl player                                                        | Cassette deck                                                                          | Evidence                                           | State |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- | ----- |
| P1  | Real speed plate 33 / OFF / 45, 78 behind its pin; ±6 % pitch       | One speed, 4.76 cm/s [S1]; ±3 % pitch                                                  | `u:transport` `u:reference` `b:check-transport`    | ☑     |
| P2  | Strobe slots that stand still at exact speed                        | No strobe on a cassette deck; the counter and the reels show the speed                 | `d:no strobe` `b:check-parts`                      | ☑     |
| P3  | Tonearm on its true pivot, cue plate, end stop                      | Piano-key transport, latching keys, stop then eject, end-of-tape sensing               | `u:transport` `b:check-transport` `b:check-parts`  | ☑     |
| P4  | The whole queue on one record: bands, gaps, lead-in, run-out        | The whole queue on cassettes: side A, side B, gaps, lead, clear leader, more cassettes | `u:tape-program` `b:check-library`                 | ☑     |
| P5  | Sides of about 22 minutes that turn over in 3D                      | Auto-reverse ⊐ / ⊃⊂ / ∞, the head turning; the cassette turned over by hand            | `u:transport` `b:check-reverse` `b:check-parts`    | ☑     |
| P6  | 12-inch, 7-inch, 10-inch records                                    | C46, C60, C90, C120, chosen to fit the queue                                           | `u:tape` `u:reference` `b:check-library`           | ☑     |
| P7  | Scratching with a hand on the record                                | Cue and review at 7× with the head on the tape; a pencil in the hub out of the deck    | `d:cue instead of scratching` `b:check-transport`  | ☑     |
| P8  | RIAA, wow and flutter, mono bass, crosstalk, roll-off               | NR B/C compander, playback EQ 120/70 µs, head bump, saturation, azimuth, wow, flutter  | `u:tape-dsp` `u:reference` `b:check-tape`          | ☑     |
| P9  | Surface noise, Mint to Beat-up, ticks at drawn scratches            | Tape hiss by type, New to Chewed, dropouts and creases at fixed places on the tape     | `u:tape-dsp` `b:check-tape`                        | ☑     |
| P10 | Mechanical sounds: plates, cue, arm, motor, hinge, needle drop      | Keys, solenoid, release, eject spring, door latch, reverse, tape end, wind whine       | `b:check-sfx`                                      | ☑     |
| P11 | Winamp ten-band EQ, 17 presets, .eqf import                         | The same, shared with the vinyl player through the family's EQ keys                    | `u:winamp-eq` `b:check-winamp` `b:check-storage`   | ☑     |
| P12 | Label visualizer: MilkDrop, bars, lines, scope, spectrogram, radial | The same six, printed in the title band of the cassette's label                        | `b:check-visualizer` `b:check-winamp`              | ☑     |
| P13 | Library in IndexedDB: files, folders, drop, tags, covers, notes     | The same, in its own database                                                          | `u:files` `b:check-library` `b:check-drop-cover`   | ☑     |
| P14 | Library desktop: artists and albums as folders                      | The same; a track dropped on the deck is wound to                                      | `u:group` `b:check-winamp`                         | ☑     |
| P15 | Queue: shuffle, repeat, reordering, auto-advance, Media Session     | The same; the tape is re-laid on reorder; the next cassette goes in when a tape ends   | `u:queue` `b:check-library`                        | ☑     |
| P16 | Six finishes, daylight and dusk, an acrylic cover                   | Four finishes, daylight and dusk, a smoked door on a damped hinge                      | `b:check-finishes` `b:check-parts`                 | ☑     |
| P17 | Camera: opening move, orbit, focus view, four-stop tour             | The same, with this deck's stops                                                       | `b:check-camera`                                   | ☑     |
| P18 | A 2D deck without WebGL; recovery from context loss                 | The same                                                                               | `b:check-fallback` `b:check-context-loss`          | ☑     |
| P19 | Installable PWA, offline, update prompt                             | The same, at / and under a Pages subpath                                               | `u:pwa` `b:check-offline`                          | ☑     |
| P20 | Reduced motion, keyboard for every control, screen reader           | The same                                                                               | `u:shortcuts` `b:check-reduced` `b:check-keyboard` | ☑     |
| P21 | Streaming mode for files over 150 MiB or 20 minutes                 | The same; cue moves the tape but cannot read a stream                                  | `u:playback-mode` `b:check-loading`                | ☑     |
| P22 | `?demo`, `?selftest`, the debug tap                                 | The same                                                                               | `u:selftest` `b:check-modes`                       | ☑     |
| P23 | Each build's own storage                                            | The same: app and one-file build apart, only the EQ shared                             | `u:settings` `b:check-storage`                     | ☑     |
| P24 | Nothing leaves the origin                                           | The same                                                                               | `b:check-network`                                  | ☑     |
| P25 | Real WAV, FLAC, MP3, M4A, AIFF                                      | The same                                                                               | `b:check-formats`                                  | ☑     |
| P26 | Phone layout, touch transport, background routing                   | The same                                                                               | `b:check-mobile`                                   | ☑     |
| P27 | The printed label, its text, measured groove loudness               | Each side's written label: its own tracks, tape, type and NR                           | `b:check-label`                                    | ☑     |
| P28 | Geometry held to 104 graded photographs (check-overlay)             | Geometry and sound held to cited figures; the deck itself is generic                   | `u:reference` `u:tape` `d:a generic deck`          | ☑     |
| P29 | Frame time and budgets; a ten-minute soak                           | The same                                                                               | `b:check-perf` `b:check-soak`                      | ☑     |
| P30 | One source, one single `index.html`                                 | The same, shipped in the rolling release instead of a second repository                | `b:check-spec` `b:check-filenotice`                | ☑     |
