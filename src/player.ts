import { Emitter } from './audio/emitter';
import type { Deck } from './deck';
import { Library, type Track, type TrackStore, type TrackTags } from './library/db';
import { DEMO_ALBUM, DEMO_ARTIST, NoStore, demoFiles } from './demo';
import { quotaWarning } from './library/files';
import { importFiles } from './library/importer';
import { Queue, type RepeatMode } from './library/queue';
import { readStored, writeStored } from './util/storage';

export interface ImportProgress {
  done: number;
  total: number;
}

export interface PlayerEvents {
  /** The library, queue order, settings or current track changed. */
  change: undefined;
  /** A different track became current (or none). */
  track: Track | null;
  status: string;
  announce: string;
  /** The browser's answer on whether it will keep the library. */
  storage: string;
  progress: ImportProgress | null;
}

const LARGE_IMPORT_BYTES = 50 * 1024 * 1024;

/** The library and queue, and the rules for moving between tracks on the deck. */
export class Player {
  readonly events = new Emitter<PlayerEvents>();
  readonly tracks = new Map<string, Track>();
  queue = new Queue();
  /** When a cassette's last side ends, the next cassette goes in. */
  autoAdvance = false;
  readonly deck: Deck;
  private readonly library: TrackStore;
  private globalCover: Blob | null = null;
  /** `?demo`: three synthesized tracks beside the library, which stays closed and untouched. */
  private readonly demo: boolean;
  private importAbort: AbortController | null = null;

  constructor(deck: Deck, demo = false) {
    this.deck = deck;
    this.demo = demo;
    this.library = demo
      ? new NoStore()
      : new Library(__PROFILE__ === 'html' ? 'cassette-deck-html' : undefined);
    deck.attach({
      ids: () => this.queue.ids,
      durations: () => this.queue.ids.map((id) => this.tracks.get(id)?.durationSec),
      fileAt: (index) => this.tracks.get(this.queue.ids[index] ?? '')?.blob,
      titleAt: (index) => this.tracks.get(this.queue.ids[index] ?? '')?.tags.title ?? '',
    });
    // The tape plays on into the next track by itself: the queue follows the head.
    deck.events.on('track', (index) => this.follow(index));
    deck.events.on('tapeEnd', () => {
      const next = deck.cassetteIndex + 1;
      if (!this.autoAdvance || next >= deck.cassetteCount) return;
      deck.swapCassette(next, 0, 0);
      deck.transport.direction = 1;
      deck.play();
      this.events.emit('status', `Cassette ${next + 1} in.`);
    });
    this.events.on('change', () => deck.rebuild());
  }

  get current(): Track | null {
    return this.queue.currentId === null ? null : (this.tracks.get(this.queue.currentId) ?? null);
  }

  /** Restores the library and queue saved by an earlier visit. */
  async start(): Promise<void> {
    this.autoAdvance = readStored('autoAdvance') === true;
    if (this.demo) {
      await this.import(demoFiles());
      for (const track of this.tracks.values()) {
        track.tags = { ...track.tags, artist: DEMO_ARTIST, album: DEMO_ALBUM };
      }
      this.events.emit('change', undefined);
      return;
    }
    let stored: Track[] = [];
    try {
      stored = await this.library.all();
    } catch {
      this.events.emit('status', 'The saved library could not be opened in this browser.');
    }
    stored.sort((a, b) => a.addedAt - b.addedAt);
    for (const track of stored) this.tracks.set(track.id, track);
    this.globalCover = await this.library.loadCover().catch(() => null);
    this.queue = Queue.restore(readStored('queue'));
    const known = this.queue.ids.filter((id) => this.tracks.has(id));
    this.queue.setIds([...known, ...stored.map((track) => track.id)]);
    this.events.emit('change', undefined);
    const current = this.current;
    if (!current) return;
    this.events.emit('track', current);
  }

  async import(files: readonly File[]): Promise<void> {
    if (files.length === 0) {
      this.events.emit('status', 'No audio files found.');
      return;
    }
    if (this.importAbort) return;
    const bytes = files.reduce((sum, file) => sum + file.size, 0);
    const notes: string[] = [];
    if (bytes > LARGE_IMPORT_BYTES && navigator.storage?.estimate) {
      const warning = quotaWarning(await navigator.storage.estimate(), bytes);
      if (warning) notes.push(warning);
    }
    this.importAbort = new AbortController();
    const result = await importFiles(
      files,
      this.library,
      (done, total) => this.events.emit('progress', { done, total }),
      this.importAbort.signal,
    );
    this.importAbort = null;
    this.events.emit('progress', null);
    for (const track of result.tracks) this.tracks.set(track.id, track);
    // The first tagged cover becomes the label of tracks that have none (X40).
    if (!this.globalCover) {
      const cover = result.tracks.find((track) => track.coverBlob)?.coverBlob;
      if (cover) {
        this.globalCover = cover;
        void this.library.saveCover(cover).catch(() => undefined);
      }
    }
    this.queue.add(result.tracks.map((track) => track.id));
    this.persist();
    const count = result.tracks.length;
    notes.unshift(
      `${result.cancelled ? 'Import cancelled after' : 'Imported'} ${count} ${count === 1 ? 'track' : 'tracks'}.`,
    );
    if (result.failed > 0) notes.push(`${result.failed} could not be stored.`);
    this.events.emit('status', notes.join(' '));
    // Firefox asks the user before answering, so this must not hold up the import.
    void this.requestPersistence().then((answer) => {
      if (answer) this.events.emit('storage', answer);
    });
    this.events.emit('announce', notes[0] ?? '');
    this.events.emit('change', undefined);
    const first = result.tracks[0];
    if (first && !this.deck.playing && this.queue.currentId === null) this.select(first.id, false);
  }

  cancelImport(): void {
    this.importAbort?.abort();
  }

  /** Asks the browser once not to evict the library, and reports its answer. */
  private async requestPersistence(): Promise<string | null> {
    if (readStored('persistAsked') === true || !navigator.storage?.persist) return null;
    writeStored('persistAsked', true);
    const granted = await navigator.storage.persist().catch(() => false);
    return granted
      ? 'The browser will keep the library until you clear it.'
      : 'The browser may clear the library if storage runs low.';
  }

  async clearLibrary(): Promise<void> {
    await this.library.clear();
    this.tracks.clear();
    this.queue.clear();
    this.persist();
    this.events.emit('status', 'Library cleared. The cassette is blank now.');
    this.events.emit('track', null);
    this.events.emit('change', undefined);
  }

  /** Saves edited tags and notes for the current track. */
  async updateCurrent(tags: TrackTags, notes: string): Promise<void> {
    const track = this.current;
    if (!track) return;
    const updated: Track = { ...track, tags };
    if (notes) updated.notes = notes;
    else delete updated.notes;
    this.tracks.set(track.id, updated);
    this.events.emit('change', undefined);
    try {
      await this.library.put(updated);
    } catch {
      this.events.emit('status', 'These details could not be saved in this browser.');
    }
  }

  /** A cover dropped on the page: the label of every track without its own (H18). */
  async setGlobalCover(cover: Blob): Promise<void> {
    this.globalCover = cover;
    this.events.emit('track', this.current);
    try {
      await this.library.saveCover(cover);
    } catch {
      this.events.emit('status', 'This cover could not be saved in this browser.');
    }
  }

  /** The label a track shows: its own cover, or the page's. */
  coverOf(track: Track | null): Blob | undefined {
    return track?.coverBlob ?? this.globalCover ?? undefined;
  }

  /** The other side: the head turns over (◀▶). */
  flip(): void {
    this.deck.reverse();
  }

  /** Removes one track from the library and the queue. A record on the platter stays there. */
  async remove(id: string): Promise<void> {
    const track = this.tracks.get(id);
    if (!track) return;
    await this.library.delete(id);
    this.tracks.delete(id);
    this.queue.remove(id);
    this.persist();
    this.events.emit('status', `Removed ${track.tags.title} from the library.`);
    this.events.emit('announce', `Removed ${track.tags.title}.`);
    this.events.emit('change', undefined);
  }

  /** Makes a track current and winds the tape to it. */
  select(id: string, autoplay: boolean): void {
    const track = this.tracks.get(id);
    if (!track || !this.queue.select(id)) return;
    this.persist();
    this.events.emit('track', track);
    this.events.emit('change', undefined);
    this.deck.selectTrack(this.queue.ids.indexOf(id), autoplay);
  }

  /** The head reached a track on its own: it becomes current without moving the tape. */
  private follow(index: number): void {
    const id = this.queue.ids[index];
    if (id === undefined || id === this.queue.currentId) return;
    const track = this.tracks.get(id);
    if (!track) return;
    this.queue.select(id);
    this.persist();
    this.events.emit('track', track);
    this.events.emit('change', undefined);
  }

  /** ⏭: a music search to the next track on the tape; with shuffle, a wind to a random one. */
  next(autoplay = true): void {
    if (this.queue.shuffle || this.queue.repeat === 'one') {
      const id = this.queue.next();
      if (id === null) this.events.emit('status', 'End of the queue.');
      else this.select(id, autoplay);
      return;
    }
    if (this.deck.search(1)) return;
    this.step(1, autoplay);
  }

  /** ⏮: back to the start of this track, or the one before. */
  previous(): void {
    if (this.deck.search(-1)) return;
    this.step(-1, true);
  }

  /** Past the end of a side: the next track in the queue, wherever it is on the tapes. */
  private step(direction: 1 | -1, autoplay: boolean): void {
    const at = this.queue.currentId === null ? -1 : this.queue.ids.indexOf(this.queue.currentId);
    const id = this.queue.ids[at + direction];
    if (id === undefined) {
      this.events.emit('status', direction > 0 ? 'End of the queue.' : 'Start of the queue.');
      return;
    }
    this.select(id, autoplay);
  }

  /** Applies a new order from drag or keyboard reordering. */
  reorder(ids: readonly string[]): void {
    this.queue.setIds(ids.filter((id) => this.tracks.has(id)));
    this.persist();
    this.events.emit('change', undefined);
  }

  move(id: string, delta: number): number {
    const index = this.queue.moveTo(id, this.queue.ids.indexOf(id) + delta);
    this.persist();
    this.events.emit('change', undefined);
    return index;
  }

  toggleShuffle(): boolean {
    const shuffle = this.queue.toggleShuffle();
    this.persist();
    this.events.emit('change', undefined);
    return shuffle;
  }

  cycleRepeat(): RepeatMode {
    const repeat = this.queue.cycleRepeat();
    this.persist();
    this.events.emit('change', undefined);
    return repeat;
  }

  setAutoAdvance(enabled: boolean): void {
    this.autoAdvance = enabled;
    writeStored('autoAdvance', enabled);
  }

  private persist(): void {
    if (this.demo) return;
    writeStored('queue', this.queue.toState());
  }
}
