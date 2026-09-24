import * as THREE from 'three';
import { clamp01 } from './timeline';
import { clamp, lerp, rand } from '../utils/math';
import { smokeTexture } from '../utils/textures';

const MAX_SMOKE = 240;

/** Soft smoky "JW" letter silhouette in world space, sampled from a canvas mask. */
function jwTargets(center: THREE.Vector3, need: number): THREE.Vector3[] {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return [];
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineWidth = 20;
  g.lineJoin = 'round';
  g.font = '700 148px "SF Mono", ui-monospace, Menlo, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('JW', w / 2, h / 2 + 4);
  g.strokeText('JW', w / 2, h / 2 + 4);

  const data = g.getImageData(0, 0, w, h).data;
  const pts: Array<[number, number]> = [];
  const step = 3;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (data[(y * w + x) * 4 + 3] > 150) pts.push([x, y]);
    }
  }
  // Shuffle deterministically-ish (seed keeps headless screenshots stable).
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = pts.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = pts[i];
    pts[i] = pts[j];
    pts[j] = t;
  }

  const spanX = 1.55;
  const spanY = 0.78;
  const take = Math.min(need, pts.length);
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < take; i++) {
    const [px, py] = pts[i];
    out.push(
      new THREE.Vector3(
        center.x + (px - w / 2) * (spanX / w),
        center.y + (h / 2 - py) * (spanY / h),
        center.z + rand(-0.09, 0.09),
      ),
    );
  }
  return out;
}

interface Puff {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  mode: number; // 0 flight · 1 signature · 2 leaving
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3 | null;
  age: number;
  life: number;
  s0: number;
  s1: number;
  peak: number;
  freq: number;
  turb: number;
  drift: number;
  spin: number;
  spinVel: number;
  seedA: number;
  seedB: number;
  wisp: number;
}

/**
 * Pooled billboard smoke. The plume rises from the lit tip; during the
 * signature window the wisps converge into a loose smoky "JW" silhouette,
 * then disperse into a swirl.
 */
export class IntroSmoke {
  readonly group = new THREE.Group();

  private readonly planeGeo = new THREE.PlaneGeometry(1, 1);
  private readonly tex = smokeTexture();
  private readonly pool: Puff[] = [];
  private active: Puff[] = [];

  private readonly emitter: () => THREE.Vector3;
  private readonly reduced: boolean;
  private signing = false;
  private targets: THREE.Vector3[] = [];
  private targetCursor = 0;
  private emitAccum = 0;
  private rate = 14;
  private readonly colorA = new THREE.Color('#cfcabd');
  private readonly colorB = new THREE.Color('#e8d9bd');
  private readonly colorWarm = new THREE.Color('#d8a35f');

  constructor(count: number, reduced: boolean, emitter: () => THREE.Vector3) {
    this.reduced = reduced;
    this.emitter = emitter;
    const total = Math.min(MAX_SMOKE, Math.max(40, Math.round(count)));

    for (let i = 0; i < total; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.tex,
        color: this.colorA,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.planeGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({
        mesh,
        mat,
        mode: -1,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        target: null,
        age: 0,
        life: 1,
        s0: 0,
        s1: 0,
        peak: 0,
        freq: 0,
        turb: 0,
        drift: 0,
        spin: 0,
        spinVel: 0,
        seedA: 0,
        seedB: 0,
        wisp: 0,
      });
    }
  }

  /** Random curl nudge for a micro-event. */
  nudge(): void {
    const active = this.active;
    if (!active.length) return;
    const p = active[Math.floor(Math.random() * active.length)];
    p.vel.x += rand(-1, 1) * 0.5;
    p.vel.z += rand(-1, 1) * 0.5;
    p.vel.y += rand(-0.2, 0.5);
  }

  setRate(mult: number): void {
    this.rate = 14 * clamp(mult, 0.3, 1.6);
  }

  beginSignature(center: THREE.Vector3): void {
    this.signing = true;
    this.targetCursor = 0;
    const room = Math.floor(this.pool.length * (this.reduced ? 0.6 : 0.85));
    this.targets = jwTargets(center, room);

    // Convert the live plume into the silhouette first.
    for (const p of this.active) {
      if (p.mode !== 0) continue;
      const t = this.takeTarget();
      if (!t) break;
      p.mode = 1;
      p.target = t;
      p.vel.multiplyScalar(0.2);
      p.age = 0;
      p.life = 9;
      p.s0 = p.s0 * 0.55;
      p.s1 = Math.min(0.26, p.s1 * 0.6);
      p.peak = 0.55;
    }
    // Fill the rest with dedicated snippet particles from the tip.
    while (this.targetCursor < this.targets.length) {
      const t = this.takeTarget();
      if (!t) break;
      this.spawn(t);
    }
    if (this.reduced) this.signing = false;
  }

  clearSignature(): void {
    this.signing = false;
    this.targets = [];
    for (const p of this.active) {
      if (p.mode === 1) {
        p.mode = 2;
        p.vel.set(rand(-0.2, 0.2), rand(0.25, 0.7), rand(-0.2, 0.2));
        p.life = Math.min(p.life, rand(1.4, 2.6));
      } else if (p.mode === 0) {
        p.life = Math.min(p.life, rand(0.8, 1.6));
      }
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    const camQuat = camera.quaternion;
    const fadeK = 0; // graceful leave is handled through life decay.

    if (!this.signing) {
      this.emitAccum += dt;
      let guard = 0;
      while (this.emitAccum >= 1 / this.rate && guard++ < 6 && this.active.length < this.pool.length) {
        this.emitAccum -= 1 / this.rate;
        this.spawn(null);
      }
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.mode = -1;
        p.mesh.visible = false;
        p.mat.opacity = 0;
        this.active.splice(i, 1);
        continue;
      }

      if (p.mode === 0) {
        const cur = this.reduced ? 0.4 : 1;
        p.vel.x += Math.sin(p.age * p.freq + p.seedA) * p.turb * cur * dt;
        p.vel.z += Math.cos(p.age * p.freq * 0.7 + p.seedB) * p.turb * cur * dt;
        p.vel.x += Math.sin(p.age * 0.5 + p.seedA * 2.7) * p.drift * dt;
        p.vel.z += Math.cos(p.age * 0.44 + p.seedB * 1.7) * p.drift * dt;
        p.vel.y += 0.42 * cur * dt;
        p.pos.addScaledVector(p.vel, dt);

        const grow = Math.pow(k, 0.7);
        const scale = lerp(p.s0, p.s1, grow);
        p.mesh.scale.set(scale, scale, 1);
        const env = p.peak * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
        p.mat.opacity = clamp(env * (1 - fadeK), 0, 1);
      } else if (p.mode === 1 && p.target) {
        const a = 1 - Math.exp(-this.reduced ? 6 : 3.6 * dt);
        p.pos.x += (p.target.x - p.pos.x) * a;
        p.pos.y += (p.target.y - p.pos.y) * a;
        p.pos.z += (p.target.z - p.pos.z) * a;
        p.pos.x += Math.sin(p.age * 1.7 + p.seedA) * 0.012;
        p.pos.y += Math.cos(p.age * 1.4 + p.seedB) * 0.012;
        const scale = lerp(p.s0, p.s1, clamp01(p.age * 3)) * (0.92 + 0.1 * Math.sin(p.age * 5 + p.wisp));
        p.mesh.scale.set(scale, scale * 0.94, 1);
        const shimmer = 0.82 + 0.18 * Math.sin(p.age * 6 + p.seedB * 9);
        p.mat.opacity = clamp(p.peak * shimmer * (1 - fadeK), 0, 1);
      } else {
        p.vel.x += Math.sin(p.age * 1.2 + p.seedA) * 0.28 * dt;
        p.vel.z += Math.cos(p.age * 0.9 + p.seedB) * 0.28 * dt;
        p.vel.y += (0.3 + p.drift * 0.4) * dt;
        p.pos.addScaledVector(p.vel, dt);
        const grow = Math.pow(k, 0.6);
        const scale = lerp(p.s0, p.s1 * 1.6, grow);
        p.mesh.scale.set(scale, scale, 1);
        const env = p.peak * (1 - k);
        p.mat.opacity = clamp(env * (1 - fadeK), 0, 1);
      }

      p.spin += p.spinVel * dt;
      p.mesh.position.copy(p.pos);
      p.mesh.quaternion.copy(camQuat);
      p.mesh.rotateZ(p.spin);
    }
  }

  reset(): void {
    this.signing = false;
    this.targetCursor = 0;
    for (const p of this.pool) {
      p.mode = -1;
      p.mesh.visible = false;
      p.mat.opacity = 0;
    }
    this.active = [];
    this.emitAccum = 0;
  }

  dispose(): void {
    this.planeGeo.dispose();
    this.tex.dispose();
    for (const p of this.pool) p.mat.dispose();
  }

  private takeTarget(): THREE.Vector3 | null {
    if (this.targetCursor >= this.targets.length) return null;
    return this.targets[this.targetCursor++];
  }

  private spawn(target: THREE.Vector3 | null): void {
    if (this.active.length >= this.pool.length) return;
    let idx = -1;
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].mode === -1) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    const p = this.pool[idx];

    if (target) {
      p.mode = 1;
      p.target = target;
      const o = this.emitter();
      p.pos.set(o.x + rand(-0.14, 0.14), o.y + rand(-0.05, 0.08), o.z + rand(-0.14, 0.14));
      p.vel.set(rand(-0.3, 0.3), rand(0.4, 0.9), rand(-0.3, 0.3));
      p.s0 = rand(0.1, 0.16);
      p.s1 = rand(0.17, 0.26);
      p.life = 9;
      p.peak = rand(0.4, 0.58);
    } else {
      p.mode = 0;
      p.target = null;
      const o = this.emitter();
      p.pos.set(o.x + rand(-0.06, 0.06), o.y + rand(-0.02, 0.05), o.z + rand(-0.06, 0.06));
      p.vel.set(rand(-0.12, 0.12), rand(0.5, 0.9), rand(-0.12, 0.12));
      p.s0 = rand(0.09, 0.15);
      p.s1 = rand(0.34, 0.6);
      p.life = rand(2.2, 3.8);
      p.peak = rand(0.16, 0.3);
      p.turb = rand(0.16, 0.34);
      p.drift = rand(0.02, 0.08);
      p.wisp = rand(0, 6.28);
    }
    p.age = 0;
    p.freq = rand(1.6, 3.4);
    p.spin = 0;
    p.spinVel = rand(-0.9, 0.9);
    p.seedA = rand(0, 6.28);
    p.seedB = rand(0, 6.28);
    p.mat.color.copy(Math.random() < 0.22 ? this.colorWarm : rand(0, 1) < 0.5 ? this.colorA : this.colorB);
    p.mesh.visible = true;
    if (!this.active.includes(p)) this.active.push(p);
  }
}