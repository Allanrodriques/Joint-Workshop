import * as THREE from 'three';
import type { GameAPI, Stage } from '../game/GameState';
import { AMOUNTS, CAMERA_VIEWS, LAYOUT, PAPERS } from '../game/constants';
import { clamp } from '../utils/math';

const TMP = new THREE.Vector3();
const WORLD_DRAG_GAIN = 0.42;
const ROLL_STEP = 0.02;
const PAPER_SOUND_INTERVAL = 0.16;

/**
 * Open-ended play pen reached from the FINAL panel. The desk props are all
 * grabbable: roll the paper to build another joint, scatter the bud, and fire
 * the lighter. No win/lose states — exit whenever.
 */
export class SandboxStage implements Stage {
  readonly id = 'SANDBOX' as const;
  private progress = 0;
  private done = false;
  private flame = false;
  private dragGain = WORLD_DRAG_GAIN;
  private soundTimer = 0;

  enter(game: GameAPI): void {
    const view = CAMERA_VIEWS[this.id];
    game.cameraRig.moveTo(new THREE.Vector3(...view.pos), new THREE.Vector3(...view.target));
    game.hud.hideContinue();
    game.hud.setRollRing(null);
    game.hud.setBlowVisible(false, null);

    const w = game.world;
    w.bud.reset();
    w.bud.group.visible = true;
    w.paper.reset();
    w.paper.setVisible(true);
    w.filter.reset();
    w.joint.hide();
    this.progress = 0;
    this.done = false;
    this.flame = false;
    this.soundTimer = 0;
    const paperDef = PAPERS.find((p) => p.id === game.choices.paper) ?? PAPERS[0];
    const amount = AMOUNTS.find((a) => a.id === game.choices.amount) ?? AMOUNTS[1];
    this.dragGain = WORLD_DRAG_GAIN * paperDef.gain * amount.gain;

    game.interaction.setTargets([
      {
        id: 'sb-bud',
        root: w.bud.group,
        mode: 'both',
        enabled: true,
        dragY: 0.16,
        onClick: () => this.scatterBud(game),
      },
      {
        id: 'sb-paper',
        root: w.paper.mesh,
        mode: 'drag',
        enabled: true,
        dragY: () => LAYOUT.paper.y + 0.05,
        onGrab: (t) => {
          t.root.position.set(0, 0, 0);
          t.root.rotation.set(0, 0, 0);
        },
        onMove: (t, _point, delta) => {
          if (this.done) return;
          t.root.position.set(0, 0, 0);
          t.root.rotation.set(0, 0, 0);
          if (Math.abs(delta.x) + Math.abs(delta.z) > ROLL_STEP) {
            this.progress = clamp(this.progress + (Math.abs(delta.x) + Math.abs(delta.z)) * this.dragGain, 0, 1);
          }
        },
      },
      { id: 'sb-filter', root: w.filter.group, mode: 'drag', enabled: true, dragY: 0.1 },
      { id: 'sb-joint', root: w.joint.group, mode: 'drag', enabled: true, dragY: 0.18 },
      {
        id: 'sb-lighter',
        root: w.lighter.group,
        mode: 'click',
        enabled: true,
        onClick: () => this.toggleFlame(game),
      },
      { id: 'sb-ashtray', root: w.ashtray.group, mode: 'drag', enabled: true, dragY: 0 },
      { id: 'sb-discard', root: w.discard.group, mode: 'drag', enabled: true, dragY: 0 },
    ]);
    game.interaction.setZones([]);
    game.interaction.setOrbit(true);
    game.cameraRig.setLimits(1.2, 10, true);

    game.hud.setFreeRoam(true, () => game.go('FINAL'), () => game.enterPhotoMode());
    game.setHint({
      kicker: 'SANDBOX',
      text: 'Drag anything on the desk. Roll the paper to build another joint — click the bud to scatter it, the lighter to fire it up.',
    });
    game.setLabels([{ id: 'l-sb', text: 'drag ↺', anchor: w.paper.group, visible: true }]);
  }

  update(dt: number, game: GameAPI): void {
    const w = game.world;
    w.paper.setProgress(this.progress);

    if (!this.done && this.progress > this.prevProgress()) {
      this.soundTimer -= dt;
      if (this.soundTimer <= 0) {
        this.soundTimer = PAPER_SOUND_INTERVAL;
        game.audio.paper();
        game.track('sandbox-roll');
      }
    }
    if (this.progress >= 1 && !this.done) this.complete(game);

    game.hud.setRollRing(this.done ? null : this.progress);
  }

  exit(game: GameAPI): void {
    game.setLabels([]);
    game.setHint(null);
    game.hud.setRollRing(null);
    game.hud.setBlowVisible(false, null);
    game.hud.setFreeRoam(false, null);
    game.world.zone.hide();
    game.interaction.setTargets([]);
    game.interaction.setZones([]);
    game.interaction.setOrbit(true);
    game.cameraRig.setLimits(1.5, 14, false);
  }

  reset(_game: GameAPI): void {
    this.progress = 0;
    this.done = false;
    this.flame = false;
    this.soundTimer = 0;
  }

  /* ---------------------------------------------------------------- */

  private lastProgress = 0;

  private prevProgress(): number {
    const p = this.lastProgress;
    this.lastProgress = this.progress;
    return p;
  }

  private complete(game: GameAPI): void {
    if (this.done) return;
    this.done = true;
    const w = game.world;
    w.paper.setVisible(false);
    w.filter.setVisible(false);
    w.joint.show();
    w.fx.burst(new THREE.Vector3(LAYOUT.joint.x, LAYOUT.joint.y, LAYOUT.joint.z), {
      count: 30,
      speed: 2,
    });
    game.audio.chime();
    game.toast('Another one, ready to roll.', 'good');
  }

  private scatterBud(game: GameAPI): void {
    const w = game.world;
    for (let i = 0; i < w.bud.totalChunks; i++) {
      w.bud.breakChunk(
        i,
        new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 1.4),
      );
    }
    w.fx.burst(w.bud.group.position.clone().add(TMP.set(0, 0.25, 0)), { count: 10 });
    game.audio.pop();
    game.track('sandbox-break');
  }

  private toggleFlame(game: GameAPI): void {
    this.flame = !this.flame;
    game.world.lighter.setFlame(this.flame);
    if (this.flame) game.audio.ignite();
    else game.audio.click();
    game.track('sandbox-lighter');
  }
}