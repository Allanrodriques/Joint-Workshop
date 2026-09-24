import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ArrangementBounds, CameraRig } from '../game/GameState';
import { easeInOutCubic } from '../utils/math';

type EaseFn = (t: number) => number;

const linear: EaseFn = (t) => t;

export class CameraController implements CameraRig {
  readonly controls: OrbitControls;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly reducedMotion: () => boolean;

  private transitioning = false;
  private elapsed = 0;
  private duration = 0;
  private ease: EaseFn = easeInOutCubic;
  private enabledBefore = true;
  private readonly fromPos = new THREE.Vector3();
  private readonly toPos = new THREE.Vector3();
  private readonly fromTarget = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();

  private shakeEnergy = 0;
  private readonly shake = new THREE.Vector3();

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    opts: { reducedMotion: () => boolean },
  ) {
    this.camera = camera;
    this.reducedMotion = opts.reducedMotion;

    const c = new OrbitControls(camera, domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.06;
    c.enablePan = false;
    c.minDistance = 1.6;
    c.maxDistance = 9;
    c.maxPolarAngle = 1.32;
    c.minPolarAngle = 0.15;
    c.enableZoom = true;
    c.zoomSpeed = 0.8;
    c.rotateSpeed = 0.7;
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    c.update();
    this.controls = c;
  }

  /** Pull-back factor so portrait aspects keep the desk framed. */
  fitForAspect(aspect: number): number {
    if (aspect <= 0) return 1;
    return Math.pow(Math.max(1, 1.05 / aspect), 0.85);
  }

  moveTo(pos: THREE.Vector3, target: THREE.Vector3, duration = 1.4): void {
    const fit = this.fitForAspect(this.camera.aspect);
    this.fromPos.copy(this.camera.position).sub(this.shake);
    this.fromTarget.copy(this.controls.target);
    this.toTarget.copy(target);
    this.toPos.copy(pos).sub(target).multiplyScalar(fit).add(target);

    const reduced = this.reducedMotion();
    this.duration = Math.max(0.0001, reduced ? 0.35 : duration);
    this.ease = reduced ? linear : easeInOutCubic;
    this.elapsed = 0;
    this.enabledBefore = this.controls.enabled;
    this.transitioning = true;
    this.controls.enabled = false;
  }

  setImmediate(pos: THREE.Vector3, target: THREE.Vector3): void {
    const fit = this.fitForAspect(this.camera.aspect);
    this.transitioning = false;
    this.shake.set(0, 0, 0);
    this.camera.position.copy(pos).sub(target).multiplyScalar(fit).add(target);
    this.controls.target.copy(target);
    this.camera.lookAt(target);
    if (this.controls.enabled) this.controls.update();
  }

  addShake(amount: number): void {
    if (amount > 0) this.shakeEnergy += amount;
  }

  /**
   * Aspect-aware framing for "tabletop" stages. Picks an elevation angle and then
   * binary-searches the camera distance so the given desk bounds project to about
   * `fill` of the shortest viewport axis, leaving a margin on every aspect ratio.
   */
  frameArrangement(bounds: ArrangementBounds, duration = 1.4): void {
    const el = bounds.elevation ?? Math.PI / 3.6; // ~50deg over the desk
    const y = bounds.y ?? 0.06;
    const fill = bounds.fill ?? 0.68;
    const cx = bounds.cx ?? (bounds.minX + bounds.maxX) / 2;
    const cz = bounds.cz ?? (bounds.minZ + bounds.maxZ) / 2;

    const dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el)).normalize();
    const target = new THREE.Vector3(cx, y, cz);

    const pts = [
      new THREE.Vector3(bounds.minX, 0, bounds.minZ),
      new THREE.Vector3(bounds.maxX, 0, bounds.minZ),
      new THREE.Vector3(bounds.minX, 0, bounds.maxZ),
      new THREE.Vector3(bounds.maxX, 0, bounds.maxZ),
      new THREE.Vector3(bounds.minX, 0, (bounds.minZ + bounds.maxZ) / 2),
      new THREE.Vector3(bounds.maxX, 0, (bounds.minZ + bounds.maxZ) / 2),
      new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0, bounds.minZ),
      new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0, bounds.maxZ),
    ];

    const ndc = new THREE.Vector3();
    const projectSpan = (d: number): number => {
      const pos = dir.clone().multiplyScalar(d).add(target);
      const tmpPos = new THREE.Vector3().copy(this.camera.position);
      const tmpTgt = new THREE.Vector3().copy(this.controls.target);
      this.camera.position.copy(pos);
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld(true);
      this.camera.updateProjectionMatrix();
      let max = 0;
      for (const p of pts) {
        ndc.copy(p).project(this.camera);
        if (ndc.z > 1) continue; // behind camera during search
        max = Math.max(max, Math.abs(ndc.x), Math.abs(ndc.y));
      }
      this.camera.position.copy(tmpPos);
      this.controls.target.copy(tmpTgt);
      this.camera.updateMatrixWorld(true);
      return max;
    };

    let lo = 1.5;
    let hi = 30;
    for (let i = 0; i < 40 && hi - lo > 1e-3; i++) {
      const mid = (lo + hi) / 2;
      if (projectSpan(mid) > fill) lo = mid;
      else hi = mid;
    }

    const d = (lo + hi) / 2;
    const pos = dir.clone().multiplyScalar(d).add(target);
    // moveTo re-applies fitForAspect, so undo it here to land exactly on `pos`
    const fit = this.fitForAspect(this.camera.aspect);
    const raw = pos.clone().sub(target).divideScalar(fit).add(target);
    this.moveTo(raw, target, duration);
  }

  setLimits(minDistance: number, maxDistance: number, pan: boolean): void {
    this.controls.minDistance = minDistance;
    this.controls.maxDistance = maxDistance;
    this.controls.enablePan = pan;
    this.controls.update();
  }

  setControlsEnabled(v: boolean): void {
    if (this.transitioning) this.enabledBefore = v;
    else this.controls.enabled = v;
  }

  update(dt: number): void {
    const d = dt > 0 ? dt : 0;
    let wrotePosition = false;

    if (this.transitioning) {
      this.elapsed += d;
      const k = Math.min(this.elapsed / this.duration, 1);
      const e = this.ease(k);
      this.camera.position.lerpVectors(this.fromPos, this.toPos, e);
      this.controls.target.lerpVectors(this.fromTarget, this.toTarget, e);
      // OrbitControls only orients the camera when enabled; stages that lock orbit
      // (ARRANGE / ROLL) would otherwise keep the previous stage's view direction.
      this.camera.lookAt(this.controls.target);
      wrotePosition = true;
      if (k >= 1) {
        this.transitioning = false;
        this.controls.enabled = this.enabledBefore;
      }
    }

    if (!wrotePosition) this.camera.position.sub(this.shake);

    this.shakeEnergy *= Math.exp(-6 * d);
    this.shake.set(0, 0, 0);
    if (this.shakeEnergy > 1e-4) {
      const s = this.shakeEnergy;
      this.shake.set(
        (Math.random() - 0.5) * 0.16 * s,
        (Math.random() - 0.5) * 0.12 * s,
        (Math.random() - 0.5) * 0.16 * s,
      );
    }

    if (this.transitioning) this.controls.enabled = false;
    if (this.controls.enabled) this.controls.update();

    this.camera.position.add(this.shake);
  }

  dispose(): void {
    this.controls.dispose();
  }
}
