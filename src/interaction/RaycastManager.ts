import * as THREE from 'three';
import type { DragTarget } from '../game/GameState';

/** Thin wrapper over THREE.Raycaster driven by pointer NDC coordinates. */
export class RaycastManager {
  readonly scene: THREE.Scene;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private pointerX = Number.NaN;
  private pointerY = Number.NaN;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, scene: THREE.Scene) {
    this.camera = camera;
    this.domElement = domElement;
    this.scene = scene;
  }

  /** Record the latest pointer position (screen space); NDC is derived on each pick. */
  setPointer(clientX: number, clientY: number): void {
    this.pointerX = clientX;
    this.pointerY = clientY;
  }

  private updateNDC(): void {
    const rect = this.domElement.getBoundingClientRect();
    if (
      !Number.isFinite(this.pointerX) ||
      !Number.isFinite(this.pointerY) ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      this.ndc.set(0, 0);
      return;
    }
    const x = (this.pointerX - rect.left) / rect.width;
    const y = (this.pointerY - rect.top) / rect.height;
    this.ndc.set(x * 2 - 1, -(y * 2 - 1));
  }

  pick(objects: THREE.Object3D[], recursive = true): THREE.Intersection | null {
    this.updateNDC();
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(objects, recursive);
    return hits.length > 0 ? hits[0] : null;
  }

  pickFirst(
    targets: DragTarget[],
  ): { target: DragTarget; point: THREE.Vector3; object: THREE.Object3D } | null {
    const enabled: DragTarget[] = [];
    const roots: THREE.Object3D[] = [];
    for (const t of targets) {
      if (!t.enabled) continue;
      enabled.push(t);
      t.root.userData.draggable = true;
      if (roots.indexOf(t.root) < 0) roots.push(t.root);
    }
    if (roots.length === 0) return null;

    this.updateNDC();
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(roots, true);
    for (const hit of hits) {
      const target = this.resolveRoot(hit.object, enabled);
      if (target) return { target, point: hit.point.clone(), object: hit.object };
    }
    return null;
  }

  /** Intersect the current pick ray with a plane (uses the last pointer position). */
  intersectPlane(plane: THREE.Plane, out: THREE.Vector3): THREE.Vector3 | null {
    this.updateNDC();
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray.intersectPlane(plane, out);
  }

  resolveRoot(obj: THREE.Object3D, targets: DragTarget[]): DragTarget | null {
    let node: THREE.Object3D | null = obj;
    while (node) {
      for (const t of targets) {
        if (t.root === node) return t;
      }
      if (node.userData && node.userData.draggable === true) {
        for (const t of targets) {
          if (t.root.userData === node.userData) return t;
        }
      }
      node = node.parent;
    }
    return null;
  }

  clear(): void {
    this.pointerX = Number.NaN;
    this.pointerY = Number.NaN;
    this.ndc.set(0, 0);
  }
}
