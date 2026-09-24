import * as THREE from 'three';
import type { DragTarget, GameAPI, Stage, StageId } from '../game/GameState';
import { CAMERA_VIEWS, LAYOUT } from '../game/constants';
import { clamp } from '../utils/math';

const THRESHOLDS = [0.25, 0.5, 0.75] as const;
const ROLL_COLORS = ['#7ddc6a', '#e8a552', '#f3eee2', '#5ee6a8'];
const PAPER_SOUND_INTERVAL = 0.15;
/** World-space k: |Δx|+|Δz| of the drag point → progress (one paper-length swipe ≈ full roll). */
const WORLD_DRAG_GAIN = 0.42;
const ROLL_STEP = 0.02;

export class RollStage implements Stage {
  readonly id: StageId = 'ROLL';
  private progress = 0;
  private prevProgress = 0;
  private done = false;
  private labelHidden = false;
  private soundTimer = 0;
  private trackedPaperRoll = false;
  private readonly hitThresholds = new Set<number>();

  enter(game: GameAPI): void {
    const view = CAMERA_VIEWS[this.id];
    game.cameraRig.moveTo(new THREE.Vector3(...view.pos), new THREE.Vector3(...view.target));
    game.hud.hideContinue();
    game.hud.setRollRing(null);
    game.hud.setBlowVisible(false, null);

    const w = game.world;
    w.paper.setVisible(true);
    w.bud.setCoreFormed(true);
    w.bud.group.visible = true;
    w.bud.group.position.set(
      0,
      LAYOUT.paper.y + LAYOUT.paper.radius,
      LAYOUT.paper.z + w.paper.progress * 0.6 - 0.6,
    );
    game.interaction.setOrbit(false);

    const target: DragTarget = {
      id: 'paper',
      root: w.paper.mesh,
      mode: 'drag',
      enabled: true,
      dragY: () => LAYOUT.paper.y + 0.05,
      onGrab: (t) => {
        t.root.position.set(0, 0, 0);
        t.root.rotation.set(0, 0, 0);
      },
      onMove: (t, _point, delta) => {
        t.root.position.set(0, 0, 0);
        t.root.rotation.set(0, 0, 0);
        const d = Math.abs(delta.x) + Math.abs(delta.z);
        if (d > ROLL_STEP) {
          this.progress = clamp(this.progress + d * WORLD_DRAG_GAIN, 0, 1);
        }
      },
    };

    game.interaction.setTargets([target]);
    game.interaction.setZones([]);
    game.setHint({
      kicker: '05 · ROLL',
      text: 'Drag across the paper to roll it up.',
      progress: this.progress,
      count: Math.round(this.progress * 100),
      total: 100,
      status: this.progress >= 1 ? 'COMPLETE' : this.progress > 0 ? 'IN PROGRESS' : 'READY',
    });
    game.setLabels([
      {
        id: 'l-roll',
        text: 'drag ↺',
        anchor: w.paper.group,
        visible: this.progress <= 0.06,
      },
    ]);
  }

  update(dt: number, game: GameAPI): void {
    const w = game.world;

    if (!this.done) {
      w.paper.setProgress(this.progress);
      w.bud.group.position.set(
        0,
        LAYOUT.paper.y + LAYOUT.paper.radius,
        LAYOUT.paper.z + this.progress * 0.6 - 0.6,
      );

      this.soundTimer -= dt;
      if (this.progress > this.prevProgress) {
        if (!this.trackedPaperRoll) {
          this.trackedPaperRoll = true;
          game.track('paper-roll');
        }
        if (this.soundTimer <= 0) {
          game.audio.paper();
          this.soundTimer = PAPER_SOUND_INTERVAL;
        }
      }

      for (const th of THRESHOLDS) {
        if (
          !this.hitThresholds.has(th) &&
          this.prevProgress < th &&
          this.progress >= th
        ) {
          this.hitThresholds.add(th);
          game.shake(0.05);
          game.audio.paper();
          w.fx.burst(w.paper.group.position.clone(), { count: 4 });
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(8);
          }
        }
      }

      if (!this.labelHidden && this.progress > 0.06) {
        this.labelHidden = true;
        game.setLabels([]);
      }

      this.prevProgress = this.progress;

      if (this.progress >= 1) this.complete(game);
    }

    game.hud.setRollRing(this.progress);
    game.hud.setHintProgress({
      fraction: this.progress,
      count: Math.round(this.progress * 100),
      total: 100,
    });
    game.hud.setHintStatus(this.progress >= 1 ? 'COMPLETE' : this.progress > 0 ? 'IN PROGRESS' : 'READY');
  }

  private complete(game: GameAPI): void {
    if (this.done) return;
    this.done = true;
    const w = game.world;

    w.paper.setVisible(false);
    w.filter.setVisible(false);
    w.joint.show();
    w.bud.setCoreFormed(false);
    w.bud.group.visible = false;

    w.fx.burst(new THREE.Vector3(LAYOUT.joint.x, LAYOUT.joint.y, LAYOUT.joint.z), {
      count: 40,
      colors: ROLL_COLORS,
      speed: 2.2,
    });
    game.audio.chime();
    game.shake(0.16);
    game.stats.rollCompletion = 100;
    game.toast('Perfect roll.', 'good');
    game.track('roll-complete');
    game.tweens.add({
      duration: 0.7,
      onUpdate: () => {},
      onComplete: () => game.go('FINISHED'),
    });
  }

  exit(game: GameAPI): void {
    game.setLabels([]);
    game.setHint(null);
    game.hud.setRollRing(null);
    game.hud.setBlowVisible(false, null);
    game.world.zone.hide();
    game.interaction.setTargets([]);
    game.interaction.setZones([]);
    game.interaction.setOrbit(true);
  }

  reset(game: GameAPI): void {
    this.progress = 0;
    this.prevProgress = 0;
    this.done = false;
    this.labelHidden = false;
    this.soundTimer = 0;
    this.trackedPaperRoll = false;
    this.hitThresholds.clear();
    const w = game.world;
    w.paper.setProgress(0);
    w.paper.setVisible(true);
    w.filter.setVisible(true);
    w.joint.hide();
    w.bud.setCoreFormed(false);
    w.bud.group.visible = true;
  }
}
