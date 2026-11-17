# Decisions

Each entry records a choice, what it rests on, and what it costs. "User" means the user decided it
on 2026-11-17.

## Made with the user

**A generic deck.** An early-1980s silver front loader with a single well, needle meters and a
mechanical counter, but no real model: no maker's name, logo or wordmark, and no face copied from
one deck. The noise-reduction switch reads "NR B / C". Cost: nothing can be checked against
photographs, so the realism rests on cited figures instead (see **a generic deck** below).

**One repository.** The one-file `index.html` is built from the same source and shipped as an asset
of the rolling release, not as a second repository as the vinyl player has.

## The deck

**A generic deck.** The vinyl player held its geometry to graded photographs of a real turntable.
This deck has no original, so [REFERENCE.md](REFERENCE.md) cites what a cassette and its playback
must be (speed, shell, tape, EQ, noise reduction) and `tests/reference.test.ts` holds the spec and
the sound to it. The face, its layout and the transport's timings are design values, marked [D].

**No strobe.** A cassette deck has none. The tape's speed shows in the counter, which turns with the
take-up reel, and in the reels themselves.

**The counter counts reel turns.** As on the real thing, it is geared to a spindle, so it runs fast at
the start of side A and slow at its end, runs down on side B, and wraps through 999. It is not a
clock; the page's time display is.

**Cue instead of scratching.** A tape cannot be pushed back and forth by hand under the head. The
counterpart is cue and review: fast forward or rewind held during play runs the tape at seven times
speed with the head on it. Out of the deck, a drag on the cassette winds it as a pencil in the hub
would, silently.

**One transport model owns the tape.** `core/transport.ts` holds where the tape is and how fast it
moves; the packs, the spokes, the counter and the read position all follow it. In steady play the
sound leads and the tape follows it (`deck.ts`, `sync`), so the two never part.

**Fast wind speeds up.** The spindle motor turns the take-up reel toward a fixed angular speed, so
the tape runs faster as that pack grows, and a C60 side winds in about 70 s.

**Music search stops in the gap.** Next and Previous wind to one second before a track's start and
play; within two seconds of a track's start, Previous goes to the one before.

**A chosen track is wound to.** Choosing a track in the library winds the tape there and plays it, or
turns the head when it is on the other side, or swaps in the cassette that holds it. "Wind to a chosen
track" off jumps straight there; the seek bar and ← → always jump.

**The tape is laid as a mixtape.** Tracks go on side A, then side B, with four-second gaps; a track
that does not fit starts the next side, and when both sides are full the rest goes on the next
cassette. The shortest cassette that holds the queue is chosen unless one is picked.

**Noise reduction is a compander, not a filter.** The tape is "recorded" through an encoder and played
through the deck's decoder, so a mismatch is heard as on a real deck: NR off on a B tape is bright and
squashed, and a wrong EQ setting is worse through NR, which mistracks. The model is written from the
published description and tuned to the published per-band reductions; it is not any company's circuit.

**The tape type is the cassette's, the selector the deck's.** The cassette's type and its noise
reduction are settings of the cassette; the deck's selector and NR switch are its own. They start
matched.

**Dropouts belong to the tape.** They sit at fixed places along it, seeded per cassette and condition,
so the same stretch drops out every time it passes the head, on either side.

**Storage.** The app keeps IndexedDB `cassette-library` and `ultra-cassette-deck.*` settings; the
one-file build keeps `cassette-deck-html` and `cassette-deck-html.*`, since every page opened from
`file://` shares one origin. Only the Winamp EQ is shared, under the family's `vinyl-eq` keys, so a
curve set on the vinyl player plays on this deck. `?demo` neither reads nor writes the saved tape
position.

**The door locks while the tape runs.** It can be dragged open only with the transport stopped, as a
mechanical deck's door is held shut by the transport; Eject stops the tape first.
