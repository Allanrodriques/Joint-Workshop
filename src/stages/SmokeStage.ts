import * as THREE from 'three';
import type { GameAPI, Stage, StageId } from '../game/GameState';
import { CAMERA_VIEWS, LAYOUT } from '../game/constants';
import { clamp } from '../utils/math';

const U_AXIS = /* @__PURE__ */ new THREE.Vector3(0, 1, 0);
const STEER_GAIN = 0.011;
const PITCH_GAIN = 0.006;
const DISTURB_RADIUS = 2.3;
const FADE_S = 1.7;

/**
 * The final cinematic smoke scene. Smoke keeps rising indefinitely until the
 * user presses END SESSION — hold BLOW SMOKE and drag to steer the cloud.
 */
export class SmokeStage implements Stage {
  readonly id: StageId = 'SMOKE';

  private game: GameAPI | null = null;
  private blowHeld = false;
  private steer = 0;
  private pitch = 0.18;
  private finishing = false;
  private gone = false;
  private onWindowMove: ((e: PointerEvent) => void) | null = null;

  enter(game: GameAPI): void {
    const view = CAMERA_VIEWS[this.id];
    game.cameraRig.moveTo(new THREE.Vector3(...view.pos), new THREE.Vector3(...view.target));
    game.hud.hideContinue();
    game.hud.setRollRing(null);
    game.hud.setBlowVisible(false, null);

    this.game = game;
    this.blowHeld = false;
    this.steer = 0;
    this.pitch = 0.18;
    this.finishing = false;
    this.gone = false;

    const w = game.world;
    w.smoke.setEmitter((out) => w.joint.getTipWorld(out));
    w.smoke.setMotionReduced(game.reducedMotion());
    w.smoke.setDisturber(null);
    w.joint.setLit(true);
    w.lighter.flyTo(
      new THREE.Vector3(LAYOUT.joint.x + 1.35, LAYOUT.joint.y + 0.1, LAYOUT.joint.z),
      0.9,
      () => {
        w.lighter.setFlame(true);
        game.audio.ignite();
        game.shake(0.08);
        game.tweens.add({
          duration: 0.45,
          delay: 0.35,
          onUpdate: () => {},
          onComplete: () => {
            w.lighter.setFlame(false);
            w.lighter.goHome(0.8);
            w.smoke.start();
          },
        });
      },
    );

    game.setHint({
      kicker: '06 · SMOKE',
      text: 'Hold BLOW SMOKE and drag to steer the cloud. It rises until you say END SESSION.',
    });
    game.setLabels([{ id: 'l-ember', text: 'ember', anchor: w.joint.group, visible: true }]);
    game.interaction.setTargets([]);
    game.interaction.setZones([]);
    game.interaction.setOrbit(true);
    game.cameraRig.setLimits(1.2, 8, true);

    game.hud.setSmokePanel(true, {
      onBlowStart: () => {
        this.blowHeld = true;
        game.audio.whoosh();
        game.track('blow');
      },
      onBlowMove: (dx, dy) => {
        if (!this.blowHeld) return;
        this.steer = clamp(this.steer + dx * STEER_GAIN, -4, 4);
        this.pitch = clamp(this.pitch - dy * PITCH_GAIN, -0.15, 1.35);
      },
      onBlowEnd: () => {
        this.blowHeld = false;
      },
      onEnd: () => this.endSession(game),
    });
    game.hud.setSmokeStatus('SMOKE RISING', false);

    this.onWindowMove = (e: PointerEvent) => this.handleWindowMove(e);
    window.addEventListener('pointermove', this.onWindowMove);
  }

  update(_dt: number, game: GameAPI): void {
    if (this.finishing) return;

    const w = game.world;
    const S = w.smoke.blowStrength;

    if (this.blowHeld) {
      w.smoke.setBlow(true, this.currentBlowDir(game));
    } else {
      w.smoke.setBlow(false, U_AXIS);
    }

    game.audio.blow(S);
    if (!game.reducedMotion() && S > 0.25) game.shake(0.012 * S);

    const blowing = S > 0.05;
    game.hud.setSmokeStatus(blowing ? 'BLOWING' : 'SMOKE RISING', blowing);
  }

  exit(game: GameAPI): void {
    if (this.onWindowMove) {
      window.removeEventListener('pointermove', this.onWindowMove);
      this.onWindowMove = null;
    }
    this.game = null;
    this.blowHeld = false;
    this.steer = 0;
    this.pitch = 0.18;
    game.setLabels([]);
    game.setHint(null);
    game.hud.setRollRing(null);
    game.hud.setBlowVisible(false, null);
    game.hud.setSmokePanel(false, null);
    game.audio.blow(0);
    game.world.zone.hide();
    game.interaction.setTargets([]);
    game.interaction.setZones([]);
    game.interaction.setOrbit(true);
    game.world.smoke.setDisturber(null);
  }

  reset(): void {
    this.game?.world.smoke.setDisturber(null);
    this.game = null;
    this.blowHeld = false;
    this.steer = 0;
    this.pitch = 0.18;
    this.finishing = false;
    this.gone = false;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                        */
  /* ---------------------------------------------------------------- */

  private currentBlowDir(game: GameAPI): THREE.Vector3 {
    const cam = game.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, U_AXIS).normalize();
    const fwdXZ = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();

    const horiz = new THREE.Vector3()
      .addScaledVector(fwdXZ, 1)
      .addScaledVector(right, this.steer);
    horiz.y = 0;
    if (horiz.lengthSq() > 0.0001) horiz.normalize();

    const cosP = Math.cos(this.pitch);
    return new THREE.Vector3(horiz.x * cosP, Math.sin(this.pitch), horiz.z * cosP);
  }

  private handleWindowMove(e: PointerEvent): void {
    const game = this.game;
    if (!game || this.finishing) return;
    const target = e.target as Element | null;
    if (
      target &&
      typeof target.closest === 'function' &&
      target.closest('.smoke-ui,.hud,.hint,.modal,.overlay,.progress')
    ) {
      game.world.smoke.setDisturber(null);
      return;
    }
    const canvas = document.getElementById('scene');
    if (!canvas || e.target !== canvas) {
      game.world.smoke.setDisturber(null);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, game.camera);

    const tip = new THREE.Vector3();
    game.world.joint.getTipWorld(tip);
    const plane = new THREE.Plane(U_AXIS, -tip.y);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, hit)) {
      hit.y = tip.y;
      if (Math.abs(hit.x - tip.x) < DISTURB_RADIUS && Math.abs(hit.z - tip.z) < DISTURB_RADIUS) {
        game.world.smoke.setDisturber(hit);
      } else {
        game.world.smoke.setDisturber(null);
      }
    }
  }

  private endSession(game: GameAPI): void {
    if (this.finishing) return;
    this.finishing = true;
    this.blowHeld = false;
    this.steer = 0;
    this.pitch = 0.18;

    game.track('smoke-end');
    game.hud.setSmokePanel(false, null);
    game.hud.setSmokeStatus('DISPERSING', true);
    game.audio.blow(0);
    game.world.smoke.setDisturber(null);
    game.world.smoke.setBlow(false, U_AXIS);
    game.world.smoke.fadeOut(FADE_S);
    game.world.joint.setLit(false);

    const view = CAMERA_VIEWS.FINAL;
    game.cameraRig.moveTo(
      new THREE.Vector3(...view.pos),
      new THREE.Vector3(...view.target),
      FADE_S,
    );

    game.tweens.add({
      duration: FADE_S + 0.15,
      onUpdate: () => {},
      onComplete: () => {
        if (this.gone) return;
        this.gone = true;
        game.go('FINAL');
      },
    });
  }
}