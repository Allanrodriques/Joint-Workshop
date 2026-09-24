import * as THREE from 'three';
import type { RollingPaper as RollingPaperI } from '../game/GameState';
import { LAYOUT, PAPERS, ROLL } from '../game/constants';
import type { PaperDef } from '../game/constants';
import { clamp, damp, lerp, smoothstep } from '../utils/math';
import { fiberTexture } from '../utils/textures';

const LEN_SEG = 10;
const WIDTH_SEG = 56;

/** The rolling paper: flat sheet that deforms into a roll around the core. */
export class RollingPaper implements RollingPaperI {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;

  get pickMesh(): THREE.Mesh {
    return this.mesh;
  }

  private material: THREE.MeshStandardMaterial;
  private geometry!: THREE.PlaneGeometry;
  private paper: PaperDef = PAPERS[1];

  private sArr: number[] = [];
  private flatX: number[] = [];
  private flatZ: number[] = [];
  private flatY: number[] = [];

  private _progress = 0;
  private time = 0;

  constructor() {
    this.rebuildGeometry();

    this.material = new THREE.MeshStandardMaterial({
      color: '#f2ecdf',
      roughness: 0.85,
      side: THREE.DoubleSide,
      map: fiberTexture(),
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    this.reset();
  }

  private rebuildGeometry(): void {
    const old = this.geometry;
    const geo = new THREE.PlaneGeometry(
      LAYOUT.paper.len,
      this.paper.width,
      LEN_SEG,
      WIDTH_SEG,
    );
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    this.sArr = [];
    this.flatX = [];
    this.flatZ = [];
    this.flatY = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const jitter = (Math.random() - 0.5) * 0.008;
      this.sArr.push(z + 0.6);
      this.flatX.push(x);
      this.flatZ.push(z + jitter);
      this.flatY.push(jitter * 0.5);
      pos.setXYZ(i, x, this.flatY[i], this.flatZ[i]);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    this.geometry = geo;
    if (this.mesh) this.mesh.geometry = geo;
    if (old && old !== geo) old.dispose();
  }

  /** Swap to a different paper size. Safe to call while the sheet is hidden (PREPARE). */
  setPaper(def: PaperDef): void {
    if (def.id === this.paper.id) return;
    this.paper = def;
    this.rebuildGeometry();
    this.setProgress(this._progress);
  }

  setProgress(p: number): void {
    this._progress = clamp(p, 0, 1);
    const r = this.paper.radius;
    const circ = Math.PI * 2 * r;
    const w = ROLL.window;
    const W = this.paper.width;
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const wobT = this.time;

    for (let i = 0; i < pos.count; i++) {
      const s = this.sArr[i];
      const frac = s / W;
      const c = smoothstep((this._progress * (1 + w) - frac) / w);

      let alpha = 0;
      let rad = r;
      let lift = 0;
      if (s <= circ) {
        alpha = s / r;
      } else {
        rad = r + 0.006;
        alpha = (s - circ) / rad;
        lift = 0.006 * Math.floor(alpha / (Math.PI * 2));
      }

      const rolledY = rad * (1 - Math.cos(alpha)) + lift;
      const rolledZ = -0.6 + rad * Math.sin(alpha);
      const wobble = Math.sin(this.flatX[i] * 3 + wobT) * 0.002 * (1 - c);

      pos.setXYZ(
        i,
        this.flatX[i],
        lerp(this.flatY[i], rolledY, c) + wobble,
        lerp(this.flatZ[i], rolledZ, c),
      );
    }
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  get progress(): number {
    return this._progress;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  update(dt: number): void {
    this.time += dt;
    if (this._progress > 0.05) {
      const targetZ = LAYOUT.paper.z + this._progress * 0.6;
      this.group.position.z = damp(this.group.position.z, targetZ, 5, dt);
    }
    this.setProgress(this._progress);
  }

  reset(): void {
    this.time = 0;
    this.setProgress(0);
    this.group.visible = true;
    this.group.position.set(LAYOUT.paper.x, LAYOUT.paper.y, LAYOUT.paper.z);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}