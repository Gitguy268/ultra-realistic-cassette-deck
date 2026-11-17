import { crinkleAt, levelAt, type Dropout } from '../../core/wear';
import { ModulatedDelay } from '../delay-line';
import { ReadHead } from '../scratch';
import { TapeChain } from '../tape/chain';
import {
  DEFAULT_WOW_FLUTTER,
  playbackRateMultiplier,
  validateWowFlutter,
  type WowFlutterParams,
} from '../wowflutter';
import { TAPE_PROCESSOR_NAME, type PositionReply, type WorkletMessage } from './messages';

declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

const CHANNELS = 2;
const CUE_SMOOTHING_S = 0.02;
const POSITION_REPORT_BLOCKS = 8;
const BLOCK_FRAMES = 128;
/** A crease shakes the tape: a burst of fast flutter, as a fraction of speed. */
const CRINKLE_FLUTTER = 0.006;
const CRINKLE_HZ = 31;

/**
 * The playback head: music arrives already at the tape's speed (or is read here during cue and
 * review), and leaves as this deck plays that cassette: wow and flutter, the tape chain, the
 * dropouts at their places on the tape and the hiss of the tape moving past the head.
 */
class TapeProcessor extends AudioWorkletProcessor {
  private wowFlutter: WowFlutterParams = DEFAULT_WOW_FLUTTER;
  private readonly chain = new TapeChain(sampleRate);
  private readonly delay = [new ModulatedDelay(), new ModulatedDelay()];
  private readonly smoothing = 1 - Math.exp(-1 / (CUE_SMOOTHING_S * sampleRate));
  private pcm: Float32Array[] = [];
  private head: ReadHead | null = null;
  private cueing = false;
  private cueRate = 0;
  private cueTarget = 0;
  private blocks = 0;
  private rate = 0;
  private contact = false;
  private x = 0;
  private v = 0;
  private dropouts: Dropout[] = [];
  private hissScale = 1;
  private hiss = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<WorkletMessage>): void => {
      this.handle(event.data);
    };
  }

  private handle(message: WorkletMessage): void {
    switch (message.type) {
      case 'config':
        this.wowFlutter = validateWowFlutter(message.wowFlutter);
        break;
      case 'pcm': {
        const length = message.channels[0]?.length ?? 0;
        this.pcm = message.channels;
        this.head = length > 0 ? new ReadHead(length) : null;
        break;
      }
      case 'clearPcm':
        this.pcm = [];
        this.head = null;
        this.cueing = false;
        break;
      case 'scratch':
        if (message.active && this.head) {
          this.head.seek(message.position);
          this.cueRate = message.rate;
          this.cueTarget = message.rate;
          this.cueing = true;
        } else if (this.cueing) {
          this.cueing = false;
          this.report(true);
        }
        break;
      case 'scratchRate':
        this.cueTarget = message.rate;
        break;
      case 'motion':
        this.rate = message.rate;
        this.contact = message.contact;
        this.x = message.x;
        this.v = message.v;
        break;
      case 'tape':
        this.chain.configure(message.sound);
        this.dropouts = message.dropouts;
        this.hissScale = message.hissScale;
        break;
    }
  }

  private report(final: boolean): void {
    const reply: PositionReply = { type: 'position', frames: this.head?.position ?? 0, final };
    this.port.postMessage(reply);
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0] ?? [];
    const output = outputs[0];
    const frames = output?.[0]?.length ?? 0;
    if (!output) return true;
    const head = this.cueing ? this.head : null;
    // The tape's level and creases at the start and end of this block, interpolated between.
    const x0 = this.x;
    const x1 = x0 + this.v * (frames / sampleRate);
    const contact = this.contact;
    const level0 = contact ? levelAt(this.dropouts, x0) : 1;
    const level1 = contact ? levelAt(this.dropouts, x1) : 1;
    const crinkle = contact ? crinkleAt(this.dropouts, (x0 + x1) / 2) : 0;
    this.x = x1;
    // Hiss follows the tape's speed past the head, with a short glide so starts are not clicks.
    const speed = Math.min(1.6, Math.abs(this.rate));
    const hissTarget = contact ? Math.sqrt(speed) * this.hissScale : 0;
    for (let i = 0; i < frames; i++) {
      const t = currentTime + i / sampleRate;
      let rate = playbackRateMultiplier(t, this.wowFlutter);
      if (crinkle > 0) rate += crinkle * CRINKLE_FLUTTER * Math.sin(2 * Math.PI * CRINKLE_HZ * t);
      this.hiss += (hissTarget - this.hiss) * 0.002;
      const level = level0 + (level1 - level0) * (i / frames);
      for (let channel = 0; channel < CHANNELS; channel++) {
        const source = input[channel] ?? input[0];
        let sample = source ? source[i]! : 0;
        const pcm = this.pcm[channel] ?? this.pcm[0];
        if (head && pcm) sample += head.read(pcm);
        const wobbled = this.delay[channel]!.process(sample, rate);
        const target = output[channel];
        if (target) target[i] = this.chain.process(channel as 0 | 1, wobbled, level, this.hiss);
      }
      if (head) {
        this.cueRate += (this.cueTarget - this.cueRate) * this.smoothing;
        head.advance(this.cueRate);
      }
    }
    if (++this.blocks % POSITION_REPORT_BLOCKS === 0 && head) this.report(false);
    return true;
  }
}

/** Test tap, only connected with `?debug`: keeps the last seconds of output for a script (html-1). */
class TapProcessor extends AudioWorkletProcessor {
  private readonly buffer = new Float32Array(sampleRate * 12);
  private write = 0;
  private filled = false;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<{ seconds: number }>): void => {
      const { buffer, write } = this;
      const n = Math.min(
        Math.round(event.data.seconds * sampleRate),
        this.filled ? buffer.length : write,
      );
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++)
        samples[i] = buffer[(write - n + i + buffer.length) % buffer.length]!;
      this.port.postMessage({ samples, sr: sampleRate }, [samples.buffer]);
    };
  }

  process(inputs: Float32Array[][]): boolean {
    // A silent input arrives with no channels at all: that is silence to record, not nothing.
    const a = inputs[0]?.[0];
    const b = inputs[0]?.[1] ?? a;
    for (let i = 0; i < BLOCK_FRAMES; i++) {
      this.buffer[this.write] = a && b ? (a[i]! + b[i]!) * 0.5 : 0;
      if (++this.write >= this.buffer.length) {
        this.write = 0;
        this.filled = true;
      }
    }
    return true;
  }
}

registerProcessor(TAPE_PROCESSOR_NAME, TapeProcessor);
registerProcessor('tap', TapProcessor);
