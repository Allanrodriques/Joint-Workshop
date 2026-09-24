import * as THREE from 'three';
import { clamp, smoothstep } from '../utils/math';

export interface IntroCameraKey {
  t: number;
  pos: [number, number, number];
  target: [number, number, number];
}

const ORBIT_AMP = 0.05;
const PARALLAX_POS = 0.2;
const PARALLAX_TARGET = 0.05;

/**
 * Cinematic keyframe camera for the intro sequence.
 *
 * Walks a hand-authored path with smooth easing, adds a tiny continuous
 * drift so the frame never feels static, and reacts gently to the pointer
 * (parallax). All motion is disabled/compressed under reduced motion.
 */
export class IntroCamera {
  readonly camera: THREE.PerspectiveCamera;

  private readonly reduced: boolean;
  private keys: IntroCameraKey[] = [];
  private mouseX = 0;
  private mouseY = 0;

  private readonly aPos = new THREE.Vector3();
  private readonly bPos = new THREE.Vector3();
  private readonly aTarget = new THREE.Vector3();
  private readonly bTarget = new THREE.Vector3();
  private readonly next = new THREE.Vector3();

  constructor(aspect: number, reduced: boolean) {
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.05, 40);
    this.reduced = reduced;
  }

  setPath(keys: IntroCameraKey[]): void {
    this.keys = keys.slice().sort((a, b) => a.t - b.t);
  }

  setMouse(nx: number, ny: number): void {
    this.mouseX = clamp(nx, -1, 1);
    this.mouseY = clamp(ny, -1, 1);
  }

  resize(aspect: number): void {
    this.camera.aspect = Math.max(0.0001, aspect);
    this.camera.updateProjectionMatrix();
  }

  update(time: number): void {
    const n = this.keys.length;
    if (n === 0) return;

    let i = 0;
    while (i < n - 2 && time >= this.keys[i + 1].t) i++;
    const a = this.keys[i];
    const b = this.keys[Math.min(i + 1, n - 1)];
    const span = Math.max(0.0001, b.t - a.t);
    const k = smoothstep(clamp((time - a.t) / span, 0, 1));

    this.aPos.set(...a.pos);
    this.bPos.set(...b.pos);
    this.aTarget.set(...a.target);
    this.bTarget.set(...b.target);

    this.next.lerpVectors(this.aPos, this.bPos, k);
    this.camera.position.copy(this.next);

    this.next.lerpVectors(this.aTarget, this.bTarget, k);
    const baseTarget = this.next.clone();

    if (!this.reduced) {
      // Gentle constant drift keeps the frame alive between keyframes.
      this.camera.position.x += Math.sin(time * 0.21) * ORBIT_AMP;
      this.camera.position.y += Math.sin(time * 0.15 + 1.3) * 0.8 * ORBIT_AMP;
      this.camera.position.z += Math.cos(time * 0.18) * ORBIT_AMP;

      // Pointer parallax.
      const px = this.mouseX * PARALLAX_POS;
      const py = this.mouseY * PARALLAX_POS;
      const lookShift = this.mouseX * PARALLAX_TARGET;
      baseTarget.x += lookShift;
      baseTarget.y += this.mouseY * PARALLAX_TARGET;
      this.camera.position.x += px;
      this.camera.position.y += py;
    }

    this.camera.lookAt(baseTarget);
  }

  dispose(): void {
    // Nothing to release — the camera is owned by whoever rendered the scene.
  }
}