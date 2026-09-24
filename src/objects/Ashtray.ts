import * as THREE from 'three';
import type { AshtrayProp } from '../game/GameState';
import { LAYOUT } from '../game/constants';

/** Metal ashtray bowl on the desk. */
export class Ashtray implements AshtrayProp {
  readonly group = new THREE.Group();

  private bowlGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.16, 28, 1);
  private discGeo = new THREE.CircleGeometry(0.36, 28);
  private rimGeo = new THREE.TorusGeometry(0.42, 0.024, 8, 28);
  private notchGeo = new THREE.BoxGeometry(0.07, 0.05, 0.12);
  private bowlMat = new THREE.MeshStandardMaterial({ color: '#17181d', metalness: 0.4, roughness: 0.5 });
  private discMat = new THREE.MeshStandardMaterial({ color: '#0c0d10', metalness: 0.5, roughness: 0.6 });
  private rimMat = new THREE.MeshStandardMaterial({ color: '#1f2128', metalness: 0.4, roughness: 0.5 });

  constructor() {
    this.group.position.set(LAYOUT.ashtray.x, 0, LAYOUT.ashtray.z);

    const bowl = new THREE.Mesh(this.bowlGeo, this.bowlMat);
    bowl.position.y = 0.08;
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    this.group.add(bowl);

    const disc = new THREE.Mesh(this.discGeo, this.discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.155;
    disc.receiveShadow = true;
    this.group.add(disc);

    const rim = new THREE.Mesh(this.rimGeo, this.rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.17;
    rim.castShadow = true;
    this.group.add(rim);

    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const notch = new THREE.Mesh(this.notchGeo, this.rimMat);
      notch.position.set(Math.cos(a) * 0.42, 0.19, Math.sin(a) * 0.42);
      notch.rotation.y = -a;
      notch.castShadow = true;
      this.group.add(notch);
    }
  }

  dispose(): void {
    this.bowlGeo.dispose();
    this.discGeo.dispose();
    this.rimGeo.dispose();
    this.notchGeo.dispose();
    this.bowlMat.dispose();
    this.discMat.dispose();
    this.rimMat.dispose();
  }
}