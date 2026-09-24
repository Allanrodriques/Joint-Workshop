import * as THREE from 'three';
import type {
  DragTarget,
  GameAPI,
  LabelDef,
  SnapZone,
  Stage,
  StageId,
} from '../game/GameState';
import { ARRANGE, LAYOUT } from '../game/constants';
import { clamp, damp, rand } from '../utils/math';
import { Ease } from '../utils/tween';

const GREENS = ['#4f7d3a', '#6fae4a', '#7ddc6a', '#3f5f2c'];
const GRAB_SCALE = 1.16;
const HOVER_SCALE = 1.09;

/** World-space resting spots for the loose pieces, spread well apart around the paper. */
const SPOTS: ReadonlyArray<readonly [number, number]> = [
  [-1.5, -0.05],
  [-1.42, 0.65],
  [-0.78, 1.02],
  [1.5, -0.05],
  [1.42, 0.65],
  [0.78, 1.02],
];

/** Desk area we want framed: tray + paper + filter resting spot. */
const FRAME_BOUNDS = {
  minX: -1.9,
  maxX: 2.6,
  minZ: -1.15,
  maxZ: 1.4,
  cx: 0.15,
  cz: 0.1,
  y: 0.06,
  elevation: Math.PI / 3.6,
  fill: 0.62,
} as const;

const HITBOX_GEO = new THREE.SphereGeometry(0.45, 12, 8);
const HITBOX_MAT = new THREE.MeshBasicMaterial({
  colorWrite: false,
  depthWrite: false,
  transparent: true,
  opacity: 0,
});

/** Explicit arrangement machine: PLACING → (all pieces) → FILTERING → DONE. */
export interface ArrangeDebug {
  piecesPlaced: number;
  totalPieces: number;
  filterPlaced: boolean;
  completed: boolean;
  progress: number;
  placedIds: string[];
}

interface PieceState {
  root: THREE.Object3D;
  baseY: number;
  /** base scale (per-axis) before hover/grab scale is applied */
  baseScale: THREE.Vector3;
  /** current 1x multiplier from hover/grab (damped toward target) */
  scaleK: number;
  scaleTo: number;
  hovered: boolean;
}

function standardMatsOf(obj: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const out: THREE.MeshStandardMaterial[] = [];
  obj.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!(m.isMesh && m.material)) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const x of mats) {
      if ((x as THREE.MeshStandardMaterial).emissive) {
        out.push(x as THREE.MeshStandardMaterial);
      }
    }
  });
  return out;
}

export class ArrangeStage implements Stage {
  readonly id: StageId = 'ARRANGE';

  private pieces: THREE.Object3D[] = [];
  private states = new Map<THREE.Object3D, PieceState>();
  private readonly state: ArrangeDebug = {
    piecesPlaced: 0,
    totalPieces: ARRANGE.totalPieces,
    filterPlaced: false,
    completed: false,
    progress: 0,
    placedIds: [],
  };
  private nextSlot = 0;
  private activeId: string | null = null;
  private hitboxes: THREE.Mesh[] = [];
  private hiddenExtras: THREE.Object3D[] = [];
  private time = 0;

  get debug(): ArrangeDebug {
    return {
      piecesPlaced: this.state.piecesPlaced,
      totalPieces: this.state.totalPieces,
      filterPlaced: this.state.filterPlaced,
      completed: this.state.completed,
      progress: this.computeProgress(),
      placedIds: [...this.state.placedIds],
    };
  }

  enter(game: GameAPI): void {
    game.cameraRig.setLimits(1.5, 20, false);
    game.cameraRig.frameArrangement(FRAME_BOUNDS, 1.6);
    game.hud.hideContinue();
    game.hud.setRollRing(null);
    game.hud.setBlowVisible(false, null);

    const w = game.world;
    w.paper.setVisible(true);
    w.paper.setProgress(0);
    w.bud.setCoreFormed(false);

    const allChunks = w.bud.chunkMeshes().filter((m) => m.visible);
    // Use only the pieces we actually need; hide the rest so they never clutter or block.
    this.pieces = allChunks.slice(0, this.state.totalPieces);
    this.hiddenExtras = allChunks.slice(this.state.totalPieces);

    // Explicitly scatter the pieces around the paper, clearly separated and tracked.
    const gx = w.bud.group.position.x;
    const gy = w.bud.group.position.y;
    const gz = w.bud.group.position.z;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      const spot = SPOTS[i % SPOTS.length];
      const baseY = 0.2 - gy;
      p.position.set(spot[0] - gx, baseY, spot[1] - gz);
      p.rotation.set(0, rand(0, Math.PI * 2), 0);
      p.userData.broken = true;
      p.userData.settled = true;
      const baseScale = p.scale.clone();
      this.states.set(p, {
        root: p,
        baseY,
        baseScale,
        scaleK: 1,
        scaleTo: 1,
        hovered: false,
      });
    }
    for (const extra of this.hiddenExtras) extra.visible = false;

    this.addHitboxes(...this.pieces);
    this.addHitboxes(w.filter.group);

    // Camera stays live during ARRANGE: grabbing a piece pauses orbit, dragging
    // empty space orbits. Both must always work.
    game.interaction.setOrbit(true);

    const paper = LAYOUT.paper;
    const materialZone: SnapZone = {
      id: 'material',
      contains: (p) =>
        p.x > paper.x - paper.len / 2 &&
        p.x < paper.x + paper.len / 2 &&
        p.z > paper.z - paper.width / 2 &&
        p.z < paper.z + paper.width / 2,
      snapTo: (p) => {
        if (this.nextSlot < LAYOUT.pieceSlots.length) {
          const slot = LAYOUT.pieceSlots[this.nextSlot];
          this.nextSlot++;
          return new THREE.Vector3(slot.x, LAYOUT.paper.y + 0.14, slot.z);
        }
        const x = clamp(p.x, paper.x - paper.len / 2, paper.x + paper.len / 2);
        const z = clamp(p.z, paper.z - paper.width / 2, paper.z + paper.width / 2);
        return new THREE.Vector3(x, LAYOUT.paper.y + 0.14, z);
      },
    };
    const filterPos = new THREE.Vector3(
      LAYOUT.filterSnap.x,
      LAYOUT.filterSnap.y,
      LAYOUT.filterSnap.z,
    );
    const filterZone: SnapZone = {
      id: 'filter',
      contains: (p) => Math.hypot(p.x - filterPos.x, p.z - filterPos.z) < 0.4,
      snapTo: () => filterPos.clone(),
    };

    this.markFilterTarget(game);

    const pieceTargets: DragTarget[] = this.pieces.map((root, i) => ({
      id: 'piece:' + i,
      root,
      mode: 'drag',
      enabled: true,
      dragY: () => LAYOUT.paper.y + 0.12,
      bounds: { minX: -1.9, maxX: 1.95, minZ: -1.2, maxZ: 1.35 },
      onGrab: (t) => {
        if (this.placed(t.id)) return;
        materialZone.enabled = true;
        filterZone.enabled = false;
        this.activeId = t.id;
        game.audio.pop();
        game.hud.setHintStatus('INTERACTING');
        this.setPieceScale(root, GRAB_SCALE);
        this.setPieceGlow(root, true, 0.75);
      },
      onHover: (t, hovering) => {
        if (this.placed(t.id) || this.activeId !== null) return;
        this.setPieceScale(root, hovering ? HOVER_SCALE : 1);
        this.setPieceGlow(root, hovering, 0.35);
      },
      onDrop: (t, point, zone) => {
        this.activeId = null;
        this.handlePieceDrop(game, t, point, zone);
        this.setPieceScale(root, 1);
        this.setPieceGlow(root, false, 0);
      },
      onClick: (t) => this.handleRotate(game, t),
    }));
    const filterTarget: DragTarget = {
      id: 'filter',
      root: w.filter.group,
      mode: 'drag',
      enabled: true,
      dragY: () => LAYOUT.filterSnap.y + 0.05,
      bounds: { minX: -2.2, maxX: 3, minZ: -1.3, maxZ: 1.4 },
      onGrab: () => {
        if (this.state.filterPlaced) return;
        materialZone.enabled = false;
        filterZone.enabled = true;
        this.activeId = 'filter';
        game.audio.pop();
        game.hud.setHintStatus('INTERACTING');
      },
      onDrop: (t, point, zone) => {
        this.activeId = null;
        this.handleFilterDrop(game, t, point, zone);
      },
      onClick: (t) => {
        this.activeId = null;
        this.handleRotate(game, t);
      },
    };

    game.interaction.setTargets([...pieceTargets, filterTarget]);
    game.interaction.setZones([filterZone, materialZone]);
    this.refreshUI(game);
  }

  private placed(id: string): boolean {
    return this.state.placedIds.indexOf(id) >= 0;
  }

  private addHitboxes(...roots: THREE.Object3D[]): void {
    for (const root of roots) {
      const hb = new THREE.Mesh(HITBOX_GEO, HITBOX_MAT);
      hb.name = 'hitbox';
      hb.userData.draggable = true;
      hb.position.y = 0.02;
      root.add(hb);
      this.hitboxes.push(hb);
    }
  }

  private removeHitboxes(...roots: THREE.Object3D[]): void {
    const targets = roots.length ? roots : this.hitboxes.map((h) => h.parent as THREE.Object3D);
    for (const root of targets) {
      const child = root.getObjectByName('hitbox');
      if (child) {
        root.remove(child);
        const i = this.hitboxes.indexOf(child as THREE.Mesh);
        if (i >= 0) this.hitboxes.splice(i, 1);
      }
    }
  }

  private setPieceScale(root: THREE.Object3D, to: number): void {
    const st = this.states.get(root);
    if (st) st.scaleTo = to;
  }

  private setPieceGlow(root: THREE.Object3D, on: boolean, intensity: number): void {
    const st = this.states.get(root);
    if (!st) return;
    const mat = (st as { _mats?: THREE.MeshStandardMaterial[] })._mats;
    let mats = mat;
    if (!mats) {
      mats = standardMatsOf(root);
      (st as { _mats?: THREE.MeshStandardMaterial[] })._mats = mats;
    }
    for (const m of mats) {
      m.emissiveIntensity = on ? intensity : 0.25;
    }
  }

  /** Mark a piece as placed: snap id, stop idle motion, become click-only (rotate). */
  private sealPiece(game: GameAPI, t: DragTarget, root: THREE.Object3D): void {
    this.state.placedIds.push(t.id);
    this.state.piecesPlaced++;
    game.track(t.id);
    t.mode = 'click';
    this.removeHitboxes(root);
    this.setPieceGlow(root, false, 0);
    this.setPieceScale(root, 1);
  }

  private handlePieceDrop(
    game: GameAPI,
    t: DragTarget,
    point: THREE.Vector3,
    zone: SnapZone | null,
  ): void {
    if (!zone || zone.id !== 'material') return;
    const w = game.world;
    game.audio.place();
    w.fx.burst(point, { count: 6, colors: GREENS });
    w.zone.showAt(point, 0.35, true);
    game.tweens.add({
      duration: 0.4,
      onUpdate: () => {},
      onComplete: () => w.zone.hide(),
    });
    if (!this.placed(t.id)) this.sealPiece(game, t, t.root);
    this.refreshUI(game);
    this.checkComplete(game);
  }

  private handleFilterDrop(
    game: GameAPI,
    t: DragTarget,
    point: THREE.Vector3,
    zone: SnapZone | null,
  ): void {
    if (!zone || zone.id !== 'filter' || this.state.filterPlaced) return;
    const w = game.world;
    this.state.filterPlaced = true;
    game.audio.place();
    w.zone.showAt(point, 0.35, true);
    game.tweens.add({
      duration: 0.4,
      onUpdate: () => {},
      onComplete: () => w.zone.hide(),
    });
    game.track(t.id);
    t.mode = 'click';
    this.refreshUI(game);
    this.checkComplete(game);
  }

  private handleRotate(game: GameAPI, t: DragTarget): void {
    if (!this.placed(t.id) && t.id !== 'filter') return;
    const root = t.root;
    const from = root.rotation.y;
    const to = from + Math.PI / 4;
    game.tweens.add({
      duration: 0.25,
      ease: Ease.outCubic,
      onUpdate: (k) => {
        root.rotation.y = from + (to - from) * k;
      },
    });
    game.track('piece-rotate:' + t.id);
  }

  private computeProgress(): number {
    if (this.state.completed) return 1;
    return (
      (this.state.piecesPlaced / this.state.totalPieces) * 0.7 +
      (this.state.filterPlaced ? 0.3 : 0)
    );
  }

  /**
 * Make the filter's landing spot obvious: a pulsing ring + an on-paper label,
 * visible from stage start until the filter is dropped.
 */
private markFilterTarget(game: GameAPI): void {
  if (this.state.filterPlaced || this.state.completed) return;
  const snap = new THREE.Vector3(
    LAYOUT.filterSnap.x,
    LAYOUT.filterSnap.y,
    LAYOUT.filterSnap.z,
  );
  game.world.zone.showAt(snap, 0.42, true);
}

private refreshUI(game: GameAPI): void {
  if (this.state.completed) return;
  const w = game.world;
  let text: string;
  if (this.state.piecesPlaced < this.state.totalPieces) {
    text = 'Place the pieces on the paper.';
  } else if (!this.state.filterPlaced) {
    text = 'Drop the filter on the glowing ring at the end of the paper.';
  } else {
    text = 'Looking good.';
  }
  const count = this.state.piecesPlaced + (this.state.filterPlaced ? 1 : 0);
  const total = this.state.totalPieces + 1;
  game.setHint({
    kicker: '04 · ARRANGE',
    text,
    progress: this.computeProgress(),
    count,
    total,
    status: count > 0 ? 'IN PROGRESS' : 'READY',
  });

  let anchor: THREE.Object3D | null = null;
  for (let i = 0; i < this.pieces.length; i++) {
    if (!this.placed('piece:' + i)) {
      anchor = this.pieces[i];
      break;
    }
  }
  const labels: LabelDef[] = [
    { id: 'l-paper', text: 'paper', anchor: w.paper.group, visible: true },
  ];
  if (anchor) labels.push({ id: 'l-piece', text: 'material →', anchor, visible: true });
  if (!this.state.filterPlaced) {
    labels.push({ id: 'l-filter', text: 'filter →', anchor: w.filter.group, visible: true });
    labels.push({
      id: 'l-filter-zone',
      text: 'drop filter here',
      anchor: new THREE.Vector3(
        LAYOUT.filterSnap.x,
        LAYOUT.filterSnap.y + 0.4,
        LAYOUT.filterSnap.z,
      ),
      visible: true,
    });
  }
  this.markFilterTarget(game);
  game.setLabels(labels);
}

  private checkComplete(game: GameAPI): void {
    if (this.state.completed) return;
    if (this.state.piecesPlaced < this.state.totalPieces || !this.state.filterPlaced) return;
    this.state.completed = true;
    this.state.progress = 1;
    game.hud.setHintProgress({ fraction: 1, count: this.state.totalPieces + 1, total: this.state.totalPieces + 1 });
    game.setHint({
      kicker: '04 · ARRANGE',
      text: 'Everything is in place.',
      progress: 1,
      count: this.state.totalPieces + 1,
      total: this.state.totalPieces + 1,
      status: 'COMPLETE',
    });
    game.audio.chime();
    game.world.fx.burst(
      new THREE.Vector3(LAYOUT.paper.x, LAYOUT.paper.y + 0.2, LAYOUT.paper.z),
      { count: 24, colors: GREENS },
    );
    game.stageComplete('Everything is in place.');
  }

  update(dt: number, _game: GameAPI): void {
    this.time += dt;
    for (let i = 0; i < this.pieces.length; i++) {
      const root = this.pieces[i];
      const st = this.states.get(root);
      if (!st) continue;
      st.scaleK = damp(st.scaleK, st.scaleTo, 8, dt);
      root.scale.set(
        st.baseScale.x * st.scaleK,
        st.baseScale.y * st.scaleK,
        st.baseScale.z * st.scaleK,
      );
      if (this.placed('piece:' + i) || this.activeId === 'piece:' + i) continue;
      const bob = Math.sin(this.time * 1.6 + i * 1.7) * 0.012;
      root.position.y = st.baseY + bob;
      root.rotation.y += dt * 0.35;
    }
  }

  exit(game: GameAPI): void {
    this.removeHitboxes();
    for (const extra of this.hiddenExtras) extra.visible = true;
    this.hiddenExtras.length = 0;
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
    this.nextSlot = 0;
    this.state.piecesPlaced = 0;
    this.state.filterPlaced = false;
    this.state.completed = false;
    this.state.progress = 0;
    this.state.placedIds.length = 0;
    this.activeId = null;
    this.removeHitboxes();
    this.states.clear();
    for (const extra of this.hiddenExtras) extra.visible = true;
    this.hiddenExtras.length = 0;
    this.pieces = [];
    game.world.zone.hide();
    game.world.filter.reset();
  }

  onViewportChange(game: GameAPI): void {
    if (this.pieces.length > 0) game.cameraRig.frameArrangement(FRAME_BOUNDS, 0.9);
  }
}