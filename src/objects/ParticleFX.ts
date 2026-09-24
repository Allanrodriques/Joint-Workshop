import * as THREE from 'three';
import type { ParticleFX as ParticleFXI } from '../game/GameState';
import { rand } from '../utils/math';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (280.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.12, d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}
`;

const DEFAULT_COLORS = ['#7ddc6a', '#e8a552', '#f3eee2', '#5ee6a8'];

/** Single THREE.Points burst-particle system with a custom soft-disc shader. */
export class ParticleFX implements ParticleFXI {
  readonly group = new THREE.Group();

  private capacity: number;
  private points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private geometry: THREE.BufferGeometry;

  private cursor = 0;

  private posAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private alphaAttr: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;

  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grav: Float32Array;
  private live: Uint8Array;

  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.floor(capacity));

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const pos = new Float32Array(this.capacity * 3);
    const aSize = new Float32Array(this.capacity);
    const aAlpha = new Float32Array(this.capacity);
    const aColor = new Float32Array(this.capacity * 3);

    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(pos, 3);
    this.sizeAttr = new THREE.BufferAttribute(aSize, 1);
    this.alphaAttr = new THREE.BufferAttribute(aAlpha, 1);
    this.colorAttr = new THREE.BufferAttribute(aColor, 3);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('aSize', this.sizeAttr);
    this.geometry.setAttribute('aAlpha', this.alphaAttr);
    this.geometry.setAttribute('aColor', this.colorAttr);
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    this.vel = new Float32Array(this.capacity * 3);
    this.life = new Float32Array(this.capacity);
    this.maxLife = new Float32Array(this.capacity);
    this.grav = new Float32Array(this.capacity);
    this.live = new Uint8Array(this.capacity);
  }

  burst(
    pos: THREE.Vector3,
    opts?: {
      count?: number;
      colors?: string[];
      speed?: number;
      size?: number;
      up?: number;
    },
  ): void {
    const count = opts?.count ?? 14;
    const colors = (opts?.colors ?? DEFAULT_COLORS).map((c) => new THREE.Color(c));
    const speed = opts?.speed ?? 1.6;
    const size = opts?.size ?? 0.085;
    const up = opts?.up ?? 1.2;

    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;

      this.posAttr.setXYZ(i, pos.x, pos.y, pos.z);
      const theta = rand(0, Math.PI * 2);
      const phi = rand(0, Math.PI);
      const dirX = Math.sin(phi) * Math.cos(theta);
      const dirY = Math.cos(phi);
      const dirZ = Math.sin(phi) * Math.sin(theta);
      const sp = speed * rand(0.6, 1.3);
      this.vel[i * 3] = dirX * sp;
      this.vel[i * 3 + 1] = up + dirY * sp;
      this.vel[i * 3 + 2] = dirZ * sp;

      const pl = rand(0.3, 1.4);
      this.life[i] = 0;
      this.maxLife[i] = pl;
      this.grav[i] = 1.2;
      this.sizeAttr.setX(i, size * rand(0.6, 1.4));
      const col = colors[Math.floor(rand(0, colors.length))];
      this.colorAttr.setXYZ(i, col.r, col.g, col.b);
      this.alphaAttr.setX(i, 1);
      this.live[i] = 1;
    }
    this.dirty();
  }

  private dirty(): void {
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (!this.live[i]) continue;
      this.life[i] += dt;
      const k = this.life[i] / this.maxLife[i];
      if (k >= 1) {
        this.live[i] = 0;
        this.alphaAttr.setX(i, 0);
        continue;
      }

      const drag = 1 - 2 * dt;
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - this.grav[i] * dt;

      this.posAttr.setXYZ(
        i,
        this.posAttr.getX(i) + this.vel[i * 3] * dt,
        this.posAttr.getY(i) + this.vel[i * 3 + 1] * dt,
        this.posAttr.getZ(i) + this.vel[i * 3 + 2] * dt,
      );
      this.alphaAttr.setX(i, 1 - k);
      this.sizeAttr.setX(i, this.sizeAttr.getX(i) * (1 - 0.15 * dt));
    }
    this.dirty();
  }

  reset(): void {
    this.cursor = 0;
    this.live.fill(0);
    for (let i = 0; i < this.capacity; i++) this.alphaAttr.setX(i, 0);
    this.alphaAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}