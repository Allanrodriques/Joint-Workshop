import * as THREE from 'three';
import type { FinishedJoint as FinishedJointI } from '../game/GameState';
import { LAYOUT, PAPERS } from '../game/constants';
import type { PaperDef } from '../game/constants';
import { damp } from '../utils/math';
import { radialTexture } from '../utils/textures';

/** The finished rolled joint. Optionally spins, and can be lit (ember at the tip). */
export class FinishedJoint implements FinishedJointI {
  readonly group = new THREE.Group();

  private bodyGeo = new THREE.CylinderGeometry(0.17, 0.17, 2.4, 24, 1);
  private filterGeo = new THREE.CylinderGeometry(0.172, 0.172, 0.42, 24, 1);
  private filterCapGeo = new THREE.CircleGeometry(0.172, 24);
  private tipGeo = new THREE.CylinderGeometry(0.13, 0.17, 0.1, 20, 1);
  private fleckGeo = new THREE.CircleGeometry(0.13, 20);
  private seamGeo = new THREE.BoxGeometry(2.2, 0.022, 0.012);

  private bodyMat = new THREE.MeshStandardMaterial({ color: '#f3eee2', roughness: 0.85 });
  private filterMat = new THREE.MeshStandardMaterial({ color: '#dfc49a', roughness: 0.8 });
  private filterCapMat = new THREE.MeshStandardMaterial({ color: '#c7a877', roughness: 0.8 });
  private tipMat = new THREE.MeshStandardMaterial({ color: '#cfd8b0', roughness: 0.8 });
  private fleckMat = new THREE.MeshStandardMaterial({ color: '#5d7a3c', roughness: 0.9 });
  private seamMat = new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.9 });

  private ember: THREE.Sprite;
  private emberMat: THREE.SpriteMaterial;
  private emberLight: THREE.PointLight;

  private homePos = new THREE.Vector3();
  private lit = false;
  private spinning = false;
  private intensity = 0;
  private time = 0;
  private paper: PaperDef = PAPERS[1];
  private lenScale = 1;
  private radScale = 1;

  constructor() {
    this.bodyGeo.rotateZ(Math.PI / 2);
    this.filterGeo.rotateZ(Math.PI / 2);
    this.tipGeo.rotateZ(Math.PI / 2);

    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.castShadow = true;
    this.group.add(body);

    const filter = new THREE.Mesh(this.filterGeo, this.filterMat);
    filter.position.x = -1.0;
    filter.castShadow = true;
    this.group.add(filter);

    const filterCap = new THREE.Mesh(this.filterCapGeo, this.filterCapMat);
    filterCap.rotation.y = Math.PI / 2;
    filterCap.position.x = -1.21;
    this.group.add(filterCap);

    const tip = new THREE.Mesh(this.tipGeo, this.tipMat);
    tip.position.x = 1.2;
    tip.castShadow = true;
    this.group.add(tip);

    const fleck = new THREE.Mesh(this.fleckGeo, this.fleckMat);
    fleck.rotation.y = -Math.PI / 2;
    fleck.position.x = 1.26;
    this.group.add(fleck);

    const seam = new THREE.Mesh(this.seamGeo, this.seamMat);
    seam.position.set(0.1, 0.05, 0.16);
    this.group.add(seam);

    this.emberMat = new THREE.SpriteMaterial({
      map: radialTexture('#ff7a2a'),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ember = new THREE.Sprite(this.emberMat);
    this.ember.position.set(1.26, 0, 0);
    this.ember.scale.set(0.22, 0.22, 1);
    this.group.add(this.ember);

    this.emberLight = new THREE.PointLight('#ff7a2a', 0, 2.4, 1.8);
    this.emberLight.position.set(1.3, 0, 0);
    this.group.add(this.emberLight);

    this.reset();
  }

  show(): void {
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  /** Reshape the joint (length × radius) to match the chosen paper. */
  applyPaper(def: PaperDef): void {
    if (def.id === this.paper.id) return;
    const base = PAPERS[1];
    this.paper = def;
    this.lenScale = def.length / base.length;
    this.radScale = def.radius / base.radius;
    this.group.scale.set(this.lenScale, this.radScale, this.radScale);
  }

  setSpin(v: boolean): void {
    this.spinning = v;
  }

  setLit(v: boolean): void {
    this.lit = v;
  }

  getTipWorld(out: THREE.Vector3): THREE.Vector3 {
    out.set(1.26, 0, 0);
    return this.group.localToWorld(out);
  }

  /** 0..1 ember intensity (drives the vignette glow). */
  get litLevel(): number {
    return this.intensity / 2.4;
  }

  update(dt: number): void {
    this.time += dt;

    if (this.spinning) {
      this.group.rotation.x += dt * 0.55;
      this.group.position.y = this.homePos.y + Math.sin(this.time * 1.4) * 0.01;
    } else {
      this.group.rotation.x = damp(this.group.rotation.x, 0, 6, dt);
      this.group.position.y = damp(this.group.position.y, this.homePos.y, 6, dt);
    }

    const targetI = this.lit ? 2.4 : 0;
    this.intensity = damp(this.intensity, targetI, 6, dt);
    this.tipMat.emissive.set('#ff5a1e');
    this.tipMat.emissiveIntensity = this.intensity;

    const charK = this.intensity / 2.4;
    if (this.lit) {
      this.tipMat.color.set('#cfd8b0').lerp(new THREE.Color('#6f6a58'), charK * 0.6);
    } else {
      this.tipMat.color.lerp(new THREE.Color('#cfd8b0'), Math.min(1, dt * 4));
    }

    this.emberMat.opacity = damp(this.emberMat.opacity, this.lit ? 1 : 0, 6, dt);
    if (this.lit) {
      const s = 0.22 * (1 + 0.08 * Math.sin(this.time * 9));
      this.ember.scale.set(s, s, 1);
      const flick = 0.94 + 0.06 * Math.sin(this.time * 23);
      this.emberLight.intensity = this.intensity * 1.35 * flick;
    } else {
      this.emberLight.intensity = damp(this.emberLight.intensity, 0, 6, dt);
    }
  }

  reset(): void {
    this.group.visible = false;
    this.lit = false;
    this.spinning = false;
    this.intensity = 0;
    this.tipMat.emissiveIntensity = 0;
    this.tipMat.color.set('#cfd8b0');
    this.emberMat.opacity = 0;
    this.emberLight.intensity = 0;
    this.group.rotation.set(0, 0, 0);
    this.group.position.set(LAYOUT.joint.x, LAYOUT.joint.y, LAYOUT.joint.z);
    this.homePos.set(LAYOUT.joint.x, LAYOUT.joint.y, LAYOUT.joint.z);
  }

  dispose(): void {
    this.bodyGeo.dispose();
    this.filterGeo.dispose();
    this.filterCapGeo.dispose();
    this.tipGeo.dispose();
    this.fleckGeo.dispose();
    this.seamGeo.dispose();
    this.bodyMat.dispose();
    this.filterMat.dispose();
    this.filterCapMat.dispose();
    this.tipMat.dispose();
    this.fleckMat.dispose();
    this.seamMat.dispose();
    this.emberMat.dispose();
  }
}