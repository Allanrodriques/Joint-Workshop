import * as THREE from 'three';
import type { FilterProp } from '../game/GameState';
import { LAYOUT } from '../game/constants';

/** Cardboard-ish filter stick (cylinder along X). */
export class Filter implements FilterProp {
  readonly group = new THREE.Group();

  private bodyGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.42, 20, 1);
  private capGeo = new THREE.CircleGeometry(0.095, 20);
  private stripeGeo = new THREE.TorusGeometry(0.095, 0.008, 8, 20);
  private capMat = new THREE.MeshStandardMaterial({ color: '#c7ad83', roughness: 0.8 });
  private stripeMat = new THREE.MeshStandardMaterial({ color: '#caa56e', roughness: 0.7 });
  private bodyMat = new THREE.MeshStandardMaterial({ color: '#e8d7b8', roughness: 0.8 });

  constructor() {
    this.bodyGeo.rotateZ(Math.PI / 2);

    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.castShadow = true;
    this.group.add(body);

    const capL = new THREE.Mesh(this.capGeo, this.capMat);
    capL.rotation.y = Math.PI / 2;
    capL.position.x = -0.21;
    this.group.add(capL);

    const capR = new THREE.Mesh(this.capGeo, this.capMat);
    capR.rotation.y = -Math.PI / 2;
    capR.position.x = 0.21;
    this.group.add(capR);

    const stripe = new THREE.Mesh(this.stripeGeo, this.stripeMat);
    stripe.rotation.y = Math.PI / 2;
    stripe.position.x = 0.02;
    this.group.add(stripe);

    this.reset();
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  reset(): void {
    this.group.position.set(LAYOUT.filterStart.x, LAYOUT.filterStart.y, LAYOUT.filterStart.z);
    this.group.rotation.set(0, 0, 0);
    this.group.visible = true;
  }

  dispose(): void {
    this.bodyGeo.dispose();
    this.capGeo.dispose();
    this.stripeGeo.dispose();
    this.bodyMat.dispose();
    this.capMat.dispose();
    this.stripeMat.dispose();
  }
}