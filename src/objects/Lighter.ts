import * as THREE from 'three';
import type { LighterProp } from '../game/GameState';
import { LAYOUT } from '../game/constants';
import { clamp, easeInOutCubic, lerp } from '../utils/math';
import { flameTexture } from '../utils/textures';

interface Flight {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromRot: number;
  toRot: number;
  t: number;
  dur: number;
  cb?: () => void;
}

/** Amber plastic lighter with a metal hood and animated flame. */
export class Lighter implements LighterProp {
  readonly group = new THREE.Group();

  private bodyGeo = new THREE.BoxGeometry(0.16, 0.34, 0.11);
  private hoodGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.1, 20, 1, true);
  private wheelGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.03, 10, 1);
  private nozzleGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.04, 10, 1);
  private glowGeo = new THREE.SphereGeometry(0.05, 10, 8);

  private bodyMat = new THREE.MeshStandardMaterial({ color: '#e8a552', roughness: 0.35 });
  private hoodMat = new THREE.MeshStandardMaterial({ color: '#b8bcc4', metalness: 0.9, roughness: 0.3 });
  private wheelMat = new THREE.MeshStandardMaterial({ color: '#20242a', metalness: 0.6, roughness: 0.4 });
  private nozzleMat = new THREE.MeshStandardMaterial({ color: '#9ba2ad', metalness: 0.8, roughness: 0.3 });
  private glowMat = new THREE.MeshBasicMaterial({
    color: '#ff9830',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  private flame: THREE.Mesh;
  private flameMat: THREE.MeshBasicMaterial;
  private flameGeo = new THREE.PlaneGeometry(0.22, 0.32);

  private flight: Flight | null = null;
  private homePos = new THREE.Vector3();
  private flameLit = false;
  private time = 0;

  constructor() {
    this.group.position.set(LAYOUT.lighter.x, 0, LAYOUT.lighter.z);
    this.homePos.copy(this.group.position);

    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.position.y = 0.17;
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    const hood = new THREE.Mesh(this.hoodGeo, this.hoodMat);
    hood.position.y = 0.38;
    hood.castShadow = true;
    this.group.add(hood);

    const wheel = new THREE.Mesh(this.wheelGeo, this.wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0, 0.38, 0.062);
    this.group.add(wheel);

    const nozzle = new THREE.Mesh(this.nozzleGeo, this.nozzleMat);
    nozzle.position.set(0, 0.44, 0);
    this.group.add(nozzle);

    this.flameMat = new THREE.MeshBasicMaterial({
      map: flameTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.flame = new THREE.Mesh(this.flameGeo, this.flameMat);
    this.flame.position.set(0, 0.47, 0);
    this.group.add(this.flame);

    const glow = new THREE.Mesh(this.glowGeo, this.glowMat);
    glow.position.set(0, 0.45, 0);
    this.group.add(glow);
  }

  flyTo(target: THREE.Vector3, duration: number, cb?: () => void): void {
    const from = this.group.position.clone();
    const to = target.clone();
    const fromRot = this.group.rotation.y;
    const toRot = Math.atan2(to.x - from.x, to.z - from.z);
    this.flight = { from, to, fromRot, toRot, t: 0, dur: Math.max(0.001, duration), cb };
  }

  goHome(duration: number, cb?: () => void): void {
    const from = this.group.position.clone();
    const fromRot = this.group.rotation.y;
    this.flight = {
      from,
      to: this.homePos.clone(),
      fromRot,
      toRot: 0,
      t: 0,
      dur: Math.max(0.001, duration),
      cb,
    };
  }

  setFlame(v: boolean): void {
    this.flameLit = v;
  }

  update(dt: number): void {
    this.time += dt;

    if (this.flight) {
      const f = this.flight;
      f.t += dt;
      const k = clamp(f.t / f.dur, 0, 1);
      const e = easeInOutCubic(k);
      const arc = Math.sin(Math.PI * e) * 0.4;
      this.group.position.set(
        lerp(f.from.x, f.to.x, e),
        lerp(f.from.y, f.to.y, e) + arc,
        lerp(f.from.z, f.to.z, e),
      );
      this.group.rotation.y = lerp(f.fromRot, f.toRot, e);
      if (k >= 1) {
        this.flight = null;
        f.cb?.();
      }
    }

    if (this.flameLit) {
      this.flameMat.opacity = 0.9 + Math.sin(this.time * 23) * 0.08 + Math.sin(this.time * 31 + 1.7) * 0.05;
      const fl = this.flame.scale;
      const s = 1 + Math.sin(this.time * 23) * 0.14 + Math.sin(this.time * 17) * 0.07;
      fl.set(0.22 * s, 0.32 * s * (1 + 0.12 * Math.sin(this.time * 29)), 1);
    } else {
      this.flameMat.opacity = 0;
    }
    this.glowMat.opacity = this.flameLit ? 0.45 + Math.sin(this.time * 23) * 0.1 : 0;
  }

  reset(): void {
    this.flight = null;
    this.setFlame(false);
    this.group.position.copy(this.homePos);
    this.group.rotation.set(0, 0, 0);
    this.flameMat.opacity = 0;
    this.glowMat.opacity = 0;
  }

  dispose(): void {
    this.bodyGeo.dispose();
    this.hoodGeo.dispose();
    this.wheelGeo.dispose();
    this.nozzleGeo.dispose();
    this.glowGeo.dispose();
    this.flameGeo.dispose();
    this.bodyMat.dispose();
    this.hoodMat.dispose();
    this.wheelMat.dispose();
    this.nozzleMat.dispose();
    this.glowMat.dispose();
    this.flameMat.dispose();
  }
}