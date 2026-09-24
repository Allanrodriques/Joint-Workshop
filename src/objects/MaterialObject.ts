import * as THREE from 'three';
import type { MaterialObject as MaterialObjectI } from '../game/GameState';
import { BREAK, HERB, LAYOUT } from '../game/constants';
import type { HerbalPart } from '../game/constants';
import { rand } from '../utils/math';

const SLOTS: ReadonlyArray<readonly [number, number, number]> = [
  [-0.28, -0.01, 0],
  [-0.14, 0.06, 0.02],
  [0, 0, 0],
  [0.14, 0.05, -0.02],
  [0.28, -0.01, 0.01],
  [-0.14, -0.07, -0.03],
  [0.14, -0.06, 0.03],
  [0, 0.09, 0.04],
  [0, -0.08, -0.04],
];

/** Approx bounding radius per chunk variant (used for resting on the tray). */
const VARIANT_RADIUS: Record<HerbalPart, number> = {
  leaf: 0.18,
  stem: 0.2,
  seed: 0.07,
  trim: 0.13,
};

interface Speck {
  root: THREE.Group;
  visible: THREE.Mesh;
  proxy: THREE.Mesh;
}

interface DyingSpeck {
  root: THREE.Group;
  t: number;
}

interface DyingDebris {
  root: THREE.Object3D;
  t: number;
}

/** Per-variant shared resources so many chunks stay cheap. */
interface VariantResources {
  build(): THREE.Object3D;
  radius: number;
}

/** The cannabis-like green prop. Breaks into varied pieces, cleaned, rolled into a core. */
export class MaterialObject implements MaterialObjectI {
  readonly group = new THREE.Group();

  private chunks: THREE.Object3D[] = [];
  private velocities: THREE.Vector3[] = [];
  private angular: THREE.Vector3[] = [];
  private variantResources = new Map<HerbalPart, VariantResources>();
  private readonly variantGeos: THREE.BufferGeometry[] = [];
  private readonly variantMats: THREE.Material[] = [];

  private coreAnchor = new THREE.Group();
  private coreGeo = new THREE.CapsuleGeometry(0.15, 1.9, 4, 12);
  private coreMat = new THREE.MeshStandardMaterial({ color: '#4a7338', roughness: 0.95, flatShading: true });

  private speckGeo = new THREE.IcosahedronGeometry(0.028, 0);
  private speckMat = new THREE.MeshStandardMaterial({ color: '#2a1c10', roughness: 0.9 });
  private proxyGeo = new THREE.SphereGeometry(0.1, 8, 6);
  private proxyMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    transparent: true,
    opacity: 0,
  });

  private specks: Speck[] = [];
  private dying: DyingSpeck[] = [];
  private debris: THREE.Object3D[] = [];
  private dyingDebris: DyingDebris[] = [];

  private _totalSpecks = 0;
  private _removedSpecks = 0;
  private _broken = 0;
  private coreFormed = false;

  constructor() {
    this.initVariants();
    for (let i = 0; i < BREAK.chunkCount; i++) {
      const root = this.buildChunk(i);
      root.userData.broken = false;
      root.userData.settled = true;
      this.group.add(root);
      this.chunks.push(root);
      this.velocities.push(new THREE.Vector3());
      this.angular.push(new THREE.Vector3());
    }

    const core = new THREE.Mesh(this.coreGeo, this.coreMat);
    core.rotation.z = Math.PI / 2;
    core.castShadow = true;
    this.coreAnchor.add(core);
    this.group.add(this.coreAnchor);
    this.coreAnchor.visible = false;

    this.setAssembled();
  }

  /* ---------------------------------- variants ------------------------------ */

  private geo(g: THREE.BufferGeometry): THREE.BufferGeometry {
    this.variantGeos.push(g);
    return g;
  }

  private mat(m: THREE.Material): THREE.Material {
    this.variantMats.push(m);
    return m;
  }

  private stdMat(color: string, emissive: string): THREE.MeshStandardMaterial {
    return this.mat(
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        flatShading: true,
        emissive: new THREE.Color(emissive),
        emissiveIntensity: 0.22,
      }),
    ) as THREE.MeshStandardMaterial;
  }

  private mesh(geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Mesh {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  private initVariants(): void {
    const leafLobe = this.geo(new THREE.SphereGeometry(0.085, 10, 6));
    const leafFall = this.stdMat('#5b8f2e', '#0d1a0a');
    const centerNub = this.geo(new THREE.IcosahedronGeometry(0.11, 0));
    const stemRod = this.geo(new THREE.CylinderGeometry(0.028, 0.045, 0.34, 7));
    const stemMat = this.stdMat('#a08a55', '#241a08');
    const stemLeaf = this.geo(new THREE.IcosahedronGeometry(0.055, 0));
    const seedBody = this.geo(new THREE.SphereGeometry(0.038, 8, 6));
    const seedMat = this.stdMat('#4a3322', '#120a04');
    const seedTip = this.geo(new THREE.IcosahedronGeometry(0.02, 0));
    const seedHighlight = this.stdMat('#6b4c2a', '#1a1006');
    const trimBump = this.geo(new THREE.IcosahedronGeometry(0.055, 0));
    const trimMat = this.stdMat('#7ea65c', '#17300f');
    const frostDot = this.geo(new THREE.SphereGeometry(0.012, 6, 4));
    const frostMat = this.stdMat('#dfe8c4', '#2a3a10');

    const leaf = (): THREE.Object3D => {
      const g = new THREE.Group();
      const lobeY = 0.03;
      for (const a of [0, 2.1, 4.2]) {
        const l = this.mesh(leafLobe, leafFall, 0, lobeY, 0, 1, 0.42, 0.6);
        l.rotation.y = a;
        l.position.x = Math.sin(a) * 0.075;
        l.position.z = Math.cos(a) * 0.075;
        g.add(l);
      }
      g.add(this.mesh(centerNub, leafFall, 0, 0.1, 0, 0.9, 0.9, 0.9));
      return g;
    };

    const stem = (): THREE.Object3D => {
      const g = new THREE.Group();
      const rod = this.mesh(stemRod, stemMat, 0, 0.08, 0);
      rod.rotation.x = 0.25;
      rod.rotation.z = rand(-0.15, 0.15);
      g.add(rod);
      const leaf = this.mesh(stemLeaf, stemMat, 0.03, -0.02, 0.01, 1.4, 0.5, 0.8);
      leaf.rotation.y = rand(0, Math.PI);
      g.add(leaf);
      return g;
    };

    const seed = (): THREE.Object3D => {
      const g = new THREE.Group();
      const s0 = this.mesh(seedBody, seedMat, -0.02, 0, 0.01, 1, 1.35, 0.85);
      s0.rotation.z = 0.5;
      g.add(s0);
      const s1 = this.mesh(seedBody, seedMat, 0.02, 0.012, -0.01, 1, 1.2, 0.9);
      s1.rotation.z = -0.4;
      g.add(s1);
      const s2 = this.mesh(seedBody, seedMat, 0.005, -0.018, 0.02, 0.9, 1.3, 0.9);
      s2.rotation.z = 0.1;
      g.add(s2);
      g.add(this.mesh(seedTip, seedHighlight, -0.045, 0.02, 0.01, 1, 1, 1));
      return g;
    };

    const trim = (): THREE.Object3D => {
      const g = new THREE.Group();
      for (const [ux, uy, uz] of [
        [1, 0.4, 0],
        [-0.8, -0.2, 0.5],
        [-0.2, -0.5, -0.9],
        [0.9, -0.3, -0.3],
        [0.1, 0.6, 0.7],
      ] as const) {
        const b = this.mesh(trimBump, trimMat, ux * 0.05, uy * 0.05, uz * 0.05, 0.9, 0.9 + Math.random() * 0.4, 0.9);
        g.add(b);
        g.add(this.mesh(frostDot, frostMat, ux * 0.08 + 0.01, uy * 0.06 + 0.02, uz * 0.07 - 0.01));
      }
      g.add(this.mesh(trimBump, trimMat, 0, 0.03, 0, 1.1, 1, 1.1));
      return g;
    };

    this.variantResources.set('leaf', { build: leaf, radius: VARIANT_RADIUS.leaf });
    this.variantResources.set('stem', { build: stem, radius: VARIANT_RADIUS.stem });
    this.variantResources.set('seed', { build: seed, radius: VARIANT_RADIUS.seed });
    this.variantResources.set('trim', { build: trim, radius: VARIANT_RADIUS.trim });
  }

  private buildChunk(i: number): THREE.Object3D {
    const variant = HERB.variants[i] ?? 'leaf';
    const res = this.variantResources.get(variant) ?? this.variantResources.get('leaf')!;
    const root = new THREE.Group();
    root.userData.variant = variant;
    root.userData.radius = res.radius;
    const s = rand(0.85, 1.15);
    root.scale.setScalar(s);
    root.add(res.build());
    return root;
  }

  /** Name of the plant part shown by chunk i ('leaf' | 'stem' | 'seed' | 'trim'). */
  chunkVariant(i: number): HerbalPart {
    return HERB.variants[i] ?? 'leaf';
  }

  /* ---------------------------------- assembly ------------------------------- */

  setAssembled(): void {
    for (let i = 0; i < this.chunks.length; i++) {
      const slot = SLOTS[i];
      const c = this.chunks[i];
      c.position.set(slot[0], slot[1], slot[2]);
      c.rotation.set(0, 0, 0);
      c.visible = true;
      c.userData.broken = false;
      c.userData.settled = true;
      this.velocities[i].set(0, 0, 0);
      this.angular[i].set(0, 0, 0);
    }
    this._broken = 0;
    this.coreFormed = false;
    this.coreAnchor.visible = false;
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
  }

  /* ------------------------------------ specks ------------------------------- */

  spawnSpecks(n: number): void {
    for (let k = 0; k < n; k++) {
      const phi = rand(0, Math.PI * 2);
      const theta = Math.acos(rand(-1, 1));
      const ex = Math.sin(theta) * Math.cos(phi);
      const ey = Math.cos(theta);
      const ez = Math.sin(theta) * Math.sin(phi);

      const root = new THREE.Group();
      root.position.set(ex * 0.22 * 0.8, ey * 0.13 * 0.8, ez * 0.13 * 0.8);
      root.rotation.set(rand(-0.4, 0.4), rand(0, Math.PI * 2), rand(-0.4, 0.4));
      root.userData.speck = true;
      root.userData.speckRoot = true;

      const visible = new THREE.Mesh(this.speckGeo, this.speckMat);
      visible.userData.speck = true;
      root.add(visible);

      const proxy = new THREE.Mesh(this.proxyGeo, this.proxyMat);
      proxy.userData.speck = true;
      proxy.matrixAutoUpdate = false;
      root.add(proxy);

      this.group.add(root);
      this.specks.push({ root, visible, proxy });
      this._totalSpecks++;
    }
  }

  speckMeshes(): THREE.Object3D[] {
    return this.specks.map((s) => s.root);
  }

  removeSpeck(obj: THREE.Object3D): boolean {
    let node: THREE.Object3D | null = obj;
    while (node && !node.userData.speckRoot) {
      node = node.parent;
    }
    if (!node) return false;
    const root = node as THREE.Group;
    if (this.dying.some((d) => d.root === root)) return true;
    this.dying.push({ root, t: 0 });
    return true;
  }

  clearSpecks(): void {
    for (const s of this.specks) this.group.remove(s.root);
    for (const d of this.dying) this.group.remove(d.root);
    this.specks.length = 0;
    this.dying.length = 0;
    this._totalSpecks = 0;
    this._removedSpecks = 0;
  }

  get totalSpecks(): number {
    return this._totalSpecks;
  }

  get removedSpecks(): number {
    return this._removedSpecks;
  }

  /* ----------------------------------- debris ------------------------------- */

  /** Stems & seeds poking out of the flower that the CLEAN UP stage pulls out. */
  spawnDebris(n: number): void {
    this.clearDebris();
    const kinds: HerbalPart[] = ['stem', 'stem', 'stem', 'seed', 'seed'];
    for (let k = 0; k < n; k++) {
      const kind = kinds[k % kinds.length];
      const res = this.variantResources.get(kind) ?? this.variantResources.get('stem')!;
      const root = new THREE.Group();
      root.userData.variant = kind;
      root.userData.radius = res.radius;
      root.userData.debris = true;
      root.add(res.build());
      const a = (k / n) * Math.PI * 2 + rand(-0.3, 0.3);
      const r = rand(0.2, 0.3);
      root.position.set(Math.cos(a) * r, rand(0.02, 0.14), Math.sin(a) * r * 0.7);
      root.rotation.set(rand(-0.35, 0.35), a, rand(-0.35, 0.35));
      const s = rand(0.9, 1.1);
      root.scale.setScalar(s);
      this.group.add(root);
      this.debris.push(root);
    }
  }

  debrisMeshes(): THREE.Object3D[] {
    return this.debris;
  }

  hasDebris(root: THREE.Object3D): boolean {
    return this.debris.some((d) => d === root) && !this.dyingDebris.some((d) => d.root === root);
  }

  removeDebris(root: THREE.Object3D): boolean {
    if (!this.debris.includes(root) || this.dyingDebris.some((d) => d.root === root)) return false;
    this.dyingDebris.push({ root, t: 0 });
    return true;
  }

  clearDebris(): void {
    for (const d of this.debris) this.group.remove(d);
    for (const d of this.dyingDebris) this.group.remove(d.root);
    this.debris.length = 0;
    this.dyingDebris.length = 0;
  }

  /* ------------------------------------ chunks ------------------------------- */

  get totalChunks(): number {
    return BREAK.chunkCount;
  }

  get brokenChunks(): number {
    return this._broken;
  }

  get allBroken(): boolean {
    return (
      this._broken >= this.totalChunks &&
      this.chunks.every((c) => c.userData.settled === true)
    );
  }

  chunkMeshes(): THREE.Object3D[] {
    return this.chunks;
  }

  breakChunk(index: number, impulse: THREE.Vector3): boolean {
    const c = this.chunks[index];
    if (!c || c.userData.broken) return false;
    c.userData.broken = true;
    c.userData.settled = false;
    const v = this.velocities[index].copy(impulse);
    v.y += rand(1.2, 2.2);
    v.x += rand(-0.7, 0.7);
    v.z += rand(-0.7, 0.7);
    this.angular[index].set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    this._broken++;
    return true;
  }

  breakNearest(point: THREE.Vector3, impulse: THREE.Vector3): boolean {
    const tmp = new THREE.Vector3();
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.chunks.length; i++) {
      if (this.chunks[i].userData.broken) continue;
      this.chunks[i].getWorldPosition(tmp);
      const d = tmp.distanceTo(point);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return false;
    return this.breakChunk(best, impulse);
  }

  /* ------------------------------------ core --------------------------------- */

  setCoreFormed(v: boolean): void {
    this.coreFormed = v;
    this.coreAnchor.visible = v;
    for (const c of this.chunks) c.visible = !v;
    for (const s of this.specks) s.root.visible = !v;
  }

  get isCoreFormed(): boolean {
    return this.coreFormed;
  }

  /* ------------------------------------ update ------------------------------ */

  update(dt: number): void {
    for (let i = this.dyingDebris.length - 1; i >= 0; i--) {
      const d = this.dyingDebris[i];
      d.t += dt;
      const k = Math.min(1, d.t / 0.2);
      const s = Math.max(0.0001, 1 - k);
      d.root.scale.setScalar(s);
      d.root.position.y += dt * 0.6;
      if (k >= 1) {
        this.group.remove(d.root);
        this.dyingDebris.splice(i, 1);
      }
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      const k = Math.min(1, d.t / 0.18);
      const s = Math.max(0.0001, 1 - k);
      d.root.scale.setScalar(s);
      if (k >= 1) {
        this.group.remove(d.root);
        this.dying.splice(i, 1);
        this._removedSpecks++;
      }
    }

    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      if (!c.userData.broken || c.userData.settled) continue;
      const v = this.velocities[i];
      const av = this.angular[i];

      v.y -= 9.5 * dt;
      c.position.addScaledVector(v, dt);
      c.rotation.x += av.x * dt;
      c.rotation.y += av.y * dt;
      c.rotation.z += av.z * dt;

      const ud = c.userData;
      const radius = (ud.radius ?? 0.16) * c.scale.x;
      const rest = LAYOUT.tray.topY + radius * 0.55 - this.group.position.y;
      if (c.position.y < rest) {
        c.position.y = rest;
        v.y = -v.y * 0.42;
        v.x *= 0.7;
        v.z *= 0.7;
        av.multiplyScalar(0.6);
        if (Math.abs(v.y) < 0.35) {
          v.set(0, 0, 0);
          av.set(0, 0, 0);
          c.userData.settled = true;
          c.rotation.y += rand(-0.4, 0.4);
        }
      }
    }
  }

  /* ------------------------------------ lifecycle --------------------------- */

  reset(): void {
    this.setAssembled();
    this.clearSpecks();
    this.clearDebris();
    this.group.position.set(LAYOUT.budStart.x, LAYOUT.budStart.y, LAYOUT.budStart.z);
  }

  dispose(): void {
    for (const g of this.variantGeos) g.dispose();
    for (const m of this.variantMats) m.dispose();
    this.coreGeo.dispose();
    this.coreMat.dispose();
    this.speckGeo.dispose();
    this.speckMat.dispose();
    this.proxyGeo.dispose();
    this.proxyMat.dispose();
  }
}