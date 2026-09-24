import * as THREE from 'three';
import type { DragTarget, GameAPI, Stage, StageId } from '../game/GameState';
import { BREAK, CAMERA_VIEWS, LAYOUT } from '../game/constants';
import { rand } from '../utils/math';

const DRAG_TMP = new THREE.Vector3();
const CENTER_TMP = new THREE.Vector3();
const IMPULSE_TMP = new THREE.Vector3();
const BREAK_COLORS = ['#4f7d3a', '#6fae4a', '#3a2c18'];

export class BreakStage implements Stage {
  readonly id: StageId = 'BREAK';
  private targets: DragTarget[] = [];
  private broken = 0;
  private completed = false;

  enter(game: GameAPI): void {
    const view = CAMERA_VIEWS[this.id];
    game.cameraRig.moveTo(new THREE.Vector3(...view.pos), new THREE.Vector3(...view.target));
    game.hud.hideContinue();
    game.hud.setRollRing(null);
    game.hud.setBlowVisible(false, null);

    const w = game.world;
    w.bud.clearSpecks();
    w.bud.clearDebris();
    w.bud.setAssembled();
    w.bud.setCoreFormed(false);
    w.bud.setPosition(LAYOUT.budOnTray.x, LAYOUT.budOnTray.y, LAYOUT.budOnTray.z);

    this.targets = w.bud.chunkMeshes().map((mesh, i) => ({
      id: 'chunk:' + i,
      root: mesh,
      mode: 'both',
      enabled: true,
      dragY: () => mesh.getWorldPosition(DRAG_TMP).y,
      onClick: (t, point) => this.handleClick(game, t, point),
    }));

    game.setHint({
      kicker: '03 · BREAK',
      text: 'Click the bud to pop it apart. Drag the pieces to scatter them.',
      progress: this.broken / BREAK.requiredBroken,
      count: this.broken,
      total: BREAK.requiredBroken,
      status:
        this.completed || this.broken >= BREAK.requiredBroken
          ? 'COMPLETE'
          : this.broken > 0
            ? 'IN PROGRESS'
            : 'READY',
    });
    game.setLabels(
      this.broken > 0
        ? []
        : [{ id: 'l-break', text: 'click me', anchor: w.bud.group, visible: true }],
    );
    game.interaction.setTargets(this.targets);
    game.interaction.setZones([]);
    game.interaction.setOrbit(true);
  }

  private handleClick(game: GameAPI, t: DragTarget, point: THREE.Vector3): void {
    if (this.completed) return;
    const w = game.world;

    t.root.getWorldPosition(CENTER_TMP);
    IMPULSE_TMP.subVectors(CENTER_TMP, point).setY(0);
    if (IMPULSE_TMP.lengthSq() < 1e-8) IMPULSE_TMP.set(1, 0, 0);
    IMPULSE_TMP.normalize().multiplyScalar(2.4);
    IMPULSE_TMP.x += rand(-0.35, 0.35);
    IMPULSE_TMP.z += rand(-0.35, 0.35);

    const idx = w.bud.chunkMeshes().findIndex((m) => m === t.root);
    const ok =
      idx >= 0
        ? w.bud.breakChunk(idx, IMPULSE_TMP)
        : w.bud.breakNearest(point, IMPULSE_TMP);
    if (!ok) return;

    w.fx.burst(point, { count: 12, colors: BREAK_COLORS });
    game.audio.pop();
    game.shake(0.08);
    this.broken++;
    game.hud.setHintProgress({
      fraction: Math.min(1, this.broken / BREAK.requiredBroken),
      count: this.broken,
      total: BREAK.requiredBroken,
    });
    game.hud.setHintStatus(
      this.broken >= BREAK.requiredBroken ? 'COMPLETE' : 'IN PROGRESS',
    );
    game.track(t.id);
    if (this.broken > 0) game.setLabels([]);

    if (this.broken >= BREAK.requiredBroken) {
      this.completed = true;
      game.stageComplete('Nice texture.');
    }
  }

  update(_dt: number, _game: GameAPI): void {
    for (const t of this.targets) {
      const ud = t.root.userData;
      if (ud.broken) t.enabled = ud.settled === true;
    }
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
    this.broken = 0;
    this.completed = false;
    this.targets = [];
    game.world.bud.setAssembled();
  }
}
