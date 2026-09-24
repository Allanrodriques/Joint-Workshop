import { clamp, easeInOutCubic } from './math';

export type EaseFn = (t: number) => number;

export interface Tween {
  duration: number;
  elapsed: number;
  delay: number;
  ease: EaseFn;
  onUpdate: (k: number) => void;
  onComplete?: () => void;
  done: boolean;
}

export const Ease = {
  linear: (t: number) => t,
  inOut: easeInOutCubic,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
} satisfies Record<string, EaseFn>;

export interface TweenInit {
  duration: number;
  delay?: number;
  ease?: EaseFn;
  onUpdate: (k: number) => void;
  onComplete?: () => void;
}

export class Tweens {
  private list: Tween[] = [];

  add(init: TweenInit): Tween {
    const t: Tween = {
      duration: Math.max(0.0001, init.duration),
      elapsed: 0,
      delay: init.delay ?? 0,
      ease: init.ease ?? Ease.inOut,
      onUpdate: init.onUpdate,
      onComplete: init.onComplete,
      done: false,
    };
    this.list.push(t);
    return t;
  }

  get count(): number {
    return this.list.length;
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      if (t.delay > 0) {
        t.delay -= dt;
        continue;
      }
      t.elapsed += dt;
      const k = clamp(t.elapsed / t.duration, 0, 1);
      t.onUpdate(t.ease(k));
      if (k >= 1) {
        t.done = true;
        this.list.splice(i, 1);
        t.onComplete?.();
      }
    }
  }

  clear(): void {
    this.list.length = 0;
  }
}
