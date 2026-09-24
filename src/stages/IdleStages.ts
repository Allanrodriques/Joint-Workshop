import * as THREE from 'three';
import type { DragTarget, GameAPI, Stage, StageId } from '../game/GameState';
import { CAMERA_VIEWS } from '../game/constants';

const ROAM_TMP = new THREE.Vector3();

function sharedEnter(game: GameAPI, id: StageId): void {
  const view = CAMERA_VIEWS[id];
  game.cameraRig.moveTo(new THREE.Vector3(...view.pos), new THREE.Vector3(...view.target));
  game.hud.hideContinue();
  game.hud.setRollRing(null);
  game.hud.setBlowVisible(false, null);
}

function sharedExit(game: GameAPI): void {
  game.setLabels([]);
  game.setHint(null);
  game.hud.setRollRing(null);
  game.hud.setBlowVisible(false, null);
  game.world.zone.hide();
  game.interaction.setTargets([]);
  game.interaction.setZones([]);
  game.interaction.setOrbit(true);
}

export class IntroStage implements Stage {
  readonly id: StageId = 'INTRO';

  enter(game: GameAPI): void {
    sharedEnter(game, this.id);
    game.setHint(null);
    game.setLabels([]);
    game.interaction.setTargets([]);
    game.interaction.setZones([]);
    game.interaction.setOrbit(true);
  }

  update(_dt: number, _game: GameAPI): void {}

  exit(game: GameAPI): void {
    sharedExit(game);
  }

  reset(): void {}
}

export class FinalStage implements Stage {
  readonly id: StageId = 'FINAL';

  enter(game: GameAPI): void {
    sharedEnter(game, this.id);
    game.setHint(null);
    game.setLabels([]);
    game.interaction.setTargets([]);
    game.interaction.setZones([]);
    game.interaction.setOrbit(true);
    game.cameraRig.setLimits(1.6, 9, false);
  }

  update(_dt: number, _game: GameAPI): void {}

  exit(game: GameAPI): void {
    sharedExit(game);
  }

  reset(): void {}
}

export class FreeRoamStage implements Stage {
  readonly id: StageId = 'FREE_ROAM';

  enter(game: GameAPI): void {
    sharedEnter(game, this.id);

    const w = game.world;
    const mk = (name: string, root: THREE.Object3D): DragTarget => ({
      id: 'roam:' + name,
      root,
      mode: 'drag',
      enabled: true,
      dragY: () => root.getWorldPosition(ROAM_TMP).y,
    });

    game.interaction.setTargets([
      mk('bud', w.bud.group),
      mk('paper', w.paper.group),
      mk('filter', w.filter.group),
      mk('joint', w.joint.group),
      mk('lighter', w.lighter.group),
      mk('ashtray', w.ashtray.group),
    ]);
    game.interaction.setZones([]);
    game.interaction.setOrbit(true);
    game.cameraRig.setLimits(1.2, 10, true);
    game.hud.setFreeRoam(true, () => game.go('FINAL'), () => game.enterPhotoMode());
    game.setHint({
      kicker: 'FREE ROAM',
      text: 'Orbit, zoom and drag anything on the desk.',
    });
    game.setLabels([]);
  }

  update(_dt: number, _game: GameAPI): void {}

  exit(game: GameAPI): void {
    sharedExit(game);
    game.hud.setFreeRoam(false, null);
    game.cameraRig.setLimits(1.6, 9, false);
  }

  reset(): void {}
}
