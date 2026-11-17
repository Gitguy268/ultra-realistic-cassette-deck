# Reference

The deck is generic: no real model is copied, so its face, layout and proportions are design
values, marked **[D]** in [`src/spec/deck.ts`](../src/spec/deck.ts). What a cassette and its
playback must be is not a design choice. Those figures come from the sources below, marked
**[S#]** in the spec and the code, or are worked out from them, marked **[M]**.
[`tests/reference.test.ts`](../tests/reference.test.ts) holds the spec and the sound to them.

Every source here was read on 2026-11-17. The IEC 60094 standards themselves could not be read
(they are sold, not published), so nothing claims them.

## Sources

| Tag  | Source                                                                                                                                                                                                                                     | What it gives                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| [S1] | Wikipedia, [Cassette tape](https://en.wikipedia.org/wiki/Cassette_tape)                                                                                                                                                                    | Tape speed 47.625 mm/s (1⅞ in/s); shell 4 × 2.5 × 0.5 in at its largest; tape width 3.81 mm; C60 90 m, C90 135 m; thickness per length |
| [S2] | IASA TC-04, [§5.4.10 Replay Equalisation](https://iasa-web.org/node/490); Nakamichi, [Technical Bulletin 2, Playback Equalization](https://www.richardhess.com/manuals/Nakamichi/nakamichi_Technical_Bulletin_2_Playback_Equalization.pdf) | Playback EQ 3180 + 120 µs for Type I, 3180 + 70 µs for Types II and IV                                                                 |
| [S3] | Wikipedia, [Dolby noise-reduction system](https://en.wikipedia.org/wiki/Dolby_noise-reduction_system)                                                                                                                                      | The B-type system: one sliding band, its reduction per frequency; the C-type: two stages in series, about 15 dB                        |

The [S2] pages were read through their quoted text in search results; the time constants agree
between both.

## The figures

| Figure                             | Value                                         | Source   | Where                                 |
| ---------------------------------- | --------------------------------------------- | -------- | ------------------------------------- |
| Tape speed                         | 47.625 mm/s                                   | [S1]     | `TAPE_SPEED`                          |
| Shell                              | 101.6 × 63.5 × 12.7 mm (largest)              | [S1]     | `cassette.width / height / thickness` |
| Tape width                         | 3.81 mm                                       | [S1]     | `cassette.tapeWidth`                  |
| C60                                | 90 m, 15–16 µm                                | [S1]     | `tapes.C60`                           |
| C90                                | 135 m, 10–11 µm                               | [S1]     | `tapes.C90`                           |
| C120                               | 6 µm; 172 m from 60 min a side at 47.625 mm/s | [S1] [M] | `tapes.C120`                          |
| C46                                | 15–16 µm; 69 m from 23 min a side, with spare | [S1] [M] | `tapes.C46`                           |
| Playback EQ                        | 120 µs (Type I), 70 µs (Types II and IV)      | [S2]     | `tapeTypes.*.eqUs`                    |
| A 70 µs tape on the 120 µs setting | 20·log₁₀(120 / 70) ≈ +4.7 dB in the treble    | [S2] [M] | `EqShelf` (src/audio/tape/dsp.ts)     |
| B: hiss reduction                  | 3, 6, 8, 10 dB at 600 Hz, 1.2, 2.4, 5 kHz     | [S3]     | `nr.B`, `SlidingBand`                 |
| C: hiss reduction                  | about 15 dB, two stages in series             | [S3]     | `nr.C`, `NoiseReduction`              |
| Pack radius                        | r² = r_hub² + t·L / π                         | [M]      | `packRadius` (src/core/tape.ts)       |
| Reel turns while winding L         | (r − r_hub) / t                               | [M]      | `reelTurns`                           |

## Design values

Everything else is ours, chosen to look and behave like a good deck of the early 1980s without
being any one of them: the 430 mm face and its layout, the hub radius and spacing (chosen so a full
pack is about 24 mm and both fit between the hubs), the fast-wind speed (a C60 side in about 70 s),
the transport's time constants, the counter's gearing (a C60 side reads about 600), wow and flutter
(about 0.05 %), the tape types' hiss levels and headroom, the head bump, and the azimuth error of
the turned head.

The noise reduction is modelled from [S3]'s description, not from any circuit, and tuned until it
gives the published reductions. The switch on the deck reads **NR B / C**: no trademark appears on
the model.
