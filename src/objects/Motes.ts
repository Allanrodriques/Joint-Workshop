import * as THREE from 'three';

const BOUNDS = {
  minX: -2.9,
  maxX: 2.9,
  minY: 0.14,
  maxY: 1.5,
  minZ: -2.1,
  maxZ: 2.1,
};

/**
 * Soft dust motes drifting over the desk. Purely atmospheric — they slowly
 * rise, sway, and wrap around the workshop volume.
 */
export class Motes {
  readonly group = new THREE.Group();

  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly vel: Float32Array;
  private readonly seed: Float32Array;
  private time = 0;

  constructor(count = 44) {
    const n = count;
    this.positions = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.seed[i] = Math.random() * Math.PI * 2;
      this.positions[i * 3 + 0] = lerp(BOUNDS.minX, BOUNDS.maxX, Math.random());
      this.positions[i * 3 + 1] = lerp(BOUNDS.minY, BOUNDS.maxY, Math.random());
      this.positions[i * 3 + 2] = lerp(BOUNDS.minZ, BOUNDS.maxZ, Math.random());
      this.vel[i * 3 + 0] = (Math.random() - 0.5) * 0.16;
      this.vel[i * 3 + 1] = 0.02 + Math.random() * 0.08;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.16;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.PointsMaterial({
      color: '#e6c49b',
      size: 0.024,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.renderOrder = 4;
    this.group.add(this.points);
  }

  update(dt: number): void {
    this.time += dt;
    const P = this.positions;
    for (let i = 0; i < this.seed.length; i++) {
      const o = i * 3;
      const sway = Math.sin(this.time * 0.45 + this.seed[i]) * 0.005;
      let x = P[o] + (this.vel[o] + sway) * dt;
      let y = P[o + 1] + this.vel[o + 1] * dt;
      let z = P[o + 2] + this.vel[o + 2] * dt;
      if (x < BOUNDS.minX) x = BOUNDS.maxX;
      else if (x > BOUNDS.maxX) x = BOUNDS.minX;
      if (z < BOUNDS.minZ) z = BOUNDS.maxZ;
      else if (z > BOUNDS.maxZ) z = BOUNDS.minZ;
      if (y < BOUNDS.minY) y = BOUNDS.maxY;
      else if (y > BOUNDS.maxY) y = BOUNDS.minY;
      P[o] = x;
      P[o + 1] = y;
      P[o + 2] = z;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  reset(): void {
    this.time = 0;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}