import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/* ------------------------------------------------------------------ */
/* Core enums / state                                                 */
/* ------------------------------------------------------------------ */

export type StageId =
  | 'INTRO'
  | 'PREPARE'
  | 'CLEAN'
  | 'BREAK'
  | 'ARRANGE'
  | 'ROLL'
  | 'FINISHED'
  | 'SMOKE'
  | 'FINAL'
  | 'FREE_ROAM';

export type GraphicsLevel = 'high' | 'medium' | 'low';
export type MotionLevel = 'full' | 'reduced';
export type ToastTone = 'good' | 'amber' | 'neutral';

export interface Settings {
  graphics: GraphicsLevel;
  motion: MotionLevel;
  sound: boolean;
  themeIndex: number;
}

export interface FinalStats {
  timeLabel: string;
  objects: number;
  roll: number;
  style: number;
  styleLabel: string;
}

export interface Stats {
  startedAt: number;
  finishedAt: number;
  interactions: Set<string>;
  rollCompletion: number;
}

export interface ThemeDef {
  name: string;
  deskBase: string;
  deskDark: string;
  deskLight: string;
  bg: string;
  fog: string;
  accent: string;
}

/* ------------------------------------------------------------------ */
/* Stage contract                                                     */
/* ------------------------------------------------------------------ */

export interface Stage {
  readonly id: StageId;
  enter(game: GameAPI): void;
  update(dt: number, game: GameAPI): void;
  exit(game: GameAPI): void;
  reset(game: GameAPI): void;
  /** optional: viewport changed (resize / orientation) — reframe if aspect-sensitive */
  onViewportChange?(game: GameAPI): void;
}

/* ------------------------------------------------------------------ */
/* UI contracts                                                       */
/* ------------------------------------------------------------------ */

/** Ephemeral progress blend for the stage HUD — plain number keeps the 0..1 API. */
export interface HintProgressSpec {
  /** 0..1 progress fraction (drives the thin bar) */
  fraction: number;
  /** optional "n" counter to render as "n / total" instead of a bare percentage */
  count?: number;
  total?: number;
}

export interface HintSpec {
  kicker: string;
  text: string;
  /** 0..1 — optional progress fraction for the thin bar */
  progress?: number;
  /** optional counter half of "n / total" */
  count?: number;
  total?: number;
  /** optional status pill: READY / INTERACTING / IN PROGRESS / COMPLETE (derived when unset) */
  status?: string;
  showContinue?: boolean;
  continueLabel?: string;
  showBlow?: boolean;
}

export interface LabelDef {
  id: string;
  text: string;
  /** world-space anchor (object or point) */
  anchor: THREE.Object3D | THREE.Vector3;
  visible: boolean;
  tone?: 'neutral' | 'good';
}

export interface HUDHandlers {
  onSoundToggle: () => void;
}

export interface HUD {
  setHint(h: HintSpec | null): void;
  setHintProgress(p: number | HintProgressSpec): void;
  setHintStatus(status?: string): void;
  toast(text: string, tone?: ToastTone): void;
  showContinue(label: string | undefined, cb: () => void): void;
  hideContinue(): void;
  setBlowVisible(visible: boolean, cb: (() => void) | null): void;
  setSmokePanel(
    active: boolean,
    handlers?: {
      onBlowStart(): void;
      onBlowMove(dx: number, dy: number): void;
      onBlowEnd(): void;
      onEnd(): void;
    } | null,
  ): void;
  setSmokeStatus(label: string, blowing: boolean): void;
  setRollRing(p: number | null): void;
  showIntro(onStart: () => void): void;
  hideIntro(): void;
  showFinished(onLight: () => void): void;
  hideFinished(): void;
  showFinal(stats: FinalStats, handlers: FinalHandlers): void;
  hideFinal(): void;
  setFreeRoam(visible: boolean, onExit: (() => void) | null): void;
  setHelpBody(text: string): void;
  openHelp(): void;
  openSettings(): void;
  closeModals(): void;
  setSoundIcon(on: boolean): void;
  dispose(): void;
}

export interface FinalHandlers {
  onReplay: () => void;
  onScene: () => void;
  onFreeRoam: () => void;
}

export interface ProgressUI {
  setStage(stage: StageId): void;
}

export interface SettingsPanel {
  sync(): void;
  dispose(): void;
}

export interface Labels {
  set(defs: LabelDef[]): void;
  update(camera: THREE.Camera, width: number, height: number): void;
  clear(): void;
}

/* ------------------------------------------------------------------ */
/* Interaction contracts                                              */
/* ------------------------------------------------------------------ */

export interface SnapZone {
  id: string;
  contains(p: THREE.Vector3): boolean;
  snapTo(p: THREE.Vector3): THREE.Vector3;
  enabled?: boolean;
}

export interface DragTarget {
  id: string;
  root: THREE.Object3D;
  mode: 'drag' | 'click' | 'both';
  enabled: boolean;
  cursor?: string;
  /** plane height used while dragging (number or live getter) */
  dragY?: number | (() => number);
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** called when a grab starts (pointer down on object) */
  onGrab?(t: DragTarget, point: THREE.Vector3): void;
  /** called every move while dragging — default position update still applied first */
  onMove?(t: DragTarget, point: THREE.Vector3, delta: THREE.Vector3): void;
  /** called on release; zone is the snap zone that accepted the drop (or null) */
  onDrop?(t: DragTarget, point: THREE.Vector3, zone: SnapZone | null): void;
  /** click/tap (press+release without meaningful movement) */
  onClick?(t: DragTarget, point: THREE.Vector3): void;
  /** desktop hover only — never required for gameplay */
  onHover?(t: DragTarget, hovering: boolean): void;
}

export interface InteractionManager {
  setTargets(targets: DragTarget[]): void;
  setZones(zones: SnapZone[]): void;
  /** live view of the current drag targets (QA/debug driver) */
  get targetsLive(): readonly DragTarget[];
  /** enable/disable orbit (drag on empty space) */
  setOrbit(enabled: boolean): void;
  /** pulse-lift animation state when grabbed (game feel) */
  update(dt: number): void;
  reset(): void;
  dispose(): void;
  readonly controls: OrbitControls;
}

/* ------------------------------------------------------------------ */
/* World object contracts                                             */
/* ------------------------------------------------------------------ */

export interface TrayProp {
  readonly group: THREE.Group;
  readonly topY: number;
  /** true when p is over the tray surface (prepare drop zone) */
  contains(p: THREE.Vector3): boolean;
  reset(): void;
}

export interface MaterialObject {
  readonly group: THREE.Group;
  /** packed bud (chunks overlapping, looks like one piece) */
  setAssembled(): void;
  /** position helper for prepare stage */
  setPosition(x: number, y: number, z: number): void;
  get totalSpecks(): number;
  get removedSpecks(): number;
  spawnSpecks(n: number): void;
  /** raycastable speck meshes (includes invisible hit proxies) */
  speckMeshes(): THREE.Object3D[];
  removeSpeck(obj: THREE.Object3D): boolean;
  clearSpecks(): void;
  get totalChunks(): number;
  get brokenChunks(): number;
  get allBroken(): boolean;
  chunkMeshes(): THREE.Object3D[];
  /** eject chunk with impulse; returns false if already broken */
  breakChunk(index: number, impulse: THREE.Vector3): boolean;
  breakNearest(point: THREE.Vector3, impulse: THREE.Vector3): boolean;
  /** hide chunks and show the rolled core cylinder */
  setCoreFormed(v: boolean): void;
  /** debris (stems/seeds to pick out): spawn n around the bud surface */
  spawnDebris(n: number): void;
  /** raycastable debris groups poking out of the bud */
  debrisMeshes(): THREE.Object3D[];
  /** whether the given debris is still attached (not already removed) */
  hasDebris(root: THREE.Object3D): boolean;
  /** remove a debris with a brief shrink; returns false if already removed */
  removeDebris(root: THREE.Object3D): boolean;
  clearDebris(): void;
  update(dt: number): void;
  reset(): void;
  dispose(): void;
}

export interface RollingPaper {
  readonly group: THREE.Group;
  readonly mesh: THREE.Mesh;
  setProgress(p: number): void;
  get progress(): number;
  setVisible(v: boolean): void;
  reset(): void;
  update(dt: number): void;
  dispose(): void;
}

export interface FilterProp {
  readonly group: THREE.Group;
  setVisible(v: boolean): void;
  reset(): void;
}

export interface LighterProp {
  readonly group: THREE.Group;
  flyTo(target: THREE.Vector3, duration: number, cb?: () => void): void;
  goHome(duration: number, cb?: () => void): void;
  setFlame(v: boolean): void;
  update(dt: number): void;
  reset(): void;
}

export interface AshtrayProp {
  readonly group: THREE.Group;
}

export interface DiscardProp {
  readonly group: THREE.Group;
}

export interface PaperStackProp {
  readonly group: THREE.Group;
}

export interface FinishedJoint {
  readonly group: THREE.Group;
  show(): void;
  hide(): void;
  setSpin(v: boolean): void;
  setLit(v: boolean): void;
  /** world position of the burning tip */
  getTipWorld(out: THREE.Vector3): THREE.Vector3;
  update(dt: number): void;
  reset(): void;
  dispose(): void;
}

export interface SmokeSystem {
  setEmitter(getWorld: (out: THREE.Vector3) => THREE.Vector3): void;
  start(): void;
  stop(): void;
  /** burst of n particles */
  puff(n: number, opts?: { dir?: THREE.Vector3; speed?: number; scale?: number }): void;
  setDensity(mult: number): void;
  /** hold-to-blow state; dir is the loop-space blow direction, smoothed internally */
  setBlow(active: boolean, dir: THREE.Vector3): void;
  /** smoothed, normalized blow strength 0..1 */
  readonly blowStrength: number;
  /** world point that repels nearby smoke (pointer disturbance), or null */
  setDisturber(point: THREE.Vector3 | null): void;
  /** gently fade all smoke out over duration seconds (emission stops) */
  fadeOut(duration: number): void;
  /** reduce turbulence/curl for prefers-reduced-motion */
  setMotionReduced(v: boolean): void;
  update(dt: number, camera: THREE.Camera): void;
  reset(): void;
  dispose(): void;
}

export interface ParticleFX {
  burst(
    pos: THREE.Vector3,
    opts?: {
      count?: number;
      colors?: string[];
      speed?: number;
      size?: number;
      up?: number;
    },
  ): void;
  update(dt: number): void;
  reset(): void;
  dispose(): void;
}

export interface CursorHand {
  setVisible(v: boolean): void;
  setTarget(obj: THREE.Object3D | null, point?: THREE.Vector3 | null): void;
  update(dt: number, camera: THREE.Camera): void;
  reset(): void;
}

export interface ZoneRing {
  showAt(pos: THREE.Vector3, radius: number, good?: boolean): void;
  hide(): void;
  update(dt: number): void;
}

export interface World {
  readonly tray: TrayProp;
  readonly bud: MaterialObject;
  readonly paper: RollingPaper;
  readonly filter: FilterProp;
  readonly joint: FinishedJoint;
  readonly lighter: LighterProp;
  readonly ashtray: AshtrayProp;
  readonly discard: DiscardProp;
  readonly paperStack: PaperStackProp;
  readonly smoke: SmokeSystem;
  readonly fx: ParticleFX;
  readonly cursor: CursorHand;
  readonly zone: ZoneRing;
  build(): void;
  applyTheme(theme: ThemeDef): void;
  setQuality(g: GraphicsLevel): void;
  reset(): void;
  update(dt: number, camera: THREE.Camera): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ */
/* Scene / camera / audio contracts                                   */
/* ------------------------------------------------------------------ */

export interface SceneManager {
  readonly scene: THREE.Scene;
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  resize(width: number, height: number): void;
  setQuality(g: GraphicsLevel): void;
  render(): void;
  dispose(): void;
}

export interface ArrangementBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** explicit look-at center (defaults to the bounds center) */
  cx?: number;
  cz?: number;
  y?: number;
  elevation?: number;
  fill?: number;
}

export interface CameraRig {
  moveTo(pos: THREE.Vector3, target: THREE.Vector3, duration?: number): void;
  setImmediate(pos: THREE.Vector3, target: THREE.Vector3): void;
  /** Computes an aspect-aware camera framing that fits the given desk bounds and animates to it. */
  frameArrangement(bounds: ArrangementBounds, duration?: number): void;
  addShake(amount: number): void;
  setLimits(minDistance: number, maxDistance: number, pan: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

export interface AudioManager {
  unlock(): void;
  setEnabled(on: boolean): void;
  get enabled(): boolean;
  click(): void;
  place(): void;
  paper(): void;
  pop(): void;
  chime(): void;
  ignite(): void;
  whoosh(): void;
  /** continuous airflow level 0..1 while BLOW SMOKE is held */
  blow(amount: number): void;
  setAmbient(on: boolean): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ */
/* Game façade used by stages                                         */
/* ------------------------------------------------------------------ */

export interface GameAPI {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly world: World;
  readonly hud: HUD;
  readonly progress: ProgressUI;
  readonly settings: Settings;
  readonly stats: Stats;
  readonly audio: AudioManager;
  readonly cameraRig: CameraRig;
  readonly interaction: InteractionManager;
  readonly tweens: import('../utils/tween').Tweens;
  go(id: StageId): void;
  next(): void;
  /** toast + CONTINUE button that advances to the next stage */
  stageComplete(message: string, continueLabel?: string): void;
  toast(text: string, tone?: ToastTone): void;
  setHint(h: HintSpec | null): void;
  setLabels(defs: LabelDef[]): void;
  track(id: string): void;
  shake(amount: number): void;
  reducedMotion(): boolean;
  quality(): GraphicsLevel;
  applySettings(): void;
}
