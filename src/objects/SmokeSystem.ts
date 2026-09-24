import * as THREE from 'three';
import type { SmokeSystem as SmokeSystemI } from '../game/GameState';
import { QUALITY } from '../game/constants';
import { clamp, damp, lerp, rand } from '../utils/math';
import { radialTexture, smokeTexture } from '../utils/textures';

interface Particle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  layer: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
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
  active: boolean;
}

interface Spark {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  s0: number;
  seed: number;
  warm: boolean;
  active: boolean;
}

interface LayerDef {
  share: number;
  s0: [number, number];
  s1: [number, number];
  life: [number, number];
  rise: [number, number];
  peak: [number, number];
  freq: [number, number];
  turb: [number, number];
  drift: number;
  additive: boolean;
  color: string;
}

/**
 * Four stacked smoke layers:
 *  0 small/most dense  ·  1 medium blobs  ·  2 large soft clouds  ·  3 faint wisps
 * Everything is pooled up front. A handful of warm ash/ember sparks ride the plume.
 */
const LAYER_DEFS: readonly LayerDef[] = [
  {
    share: 0.26,
    s0: [0.1, 0.16],
    s1: [0.44, 0.72],
    life: [2.2, 3.4],
    rise: [0.28, 0.5],
    peak: [0.34, 0.44],
    freq: [2.4, 3.8],
    turb: [0.16, 0.3],
    drift: 0.05,
    additive: false,
    color: '#babcc6',
  },
  {
    share: 0.3,
    s0: [0.22, 0.34],
    s1: [0.82, 1.3],
    life: [3.2, 4.8],
    rise: [0.42, 0.68],
    peak: [0.2, 0.27],
    freq: [1.2, 2],
    turb: [0.2, 0.34],
    drift: 0.08,
    additive: false,
    color: '#c2c4cc',
  },
  {
    share: 0.26,
    s0: [0.42, 0.6],
    s1: [1.55, 2.4],
    life: [4.4, 6.4],
    rise: [0.5, 0.85],
    peak: [0.11, 0.17],
    freq: [0.6, 1.1],
    turb: [0.26, 0.42],
    drift: 0.16,
    additive: true,
    color: '#cda277',
  },
  {
    share: 0.18,
    s0: [0.16, 0.3],
    s1: [0.72, 1.3],
    life: [5.5, 7.5],
    rise: [0.4, 0.7],
    peak: [0.05, 0.09],
    freq: [0.8, 1.6],
    turb: [0.18, 0.32],
    drift: 0.22,
    additive: true,
    color: '#8f9bb8',
  },
];

const RISE_RATE = 13;
const BLOW_ACC = 3.6;
const BLOW_LIFT = 0.9;
const SWIRL = 0.5;
const FLICKER = 9;
const U_AXIS = /* @__PURE__ */ new THREE.Vector3(0, 1, 0);

/** Layered, pooled, continuously-emitting billboard smoke with a hold-to-blow force. */
export class SmokeSystem implements SmokeSystemI {
  readonly group = new THREE.Group();

  private pool: Particle[] = [];
  private byLayer: Particle[][] = [];
  private sparks: Spark[] = [];
  private planeGeo = new THREE.PlaneGeometry(1, 1);
  private smokeTex = smokeTexture();
  private glowTex = radialTexture('#ffffff');

  private activeMax: number;
  private sparkMax: number;
  private emitter: (out: THREE.Vector3) => THREE.Vector3 = (out) =>
    out.set(0, 0, 0);
  private emitting = false;
  private emitAccum = 0;
  private sparkAccum = 0;
  private time = 0;

  private blowActive = false;
  private blow = 0;
  private readonly blowDir = new THREE.Vector3(0, 1, 0);
  private disturb: THREE.Vector3 | null = null;
  private reduced = false;

  private fadeT = -1;
  private fadeDur = 1;

  constructor(base: number = QUALITY.high.smoke) {
    const total = Math.max(40, Math.round(base));

    // Build the pool in exact layer proportions.
    const counts = LAYER_DEFS.map((d) => Math.max(1, Math.round(total * d.share)));
    let sum = 0;
    for (const c of counts) sum += c;
    for (let l = 0; l < counts.length - 1; l++) {
      counts[l] = Math.max(1, Math.round((counts[l] / sum) * total));
    }
    let filled = 0;
    for (let l = 0; l < counts.length - 1; l++) filled += counts[l];
    counts[counts.length - 1] = Math.max(1, total - filled);

    for (let l = 0; l < LAYER_DEFS.length; l++) {
      const def = LAYER_DEFS[l];
      const arr: Particle[] = [];
      for (let i = 0; i < counts[l]; i++) {
        const mat = new THREE.MeshBasicMaterial({
          map: this.smokeTex,
          color: def.color,
          transparent: true,
          depthWrite: false,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: def.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
        const mesh = new THREE.Mesh(this.planeGeo, mat);
        mesh.visible = false;
        this.group.add(mesh);
        const p: Particle = {
          mesh,
          mat,
          layer: l,
          pos: new THREE.Vector3(),
          vel: new THREE.Vector3(),
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
          active: false,
        };
        this.pool.push(p);
        arr.push(p);
      }
      this.byLayer.push(arr);
    }

    const sparkCount = Math.max(12, Math.round(total * 0.3));
    for (let i = 0; i < sparkCount; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.glowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        color: '#e0b27a',
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      this.group.add(sprite);
      this.sparks.push({
        sprite,
        mat,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        life: 1,
        s0: 0.02,
        seed: rand(0, 6.28),
        warm: false,
        active: false,
      });
    }

    this.activeMax = total;
    this.sparkMax = sparkCount;
  }

  setEmitter(getWorld: (out: THREE.Vector3) => THREE.Vector3): void {
    this.emitter = getWorld;
  }

  start(): void {
    this.fadeT = -1;
    this.emitting = true;
  }

  stop(): void {
    this.emitting = false;
  }

  setDensity(mult: number): void {
    const m = clamp(mult, 0.1, 1);
    this.activeMax = Math.max(24, Math.round(this.pool.length * m));
    this.sparkMax = Math.max(6, Math.round(this.sparks.length * m));
  }

  setBlow(active: boolean, dir: THREE.Vector3): void {
    this.blowActive = active;
    if (dir.lengthSq() > 0) this.blowDir.copy(dir).normalize();
  }

  get blowStrength(): number {
    return this.blow;
  }

  setDisturber(point: THREE.Vector3 | null): void {
    this.disturb = point ? point.clone() : null;
  }

  fadeOut(duration: number): void {
    this.emitting = false;
    this.emitAccum = 0;
    this.sparkAccum = 0;
    if (this.fadeT < 0) this.fadeT = 0;
    this.fadeDur = Math.max(0.1, duration);
  }

  setMotionReduced(v: boolean): void {
    this.reduced = v;
  }

  puff(
    n: number,
    opts?: { dir?: THREE.Vector3; speed?: number; scale?: number },
  ): void {
    const dir = (opts?.dir ?? U_AXIS).clone().normalize();
    const speed = opts?.speed ?? 2.4;
    for (let i = 0; i < n; i++) {
      const l = this.pickLayer();
      this.spawn(l, LAYER_DEFS[l], dir, speed);
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;

    this.blow = damp(this.blow, this.blowActive ? 1 : 0, 5.5, dt);
    const S = this.blow;

    if (this.fadeT >= 0) this.fadeT += dt;

    if (this.emitting) {
      const activeRatio = this.activeMax / this.pool.length;
      const rate = RISE_RATE * activeRatio * (1 + 2.4 * S);
      this.emitAccum += dt;
      let guard = 0;
      while (this.emitAccum >= 1 / rate && guard++ < 8) {
        this.emitAccum -= 1 / rate;
        const l = this.pickLayer();
        this.spawn(l, LAYER_DEFS[l], U_AXIS, 0, 1 + 1.8 * S);
      }

      const sparkRate = (1.6 + 4.2 * S) * (this.sparkMax / this.sparks.length);
      this.sparkAccum += dt;
      if (this.sparkAccum >= 1 / sparkRate) {
        this.sparkAccum = 0;
        this.spawnSpark(1 + 1.2 * S);
      }
    }

    const turbScale = this.reduced ? 0.45 : 1;
    const curlScale = this.reduced ? 0.5 : 1;
    const fadeK = this.fadeT >= 0 ? clamp(this.fadeT / this.fadeDur, 0, 1) : 0;
    const camQuat = camera.quaternion;

    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.active = false;
        p.mesh.visible = false;
        p.mat.opacity = 0;
        continue;
      }

      const t = p.age;
      const turbMag = p.turb * (1 + 2.6 * S) * turbScale;
      const driftMul = this.reduced ? 0.4 : 1;

      p.vel.x += Math.sin(t * p.freq + p.seedA) * turbMag * dt;
      p.vel.z += Math.cos(t * p.freq * 0.83 + p.seedB) * turbMag * dt;
      p.vel.x += Math.sin(t * 0.31 + p.seedA * 3.1) * p.drift * driftMul * dt;
      p.vel.z += Math.cos(t * 0.27 + p.seedB * 2.3) * p.drift * driftMul * dt;

      p.vel.x += this.blowDir.x * BLOW_ACC * S * dt;
      p.vel.z += this.blowDir.z * BLOW_ACC * S * dt;
      p.vel.y += this.blowDir.y * (BLOW_ACC * 0.65) * S * dt + BLOW_LIFT * S * dt + 0.35 * S * dt;

      if (this.disturb && !this.reduced) {
        const dx = p.pos.x - this.disturb.x;
        const dz = p.pos.z - this.disturb.z;
        const d2 = dx * dx + dz * dz + 0.001;
        const d = Math.sqrt(d2);
        if (d < 1.1) {
          const fall = 1 - d / 1.1;
          const inv = 1 / d;
          const nx = dx * inv;
          const nz = dz * inv;
          // push away, spin tangentially, lift slightly.
          p.vel.x += (nx * 1.1 - nz * SWIRL) * fall * 1.6 * dt;
          p.vel.z += (nz * 1.1 + nx * SWIRL) * fall * 1.6 * dt;
          p.vel.y += 0.35 * fall * dt;
        }
      }

      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);

      p.spin += p.spinVel * dt;
      p.mesh.quaternion.copy(camQuat);
      p.mesh.rotateZ(p.spin);

      const growK = Math.pow(k, 0.82);
      const scale = lerp(p.s0, p.s1 * (1 + S * 0.9), growK) * (1 + S * 0.08);
      p.mesh.scale.set(scale, scale, 1);

      let env = k < 0.16 ? k / 0.16 : 1 - (k - 0.16) / 0.84;
      env = clamp(env, 0, 1) * p.peak;
      if (S > 0.05 && curlScale > 0) {
        env *= 0.88 + 0.12 * Math.sin(t * FLICKER + p.seedA * 7.3);
      }
      p.mat.opacity = env * (1 - fadeK);
    }

    for (const s of this.sparks) {
      if (!s.active) continue;
      s.age += dt;
      const k = s.age / s.life;
      if (k >= 1) {
        s.active = false;
        s.sprite.visible = false;
        s.mat.opacity = 0;
        continue;
      }
      if (fadeK >= 1) {
        s.active = false;
        s.sprite.visible = false;
        s.mat.opacity = 0;
        continue;
      }
      const t = s.age;
      s.vel.x += Math.sin(t * 2.1 + s.seed) * 0.3 * dt;
      s.vel.z += Math.cos(t * 1.7 + s.seed * 2) * 0.3 * dt;
      s.vel.x += this.blowDir.x * 1.5 * S * dt;
      s.vel.z += this.blowDir.z * 1.5 * S * dt;
      s.pos.addScaledVector(s.vel, dt);
      s.sprite.position.copy(s.pos);

      const tw = 0.55 + 0.45 * Math.sin(t * 9 + s.seed * 17);
      s.mat.opacity = (1 - k) * tw * (1 - fadeK);
      const sc = s.s0 * (1 + 0.9 * k);
      s.sprite.scale.set(sc, sc, 1);
    }
  }

  reset(): void {
    this.emitting = false;
    this.emitAccum = 0;
    this.sparkAccum = 0;
    this.blowActive = false;
    this.blow = 0;
    this.blowDir.set(0, 1, 0);
    this.disturb = null;
    this.fadeT = -1;
    for (const p of this.pool) {
      p.active = false;
      p.mesh.visible = false;
      p.mat.opacity = 0;
    }
    for (const s of this.sparks) {
      s.active = false;
      s.sprite.visible = false;
      s.mat.opacity = 0;
    }
  }

  dispose(): void {
    this.planeGeo.dispose();
    this.smokeTex.dispose();
    this.glowTex.dispose();
    for (const p of this.pool) p.mat.dispose();
    for (const s of this.sparks) s.mat.dispose();
  }

  private pickLayer(): number {
    const r = Math.random();
    let acc = 0;
    for (let i = 0; i < LAYER_DEFS.length; i++) {
      acc += LAYER_DEFS[i].share;
      if (r < acc) return i;
    }
    return LAYER_DEFS.length - 1;
  }

  private spawn(
    layer: number,
    def: LayerDef,
    dir: THREE.Vector3,
    speed: number,
    boost = 1,
  ): void {
    const arr = this.byLayer[layer];
    let found: Particle | null = null;
    for (let i = 0; i < arr.length; i++) {
      if (!arr[i].active) {
        found = arr[i];
        break;
      }
    }
    if (!found) return;

    const out = new THREE.Vector3();
    found.pos.copy(this.emitter(out));
    found.pos.x += rand(-0.05, 0.05);
    found.pos.y += rand(-0.01, 0.02);
    found.pos.z += rand(-0.05, 0.05);

    const S = this.blow;
    const rise = rand(def.rise[0], def.rise[1]);
    const bx = dir.x * (speed + 1.9 * S);
    const by = dir.y * (speed * 0.7 + 1.2 * S);
    const bz = dir.z * (speed + 1.9 * S);
    found.vel.set(bx, rise + by, bz);
    found.vel.x += rand(-0.14, 0.14) * boost;
    found.vel.z += rand(-0.14, 0.14) * boost;

    found.age = 0;
    found.life = rand(def.life[0], def.life[1]) * rand(0.85, 1.15);
    found.s0 = rand(def.s0[0], def.s0[1]) * (1 + S * 0.3);
    found.s1 = rand(def.s1[0], def.s1[1]) * (1 + S * 0.4);
    found.peak = rand(def.peak[0], def.peak[1]);
    found.freq = rand(def.freq[0], def.freq[1]) * (1 + S * 0.6);
    found.turb = rand(def.turb[0], def.turb[1]);
    found.drift = rand(0.5, 1.4) * def.drift;
    found.spin = 0;
    found.spinVel = rand(-1.4, 1.4) * (1 + S * 0.8);
    found.seedA = rand(0, 6.28);
    found.seedB = rand(0, 6.28);
    found.active = true;
    found.mesh.visible = true;
  }

  private spawnSpark(boost: number): void {
    let found: Spark | null = null;
    for (let i = 0; i < this.sparks.length; i++) {
      if (!this.sparks[i].active) {
        found = this.sparks[i];
        break;
      }
    }
    if (!found) return;

    const out = new THREE.Vector3();
    found.pos.copy(this.emitter(out));
    found.pos.x += rand(-0.04, 0.04);
    found.pos.y += rand(-0.02, 0.08);
    found.pos.z += rand(-0.04, 0.04);
    found.vel.set(
      rand(-0.08, 0.08),
      rand(0.4, 0.9) * boost,
      rand(-0.08, 0.08),
    );
    found.age = 0;
    found.life = rand(0.7, 1.8);
    found.s0 = rand(0.022, 0.052);
    found.seed = rand(0, 6.28);
    found.warm = Math.random() < 0.4;
    found.mat.color.set(found.warm ? '#ffab55' : '#d9bd8e');
    found.active = true;
    found.sprite.visible = true;
  }
}