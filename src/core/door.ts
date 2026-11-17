import { DECK_SPEC } from '../spec/deck';

/**
 * The cassette door: hinged along its bottom edge. Eject releases a latch and a spring pushes it
 * open against an oil damper, so it glides out at a near-constant speed and eases in at the end.
 * Closing is a push by hand, quick, ending in the latch's click.
 */

const W = DECK_SPEC.well;

export type DoorEvent = 'opened' | 'closed';

export class Door {
  /** Degrees, 0 shut. */
  angle = 0;
  target = 0;
  private held = false;

  get open(): boolean {
    return this.angle > W.openDeg * 0.9;
  }

  get closed(): boolean {
    return this.angle === 0 && this.target === 0;
  }

  get moving(): boolean {
    return this.angle !== this.target;
  }

  eject(): void {
    this.target = W.openDeg;
  }

  shut(): void {
    this.target = 0;
  }

  toggle(): void {
    if (this.target > 0) this.shut();
    else this.eject();
  }

  /** A hand holds the door at an angle. */
  grab(angle: number): void {
    this.held = true;
    this.angle = Math.max(0, Math.min(W.openDeg, angle));
    this.target = this.angle;
  }

  /** Let go: past halfway it falls open on its spring, otherwise it is pushed shut. */
  release(): void {
    this.held = false;
    this.target = this.angle > W.openDeg / 2 ? W.openDeg : 0;
  }

  /** Jumps to the target (reduced motion). */
  snap(): DoorEvent | null {
    if (this.angle === this.target) return null;
    this.angle = this.target;
    return this.target > 0 ? 'opened' : 'closed';
  }

  step(dt: number): DoorEvent | null {
    if (this.held || this.angle === this.target) return null;
    const opening = this.target > this.angle;
    const rate = W.openDeg / (opening ? W.openS : W.closeS);
    // The damper eases the last few degrees of opening.
    const left = Math.abs(this.target - this.angle);
    const ease = opening ? Math.max(0.25, Math.min(1, left / (W.openDeg * 0.25))) : 1;
    const move = rate * ease * dt;
    if (move >= left) {
      this.angle = this.target;
      return opening ? 'opened' : 'closed';
    }
    this.angle += opening ? move : -move;
    return null;
  }
}
