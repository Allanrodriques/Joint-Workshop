import * as THREE from 'three';
import { PAPER, PAPER_R, T, clamp01, seg } from './timeline';
import { lerp, rand, smoothstep } from '../utils/math';

const MAX_INSTANCES = 240;

const BUD_COLORS = ['#8fe78f', '#3ecf8e', '#7ddc6a', '#1a9e6a', '#b3e88f'];
const LEAF_COLORS = ['#2f9e52', '#57b84f', '#1c7c46', '#3ecf8e', '#69cf7b'];

interface Herb {
  kind: number;
  sx: number;
  sz: number;
  h1: number;
  orbitA: number;
  turns: number;
  r0: number;
  r1: number;
  h0: number;
  phase: number;
  spinH: number;
  restYaw: number;
  restPitch: number;
  scale: number;
  yawVel: number;
  pulse: number;
  impulse: THREE.Vector3;
  absorb: number;
  gone: boolean;
  flyT: number;
  flyFrom: number[];
  flyTo: number[];
}

const tmpColor = new THREE.Color();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpEuler = new THREE.Euler();

function restEuler(): THREE.Euler {
  const e = new THREE.Euler();
  e.x = rand(-0.7, 0.7);
  e.y = rand(-Math.PI, Math.PI);
  e.z = rand(-0.7, 0.7);
  return e;
}

/**
 * The "green" — a pool of small herb flecks that spiral in, settle on the
 * rolling paper, then absorb into the roll as it wraps. Two instanced meshes
 * (bud balls + leaf shards) keep it cheap on every device.
 */
export class IntroParticles {
  readonly group = new THREE.Group();

  private readonly capacity: number;
  private readonly budCount: number;
  private readonly budMesh: THREE.InstancedMesh;
  private readonly leafMesh: THREE.InstancedMesh;
  private readonly reduced: boolean;
  private readonly budGeo = new THREE.IcosahedronGeometry(0.05, 0);
  private readonly leafGeo = new THREE.OctahedronGeometry(0.075, 0);
  private readonly material = new THREE.MeshStandardMaterial({
    color: '#4a8f3f',
    roughness: 0.55,
    metalness: 0.05,
  });

  private herbs: Herb[] = [];
  private readonly mat = new THREE.Matrix4();

  constructor(count: number, reduced: boolean) {
    this.capacity = Math.min(MAX_INSTANCES, Math.max(1, Math.round(count)));
    const budShare = Math.round(this.capacity * 0.55);
    this.budCount = budShare;
    this.reduced = reduced;

    const mk = (geo: THREE.BufferGeometry): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geo, this.material, this.capacity);
      m.count = this.capacity;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    this.budMesh = mk(this.budGeo);
    this.leafMesh = mk(this.leafGeo);

    for (let i = 0; i < this.capacity; i++) {
      const kind = i < budShare ? 0 : 1;
      const colors = kind === 0 ? BUD_COLORS : LEAF_COLORS;
      tmpColor.set(colors[i % colors.length]).multiplyScalar(rand(0.82, 1.12));
      (kind === 0 ? this.budMesh : this.leafMesh).setColorAt(i, tmpColor);

      const herb: Herb = {
        kind,
        sx: rand(-PAPER.LEN * 0.42, PAPER.LEN * 0.42),
        sz: rand(-PAPER.W * 0.45, PAPER.W * 0.45),
        h1: rand(0.075, 0.12),
        orbitA: rand(0, Math.PI * 2),
        turns: rand(0.6, 2.4),
        r0: rand(0.65, 1.45),
        r1: rand(0.05, 0.5),
        h0: rand(0.55, 1.35),
        phase: rand(0, 1),
        spinH: rand(0.2, 1.4),
        restYaw: 0,
        restPitch: 0,
        scale: kind === 0 ? rand(0.7, 1.5) : rand(0.8, 1.8),
        yawVel: rand(-4, 4),
        pulse: rand(0, 10),
        impulse: new THREE.Vector3(),
        absorb: 0,
        gone: false,
        flyT: -1,
        flyFrom: [0, 0, 0],
        flyTo: [0, 0, 0],
      };
      const rest = restEuler();
      herb.restYaw = rest.y;
      herb.restPitch = rest.x;
      this.herbs.push(herb);
    }

    // Everything starts hidden.
    for (let i = 0; i < this.capacity; i++) {
      tmpPos.set(0, -5, 0);
      tmpQuat.identity();
      tmpScale.setScalar(0.0001);
      this.mat.compose(tmpPos, tmpQuat, tmpScale);
      this.writeMatrix(i);
    }
  }

  /** Tiny outward nudge at *point* when the user taps/clicks. */
  disturb(point: THREE.Vector3, strength: number): void {
    for (let i = 0; i < this.capacity; i++) {
      const h = this.herbs[i];
      if (h.gone || h.flyT >= 0) continue;
      const dx = h.sx - point.x;
      const dz = h.sz - point.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 14) continue;
      const fall = 1 - Math.sqrt(d2) / 3.75;
      const len = Math.sqrt(d2 + 0.001);
      h.impulse.x += (dx / len) * strength * fall;
      h.impulse.z += (dz / len) * strength * fall;
      h.impulse.y += strength * fall * 0.6;
    }
  }

  /** Rare micro-event: a random live fleck flies past the camera. */
  flyBy(cameraPos: THREE.Vector3): void {
    if (this.reduced) return;
    let idx = -1;
    for (let attempt = 0; attempt < 12; attempt++) {
      const candidate = Math.floor(rand(0, this.capacity));
      if (this.herbs[candidate].gone) continue;
      idx = candidate;
      break;
    }
    if (idx < 0) return;
    const h = this.herbs[idx];
    h.flyT = 0;
    h.flyFrom = [h.sx, h.h1, h.sz];
    h.flyTo = [
      cameraPos.x + rand(-0.5, 0.5),
      cameraPos.y + rand(-0.4, 0.4),
      cameraPos.z + rand(-0.3, 0.2),
    ];
  }

  update(dt: number, time: number): void {
    const swirlBase = seg(time, T.SWIRL_START, T.SWIRL_SETTLE);
    const roll = seg(time, T.ROLL_START, T.ROLL_END);

    for (let i = 0; i < this.capacity; i++) {
      const h = this.herbs[i];
      if (h.gone) {
        this.goneMatrix(i);
        continue;
      }

      if (h.flyT >= 0) {
        h.flyT += dt;
        const k = smoothstep(clamp01(h.flyT / 0.7));
        tmpPos.set(
          lerp(h.flyFrom[0], h.flyTo[0], k),
          lerp(h.flyFrom[1], h.flyTo[1], k),
          lerp(h.flyFrom[2], h.flyTo[2], k),
        );
        tmpEuler.set(k * 3, h.restYaw, k * 2.5);
        tmpQuat.setFromEuler(tmpEuler);
        const s = h.scale * (0.75 + 0.4 * Math.sin(k * Math.PI));
        tmpScale.set(s, s + 0.12, s);
        this.mat.compose(tmpPos, tmpQuat, tmpScale);
        this.writeMatrix(i);
        if (h.flyT >= 0.7) h.flyT = -1;
        continue;
      }

      // Local per-particle swirl progress (staggered by phase).
      const base = clamp01((swirlBase - h.phase * 0.3) / (1 - h.phase * 0.3));
      const e = smoothstep(base);

      if (e < 1) {
        // In flight: spiral inward around the paper.
        const angle =
          h.orbitA + h.turns * Math.PI * 2 * e + Math.sin(time * 0.9 + h.pulse) * 0.12;
        const r = lerp(h.r0, h.r1, e);
        const wob = Math.sin(time * 2.4 + h.pulse * 3) * 0.02 * (1 - e);
        tmpPos.set(
          Math.sin(angle) * r * 0.8,
          lerp(h.h0, h.h1, e) + wob,
          Math.cos(angle) * r,
        );
        // Blend onto the exact settle point near the end.
        tmpPos.x = lerp(tmpPos.x, h.sx, (e * e * e));
        tmpPos.z = lerp(tmpPos.z, h.sz, (e * e * e));

        tmpEuler.set(
          lerp(time * h.yawVel, h.restPitch, e),
          lerp(time * h.yawVel * 1.4 + h.orbitA, h.restYaw, e),
          lerp(time * h.yawVel * 0.7, 0, e),
        );
        tmpQuat.setFromEuler(tmpEuler);
        const pulse = 1 + 0.14 * Math.sin(time * 4 + h.pulse * 7);
        const s = h.scale * lerp(pulse, 1, e);
        tmpScale.set(s, s + (h.kind === 1 ? 0.55 * s : 0), s * 0.9);
      } else {
        // Settled on the paper (or drifting toward absorb).
        tmpPos.set(h.sx, h.h1, h.sz);
        tmpEuler.set(h.restPitch, h.restYaw, 0);
        tmpQuat.setFromEuler(tmpEuler);
        const s = h.scale * (h.kind === 1 ? 1.55 : 1);
        tmpScale.set(s, s * (h.kind === 1 ? 0.5 : 1), s);

        const ak = clamp01((roll - h.phase * 0.35) / (1 - h.phase * 0.35));
        if (ak > 0) {
          h.absorb = ak;
          const inward = smoothstep(ak);
          tmpPos.x = lerp(tmpPos.x, 0, inward);
          tmpPos.z = lerp(tmpPos.z, 0, inward);
          tmpPos.y = lerp(h.h1, PAPER_R + 0.03, inward) + 0.02 * Math.sin(time * 8 + h.pulse);
          tmpEuler.x += inward * 4.2;
          tmpEuler.y += inward * 1.6;
          tmpQuat.setFromEuler(tmpEuler);
          const shrink = 1 - ak * ak;
          tmpScale.multiplyScalar(Math.max(0.0001, shrink));
          if (ak >= 1) {
            h.gone = true;
            this.goneMatrix(i);
            continue;
          }
        }
      }

      // Disturbance impulse decays.
      if (h.impulse.lengthSq() > 1e-6) {
        tmpPos.addScaledVector(h.impulse, dt);
        h.impulse.multiplyScalar(Math.exp(-4.5 * dt));
      }

      this.mat.compose(tmpPos, tmpQuat, tmpScale);
      this.writeMatrix(i);
    }

    (this.budMesh.instanceMatrix as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.leafMesh.instanceMatrix as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  private writeMatrix(i: number): void {
    if (i < this.budCount) {
      this.budMesh.setMatrixAt(i, this.mat);
    } else {
      this.leafMesh.setMatrixAt(i - this.budCount, this.mat);
    }
  }

  private goneMatrix(i: number): void {
    const s = 0.0001;
    const q = tmpQuat.identity();
    const p = tmpPos.set(0, -99, 0);
    const sc = tmpScale.set(s, s, s);
    this.mat.compose(p, q, sc);
    if (i < this.budCount) this.budMesh.setMatrixAt(i, this.mat);
    else this.leafMesh.setMatrixAt(i - this.budCount, this.mat);
  }

  dispose(): void {
    this.budGeo.dispose();
    this.leafGeo.dispose();
    this.material.dispose();
    this.budMesh.dispose();
    this.leafMesh.dispose();
  }
}