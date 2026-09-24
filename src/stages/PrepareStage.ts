import * as THREE from 'three';
import type { DragTarget, GameAPI, SnapZone, Stage, StageId } from '../game/GameState';
import { CAMERA_VIEWS, LAYOUT } from '../game/constants';

const GREENS = ['#4f7d3a', '#6fae4a', '#7ddc6a', '#3f5f2c'];

export class PrepareStage implements Stage {
  readonly id: StageId = 'PREPARE';
  private prepared = false;

  enter(game: GameAPI): void {
    const view = CAMERA_VIEWS[this.id];
    game.cameraRig.moveTo(new THREE.Vector3(...view.pos), new THREE.Vector3(...view.target));
    game.hud.hideContinue();
    game.hud.setRollRing(null);
    game.hud.setBlowVisible(false, null);
    game.hud.setChoiceBar({ ...game.choices });

    const w = game.world;
    w.bud.setCoreFormed(false);
    if (this.prepared) {
      w.bud.setPosition(LAYOUT.budOnTray.x, LAYOUT.budOnTray.y, LAYOUT.budOnTray.z);
    } else {
      w.bud.setPosition(LAYOUT.budStart.x, LAYOUT.budStart.y, LAYOUT.budStart.z);
    }
    w.paper.setVisible(false);
    w.joint.hide();
    w.filter.setVisible(true);
    w.zone.hide();

    game.setHint({
      kicker: '01 · PREPARE',
      text: this.prepared
        ? 'The material sits on the tray — ready to roll.'
        : 'Drag the green material onto the tray.',
      progress: this.prepared ? 1 : 0,
      count: this.prepared ? 1 : 0,
      total: 1,
      status: this.prepared ? 'COMPLETE' : 'READY',
    });
    game.setLabels(
      this.prepared
        ? []
        : [{ id: 'l-bud', text: 'material →', anchor: w.bud.group, visible: true }],
    );

    const target: DragTarget = {
      id: 'bud',
      root: w.bud.group,
      mode: 'both',
      enabled: true,
      dragY: () => w.bud.group.position.y,
      onGrab: () => {
        if (!this.prepared) {
          game.hud.setHintStatus('INTERACTING');
          game.setHint({
            kicker: '01 · PREPARE',
            text: 'Carry the material over the tray.',
            progress: 0,
            count: 0,
            total: 1,
            status: 'INTERACTING',
          });
        }
      },
      onDrop: (_t, _point, zone) => {
        this.handleDrop(game, zone, _point);
      },
    };
    const zone: SnapZone = {
      id: 'tray',
      contains: (p) => w.tray.contains(p),
      snapTo: () => new THREE.Vector3(LAYOUT.budOnTray.x, LAYOUT.budOnTray.y, LAYOUT.budOnTray.z),
    };

    game.interaction.setTargets([target]);
    game.interaction.setZones([zone]);
    game.interaction.setOrbit(true);
  }

  private handleDrop(game: GameAPI, zone: SnapZone | null, point: THREE.Vector3): void {
    if (!zone) return;
    const w = game.world;
    w.fx.burst(point, { count: 10, colors: GREENS });
    game.audio.place();
    game.shake(0.06);
    if (this.prepared) return;
    this.prepared = true;
    game.hud.setHintProgress({ fraction: 1, count: 1, total: 1 });
    game.hud.setHintStatus('COMPLETE');
    game.setHint({
      kicker: '01 · PREPARE',
      text: 'The material sits on the tray — ready to roll.',
      progress: 1,
      count: 1,
      total: 1,
      status: 'COMPLETE',
    });
    game.setLabels([]);
    game.tweens.add({
      duration: 0.35,
      onUpdate: () => {},
      onComplete: () => game.stageComplete('Nice. Ready for the next step.'),
    });
  }

  update(_dt: number, _game: GameAPI): void {}

  exit(game: GameAPI): void {
    game.setLabels([]);
    game.setHint(null);
    game.hud.setRollRing(null);
    game.hud.setBlowVisible(false, null);
    game.hud.setChoiceBar(null);
    game.world.zone.hide();
    game.interaction.setTargets([]);
    game.interaction.setZones([]);
    game.interaction.setOrbit(true);
  }

  reset(game: GameAPI): void {
    this.prepared = false;
    const bud = game.world.bud;
    bud.setCoreFormed(false);
    bud.setPosition(LAYOUT.budStart.x, LAYOUT.budStart.y, LAYOUT.budStart.z);
  }
}
