import * as THREE from 'three';
import type { CursorHand as CursorHandI } from '../game/GameState';
import { damp } from '../utils/math';

/** Stylised grab cursor: a soft amber ring + dot, camera facing. */
export class CursorHand implements CursorHandI {
  readonly group = new THREE.Group();

  private ringGeo = new THREE.TorusGeometry(0.09, 0.018, 10, 24);
  private dotGeo = new THREE.SphereGeometry(0.028, 10, 8);
  private ringMat = new THREE.MeshBasicMaterial({ color: '#e8a552', transparent: true, opacity: 0 });
  private dotMat = new THREE.MeshBasicMaterial({ color: '#ffcf7a', transparent: true, opacity: 0 });

  private target: THREE.Vector3 | null = null;
  private current = new THREE.Vector3();
  private _visible = false;
  private fade = 0;
  private time = 0;

  constructor() {
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.group.add(ring);

    const dot = new THREE.Mesh(this.dotGeo, this.dotMat);
    this.group.add(dot);

    this.group.visible = false;
  }

  setVisible(v: boolean): void {
    this._visible = v;
    if (!v) this.group.visible = false;
  }

  setTarget(obj: THREE.Object3D | null, point?: THREE.Vector3 | null): void {
    if (obj) {
      const p = obj.getWorldPosition(this.current);
      p.y += 0.22;
      this.target = p;
    } else if (point) {
      this.target = point.clone();
      this.target.y += 0.15;
    } else {
      this.target = null;
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;

    if (this.target) {
      this.current.x = damp(this.current.x, this.target.x, 10, dt);
      this.current.y = damp(this.current.y, this.target.y, 10, dt);
      this.current.z = damp(this.current.z, this.target.z, 10, dt);
      this.fade = damp(this.fade, 1, 12, dt);
      this.group.visible = this._visible;
    } else {
      this.fade = damp(this.fade, 0, 8, dt);
      if (this.fade < 0.02) this.group.visible = false;
    }

    this.group.position.copy(this.current);
    this.group.quaternion.copy(camera.quaternion);

    const pulse = 1 + Math.sin(this.time * 6) * 0.06;
    this.group.scale.setScalar(pulse);

    this.ringMat.opacity = 0.9 * this.fade;
    this.dotMat.opacity = 0.9 * this.fade;
  }

  reset(): void {
    this.target = null;
    this.fade = 0;
    this._visible = false;
    this.group.visible = false;
  }

  dispose(): void {
    this.ringGeo.dispose();
    this.dotGeo.dispose();
    this.ringMat.dispose();
    this.dotMat.dispose();
  }
}