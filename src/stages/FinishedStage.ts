import * as THREE from 'three';
import type { GameAPI, Stage, StageId } from '../game/GameState';
import { CAMERA_VIEWS, LAYOUT } from '../game/constants';

export class FinishedStage implements Stage {
  readonly id: StageId = 'FINISHED';

  enter(game: GameAPI): void {
    const view = CAMERA_VIEWS[this.id];
    game.cameraRig.moveTo(new THREE.Vector3(...view.pos), new THREE.Vector3(...view.target));
    game.hud.hideContinue();
    game.hud.setRollRing(null);
    game.hud.setBlowVisible(false, null);

    const w = game.world;
    w.joint.show();
    w.joint.setSpin(true);
    w.fx.burst(new THREE.Vector3(LAYOUT.joint.x, LAYOUT.joint.y, LAYOUT.joint.z), {
      count: 30,
      speed: 1.8,
    });
    game.audio.chime();

    game.hud.showFinished(() => game.go('SMOKE'));
    game.setHint(null);
    game.setLabels([]);
    game.interaction.setTargets([]);
    game.interaction.setZones([]);
    game.interaction.setOrbit(true);
    game.cameraRig.setLimits(1.4, 6, false);
  }

  update(_dt: number, _game: GameAPI): void {}

  exit(game: GameAPI): void {
    game.hud.hideFinished();
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
    game.world.joint.setSpin(false);
  }
}
