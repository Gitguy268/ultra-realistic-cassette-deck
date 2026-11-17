import type { Dropout } from '../../core/wear';
import type { TapeSound } from '../tape/chain';
import type { WowFlutterParams } from '../wowflutter';

export const TAPE_PROCESSOR_NAME = 'tape-processor';

export interface ConfigMessage {
  type: 'config';
  wowFlutter: WowFlutterParams;
}

/** Decoded channel data for cue and review. The buffers are transferred, not copied again. */
export interface PcmMessage {
  type: 'pcm';
  channels: Float32Array[];
}

export interface ClearPcmMessage {
  type: 'clearPcm';
}

/** Cue/review: the worklet reads the track itself at a signed rate. */
export interface ScratchMessage {
  type: 'scratch';
  active: boolean;
  /** Start position in frames and the rate to start from; used when `active` is true. */
  position: number;
  rate: number;
}

export interface ScratchRateMessage {
  type: 'scratchRate';
  rate: number;
}

/**
 * The tape under the head, sent every tick. The worklet moves `x` on by `v` between messages, so
 * dropouts land on the sample, not on the frame.
 */
export interface MotionMessage {
  type: 'motion';
  /** Speed as a multiple of play speed, signed in the play direction. */
  rate: number;
  /** The head is on moving tape. */
  contact: boolean;
  /** Metres from the start of side A, and the speed along that axis (m/s). */
  x: number;
  v: number;
}

/** The cassette in the deck and the deck's switches. */
export interface TapeMessage {
  type: 'tape';
  sound: TapeSound;
  dropouts: Dropout[];
  /** Hiss level, 0..2, from the Hiss control. */
  hissScale: number;
}

export type WorkletMessage =
  | ConfigMessage
  | PcmMessage
  | ClearPcmMessage
  | ScratchMessage
  | ScratchRateMessage
  | MotionMessage
  | TapeMessage;

/** Sent by the worklet during cue/review; `final` marks the hand-back to normal playback. */
export interface PositionReply {
  type: 'position';
  frames: number;
  final: boolean;
}

export type WorkletReply = PositionReply;
