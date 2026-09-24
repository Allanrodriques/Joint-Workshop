import * as THREE from 'three';
import type { DragTarget, GameAPI, SnapZone, Stage, StageId } from '../game/GameState';
import { CAMERA_VIEWS, CLEAN, LAYOUT } from '../game/constants';

const DIRT_COLORS = ['#a08a55', '#4a3322', '#5b8f2e'];

export class CleanStage implements Stage {
  readonly id: StageId = 'CLEAN';
  private targets: DragTarget[] = [];
  private cleaned = 0;
  private total = 0;
  private completed = false;
  private readonly dropPos = new THREE.Vector3();

  private readonly discardZone: SnapZone = {
    id: 'discard',
    contains: (p) =>
      Math.hypot(p.x - LAYOUT.discard.x, p.z - LAYOUT.discard.z) < 0.52,
    snapTo: () =>
      new THREE.Vector3(LAYOUT.discard.x, LAYOUT.discard.y + 0.38, LAYOUT.discard.z),
  };

  enter(game: GameAPI): void {
    const view = CAMERA_VIEWS[this.id];
    game.cameraRig.moveTo(new THREE.Vector3(...view.pos), new THREE.Vector3(...view.target));
    game.hud.hideContinue();
    game.hud.setRollRing(null);
    game.hud.setBlowVisible(false, null);

    const w = game.world;
    w.bud.setCoreFormed(false);

    const dest = new THREE.Vector3(LAYOUT.budOnTray.x, LAYOUT.budOnTray.y, LAYOUT.budOnTray.z);
    const from = w.bud.group.position.clone();
    if (game.reducedMotion() || from.distanceTo(dest) < 1e-4) {
      w.bud.group.position.copy(dest);
    } else {
      game.tweens.add({
        duration: 0.45,
        onUpdate: (k) => {
          w.bud.group.position.lerpVectors(from, dest, k);
        },
      });
    }

    w.bud.clearSpecks();
    w.bud.spawnDebris(CLEAN.debrisCount);
    this.total = w.bud.debrisMeshes().length;
    this.cleaned = 0;
    this.completed = false;

    this.discardZone.enabled = true;
    this.targets = w.bud.debrisMeshes().map((root, i) => ({
      id: 'debris:' + i,
      root,
      mode: 'drag',
      enabled: true,
      cursor: 'grab',
      bounds: { minX: -2.4, maxX: 2.4, minZ: -1.5, maxZ: 1.6 },
      onGrab: () => {
        game.audio.pop();
        game.hud.setHintStatus('INTERACTING');
        game.world.zone.showAt(
          new THREE.Vector3(LAYOUT.discard.x, 0.06, LAYOUT.discard.z),
          0.52,
          true,
        );
      },
      onDrop: (t, _point, zone) => this.handleDrop(game, t, zone),
    }));

    game.setHint({
      kicker: '02 · CLEAN UP',
      text: `Sort the shake: 0/${this.total}. Drag stems & seeds into the bin.`,
      progress: 0,
      count: 0,
      total: this.total,
      status: 'READY',
    });
    game.setLabels([
      { id: 'l-debris', text: 'pick out', anchor: w.bud.group, visible: true },
      { id: 'l-bin', text: 'bin', anchor: w.discard.group, visible: true },
    ]);
    game.interaction.setTargets(this.targets);
    game.interaction.setZones([this.discardZone]);
    game.interaction.setOrbit(true);
  }

  private handleDrop(game: GameAPI, t: DragTarget, zone: SnapZone | null): void {
    if (this.completed) return;
    const w = game.world;
    game.world.zone.hide();
    if (!zone || zone.id !== 'discard') return;
    if (!w.bud.removeDebris(t.root)) return;

    t.root.getWorldPosition(this.dropPos);
    w.fx.burst(this.dropPos, { count: 10, colors: DIRT_COLORS });
    game.audio.pop();
    game.shake(0.04);
    t.enabled = false;
    this.cleaned++;
    const p = this.total > 0 ? this.cleaned / this.total : 0;
    game.hud.setHintProgress({ fraction: p, count: this.cleaned, total: this.total });
    game.track(t.id);
    game.setHint({
      kicker: '02 · CLEAN UP',
      text: `Sort the shake: ${this.cleaned}/${this.total}. Drag stems & seeds into the bin.`,
      progress: p,
      count: this.cleaned,
      total: this.total,
      status: p >= 1 ? 'COMPLETE' : 'IN PROGRESS',
    });

    if (this.total > 0 && this.cleaned >= this.total) {
      this.completed = true;
      game.setLabels([]);
      game.stageComplete('Workspace ready.');
    }
  }

  update(_dt: number, _game: GameAPI): void {}

  exit(game: GameAPI): void {
    game.world.zone.hide();
    game.setLabels([]);
    game.setHint(null);
    game.hud.setRollRing(null);
    game.hud.setBlowVisible(false, null);
    game.interaction.setTargets([]);
    game.interaction.setZones([]);
    game.interaction.setOrbit(true);
  }

  reset(): void {
    this.cleaned = 0;
    this.total = 0;
    this.completed = false;
    this.targets = [];
  }
}