import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DragTarget, SnapZone } from '../game/GameState';
import type { RaycastManager } from './RaycastManager';
import { clamp } from '../utils/math';
import { Ease } from '../utils/tween';
import type { EaseFn } from '../utils/tween';

export interface DragControllerParams {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  raycast: RaycastManager;
  getTargets: () => DragTarget[];
  getZones: () => SnapZone[];
  onTrack: (id: string) => void;
  controls: OrbitControls;
  reducedMotion: () => boolean;
}

interface MicroTween {
  elapsed: number;
  duration: number;
  ease: EaseFn;
  onUpdate: (k: number) => void;
  onComplete?: () => void;
}

const TAP_SLOP_PX = 7;
const TAP_SLOP_MS = 600;
const LIFT_DUR = 0.12;
const RESTORE_DUR = 0.12;
const SNAP_DUR = 0.14;
const LIFT_Y = 0.08;
const TILT_X = 0.12;
const TILT_Z = -0.08;
const TILT_GAIN = 0.002;
const MAX_DRAG_TILT_Z = 0.25;

function allowsDrag(t: DragTarget): boolean {
  return t.mode === 'drag' || t.mode === 'both';
}

/** Debug/QA surface: state of the active pointer at a given moment. */
export interface DragDebugState {
  activeTarget: string | null;
  point: { x: number; y: number; z: number } | null;
  planeY: number | null;
  grabOffset: { x: number; y: number; z: number } | null;
  zones: Array<{ id: string; contains: boolean }>;
}

/** Pointer state machine: grab / drag / tap / drop-onto-zone, plus hover cursor. */
export class DragController {
  private readonly domElement: HTMLElement;
  private readonly raycast: RaycastManager;
  private readonly getTargets: () => DragTarget[];
  private readonly getZones: () => SnapZone[];
  private readonly onTrack: (id: string) => void;
  private readonly controls: OrbitControls;
  private readonly reducedMotion: () => boolean;
  private readonly prevTouchAction: string;

  private orbitDesired = true;

  private active: DragTarget | null = null;
  private activePointerId = -1;
  private downX = 0;
  private downY = 0;
  private lastX = 0;
  private downTime = 0;
  private totalMove = 0;

  private planeY = 0;
  private restY = 0;
  private readonly restRot = new THREE.Vector3();
  private zTiltFromMove = false;
  private liftTween: MicroTween | null = null;
  private hover: DragTarget | null = null;
  private readonly tweens: MicroTween[] = [];

  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly planePoint = new THREE.Vector3();
  private readonly grabOffset = new THREE.Vector3();
  private readonly currentPoint = new THREE.Vector3();
  private readonly lastMovePoint = new THREE.Vector3();
  private readonly downPoint = new THREE.Vector3();
  private readonly rootWorld = new THREE.Vector3();
  private readonly localPos = new THREE.Vector3();
  private readonly snapLocal = new THREE.Vector3();

  constructor(params: DragControllerParams) {
    this.domElement = params.domElement;
    this.raycast = params.raycast;
    this.getTargets = params.getTargets;
    this.getZones = params.getZones;
    this.onTrack = params.onTrack;
    this.controls = params.controls;
    this.reducedMotion = params.reducedMotion;

    this.prevTouchAction = this.domElement.style.touchAction;
    this.domElement.style.touchAction = 'none';

    const capture = { capture: true, passive: false } as const;
    window.addEventListener('pointerdown', this.onPointerDown, capture);
    window.addEventListener('pointermove', this.onPointerMove, capture);
    window.addEventListener('pointerup', this.onPointerUp, capture);
    window.addEventListener('pointercancel', this.onPointerUp, capture);
  }

  setOrbit(enabled: boolean): void {
    this.orbitDesired = enabled;
    if (this.active === null) this.controls.enabled = enabled;
  }

  update(dt: number): void {
    // Re-assert orbit intent each frame — CameraController restores controls after
    // stage transitions, which would otherwise unlock orbit for ARRANGE/ROLL.
    this.controls.enabled = this.orbitDesired && this.active === null;
    if (this.tweens.length === 0 || dt <= 0) return;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.elapsed += dt;
      const k = Math.min(1, tw.elapsed / tw.duration);
      tw.onUpdate(tw.ease(k));
      if (k >= 1) {
        if (tw === this.liftTween) this.liftTween = null;
        this.tweens.splice(i, 1);
        tw.onComplete?.();
      }
    }
  }

  reset(): void {
    const t = this.active;
    if (t !== null) {
      if (this.activePointerId >= 0 && this.domElement.hasPointerCapture(this.activePointerId)) {
        this.domElement.releasePointerCapture(this.activePointerId);
      }
      t.root.position.y = this.restY;
      t.root.rotation.set(this.restRot.x, this.restRot.y, this.restRot.z);
    }
    this.active = null;
    this.activePointerId = -1;
    this.totalMove = 0;
    this.cancelLift();
    this.tweens.length = 0;
    this.hover = null;
    this.domElement.style.cursor = '';
    this.controls.enabled = this.orbitDesired;
  }

  dispose(): void {
    const capture = { capture: true } as const;
    window.removeEventListener('pointerdown', this.onPointerDown, capture);
    window.removeEventListener('pointermove', this.onPointerMove, capture);
    window.removeEventListener('pointerup', this.onPointerUp, capture);
    window.removeEventListener('pointercancel', this.onPointerUp, capture);
    this.reset();
    this.domElement.style.touchAction = this.prevTouchAction;
  }

  /* ------------------------------- internals ------------------------------ */

  private cancelLift(): void {
    if (!this.liftTween) return;
    const i = this.tweens.indexOf(this.liftTween);
    if (i >= 0) this.tweens.splice(i, 1);
    this.liftTween = null;
  }

  private startSnap(t: DragTarget, zone: SnapZone): void {
    const dest = zone.snapTo(this.currentPoint);
    const parent = t.root.parent;
    this.snapLocal.copy(dest);
    if (parent) parent.worldToLocal(this.snapLocal);
    const root = t.root;
    if (this.reducedMotion()) {
      root.position.copy(this.snapLocal);
      this.onTrack('snap:' + zone.id);
      return;
    }
    const from = root.position.clone();
    const to = this.snapLocal.clone();
    this.tweens.push({
      elapsed: 0,
      duration: SNAP_DUR,
      ease: Ease.outBack,
      onUpdate: (k) => {
        root.position.lerpVectors(from, to, k);
      },
      onComplete: () => {
        this.onTrack('snap:' + zone.id);
      },
    });
  }

  private startRestore(t: DragTarget, includePosition: boolean): void {
    const root = t.root;
    const y0 = root.position.y;
    const rx0 = root.rotation.x;
    const rz0 = root.rotation.z;
    const ty = this.restY;
    const tx = this.restRot.x;
    const tz = this.restRot.z;
    if (this.reducedMotion()) {
      if (includePosition) root.position.y = ty;
      root.rotation.x = tx;
      root.rotation.z = tz;
      return;
    }
    this.tweens.push({
      elapsed: 0,
      duration: RESTORE_DUR,
      ease: Ease.outCubic,
      onUpdate: (k) => {
        if (includePosition) root.position.y = y0 + (ty - y0) * k;
        root.rotation.x = rx0 + (tx - rx0) * k;
        root.rotation.z = rz0 + (tz - rz0) * k;
      },
    });
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || this.active !== null) return;
    const origin = e.target as Node | null;
    if (origin && origin !== this.domElement && !this.domElement.contains(origin)) return;
    this.raycast.setPointer(e.clientX, e.clientY);
    const hit = this.raycast.pickFirst(this.getTargets());
    if (!hit) return;
    const t = hit.target;

    e.stopPropagation();
    this.controls.enabled = false;
    this.domElement.setPointerCapture(e.pointerId);

    this.active = t;
    this.activePointerId = e.pointerId;
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.lastX = e.clientX;
    this.downTime = performance.now();
    this.totalMove = 0;
    this.zTiltFromMove = false;
    this.downPoint.copy(hit.point);

    const root = t.root;
    const dy = t.dragY;
    root.getWorldPosition(this.rootWorld);
    this.planeY = typeof dy === 'number' ? dy : dy ? dy() : this.rootWorld.y;
    this.plane.constant = -this.planeY;

    if (this.raycast.intersectPlane(this.plane, this.planePoint)) {
      this.grabOffset.subVectors(this.rootWorld, this.planePoint);
    } else {
      this.grabOffset.set(0, 0, 0);
    }
    this.currentPoint.copy(this.rootWorld);
    this.lastMovePoint.copy(this.currentPoint);

    t.onGrab?.(t, this.downPoint.clone());
    this.onTrack(t.id);
    this.domElement.style.cursor = 'grabbing';

    this.restY = root.position.y;
    this.restRot.set(root.rotation.x, root.rotation.y, root.rotation.z);

    const skipLift =
      !allowsDrag(t) || t.onMove !== undefined || this.reducedMotion();
    if (!skipLift) {
      const y0 = root.position.y;
      const rx0 = root.rotation.x;
      const rz0 = root.rotation.z;
      const lift: MicroTween = {
        elapsed: 0,
        duration: LIFT_DUR,
        ease: Ease.outCubic,
        onUpdate: (k) => {
          root.position.y = y0 + LIFT_Y * k;
          root.rotation.x = rx0 + TILT_X * k;
          if (!this.zTiltFromMove) root.rotation.z = rz0 + TILT_Z * k;
        },
      };
      this.liftTween = lift;
      this.tweens.push(lift);
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;

    const t = this.active;
    if (t !== null) {
      this.totalMove = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
      e.preventDefault();

      if (t.enabled && allowsDrag(t)) {
        this.raycast.setPointer(e.clientX, e.clientY);
        if (this.raycast.intersectPlane(this.plane, this.planePoint)) {
          this.currentPoint.addVectors(this.planePoint, this.grabOffset);
          const b = t.bounds;
          if (b) {
            this.currentPoint.x = clamp(this.currentPoint.x, b.minX, b.maxX);
            this.currentPoint.z = clamp(this.currentPoint.z, b.minZ, b.maxZ);
          }
          const parent = t.root.parent;
          this.localPos.copy(this.currentPoint);
          if (parent) parent.worldToLocal(this.localPos);
          t.root.position.copy(this.localPos);
          this.zTiltFromMove = true;
          t.root.rotation.z = clamp(-dx * TILT_GAIN, -MAX_DRAG_TILT_Z, MAX_DRAG_TILT_Z);
        }
        const point = this.currentPoint.clone();
        const delta = point.clone().sub(this.lastMovePoint);
        this.lastMovePoint.copy(point);
        t.onMove?.(t, point, delta);
      }

      this.domElement.style.cursor = 'grabbing';
      return;
    }

    if (e.pointerType !== 'mouse') return;
    this.raycast.setPointer(e.clientX, e.clientY);
    const hit = this.raycast.pickFirst(this.getTargets());
    const next = hit ? hit.target : null;
    if (next !== this.hover) {
      if (this.hover) this.hover.onHover?.(this.hover, false);
      if (next) {
        next.onHover?.(next, true);
        this.domElement.style.cursor = next.cursor ?? 'grab';
      } else {
        this.domElement.style.cursor = '';
      }
      this.hover = next;
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const t = this.active;
    if (t === null || e.pointerId !== this.activePointerId) return;

    if (this.domElement.hasPointerCapture(e.pointerId)) {
      this.domElement.releasePointerCapture(e.pointerId);
    }

    const elapsed = performance.now() - this.downTime;
    const wasTap = this.totalMove < TAP_SLOP_PX && elapsed < TAP_SLOP_MS;

    let zone: SnapZone | null = null;
    if (t.enabled) {
      if (wasTap) {
        t.onClick?.(t, this.downPoint.clone());
      } else {
        for (const z of this.getZones()) {
          if (z.enabled !== false && z.contains(this.currentPoint)) {
            zone = z;
            break;
          }
        }
        t.onDrop?.(t, this.currentPoint.clone(), zone);
        if (zone && allowsDrag(t)) this.startSnap(t, zone);
      }
    }

    this.cancelLift();
    const snapPending = zone !== null && allowsDrag(t);
    this.startRestore(t, !snapPending);

    this.controls.enabled = this.orbitDesired;
    this.active = null;
    this.activePointerId = -1;
    this.totalMove = 0;
    this.domElement.style.cursor = this.hover ? this.hover.cursor ?? 'grab' : '';
  };

  /** Debug/QA surface: current active drag state (target, drop point, zones). */
  debug(): DragDebugState {
    if (this.active === null) {
      return { activeTarget: null, point: null, planeY: null, grabOffset: null, zones: [] };
    }
    const zones = this.getZones().map((z) => ({
      id: z.id,
      contains: z.enabled !== false && z.contains(this.currentPoint),
    }));
    return {
      activeTarget: this.active.id,
      point: { x: this.currentPoint.x, y: this.currentPoint.y, z: this.currentPoint.z },
      planeY: this.planeY,
      grabOffset: { x: this.grabOffset.x, y: this.grabOffset.y, z: this.grabOffset.z },
      zones,
    };
  }
}
