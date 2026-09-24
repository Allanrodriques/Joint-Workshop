import type { PerspectiveCamera, Scene } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  DragTarget,
  InteractionManager as InteractionManagerContract,
  SnapZone,
} from '../game/GameState';
import { RaycastManager } from './RaycastManager';
import { DragController, type DragDebugState } from './DragController';

export interface InteractionManagerOpts {
  camera: PerspectiveCamera;
  scene: Scene;
  domElement: HTMLElement;
  controls: OrbitControls;
  onTrack: (id: string) => void;
  reducedMotion: () => boolean;
}

/** Implements the GameState InteractionManager contract: owns raycast + drag state. */
export class InteractionManager implements InteractionManagerContract {
  readonly controls: OrbitControls;

  private readonly raycast: RaycastManager;
  private readonly drag: DragController;
  private targets: DragTarget[] = [];
  private zones: SnapZone[] = [];

  constructor(opts: InteractionManagerOpts) {
    this.controls = opts.controls;
    this.raycast = new RaycastManager(opts.camera, opts.domElement, opts.scene);
    this.drag = new DragController({
      camera: opts.camera,
      domElement: opts.domElement,
      raycast: this.raycast,
      getTargets: () => this.targets,
      getZones: () => this.zones,
      onTrack: opts.onTrack,
      controls: opts.controls,
      reducedMotion: opts.reducedMotion,
    });
    opts.controls.enableRotate = true;
  }

  setTargets(targets: DragTarget[]): void {
    this.targets = targets;
  }

  get targetsLive(): readonly DragTarget[] {
    return this.targets;
  }

  get zonesLive(): readonly SnapZone[] {
    return this.zones;
  }

  debugDrag(): DragDebugState {
    return this.drag.debug();
  }

  setZones(zones: SnapZone[]): void {
    this.zones = zones;
  }

  setOrbit(enabled: boolean): void {
    this.controls.enableRotate = enabled;
    this.drag.setOrbit(enabled);
  }

  update(dt: number): void {
    this.drag.update(dt);
  }

  reset(): void {
    this.drag.reset();
  }

  dispose(): void {
    this.drag.dispose();
    this.raycast.clear();
  }
}
