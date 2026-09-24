import * as THREE from 'three';
import type { DiscardProp } from '../game/GameState';
import { LAYOUT } from '../game/constants';

/** Small metal waste bin used for tossing stems & seeds during CLEAN UP. */
export class DiscardBin implements DiscardProp {
  readonly group = new THREE.Group();

  private bodyGeo = new THREE.CylinderGeometry(0.3, 0.24, 0.34, 20, 1);
  private rimGeo = new THREE.TorusGeometry(0.3, 0.03, 8, 20);
  private baseGeo = new THREE.CircleGeometry(0.26, 20);
  private bodyMat = new THREE.MeshStandardMaterial({ color: '#2e333b', metalness: 0.55, roughness: 0.45 });
  private rimMat = new THREE.MeshStandardMaterial({ color: '#3a4049', metalness: 0.6, roughness: 0.4 });

  constructor() {
    this.group.position.set(LAYOUT.discard.x, 0, LAYOUT.discard.z);

    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.position.y = 0.17;
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    const base = new THREE.Mesh(this.baseGeo, this.bodyMat);
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.01;
    base.receiveShadow = true;
    this.group.add(base);

    const rim = new THREE.Mesh(this.rimGeo, this.rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.34;
    rim.castShadow = true;
    this.group.add(rim);
  }

  dispose(): void {
    this.bodyGeo.dispose();
    this.rimGeo.dispose();
    this.baseGeo.dispose();
    this.bodyMat.dispose();
    this.rimMat.dispose();
  }
}