import * as THREE from 'three';
import type { TrayProp } from '../game/GameState';
import { LAYOUT } from '../game/constants';

/** Dark metal rolling tray on the desk. */
export class Tray implements TrayProp {
  readonly group = new THREE.Group();

  private plateGeo = new THREE.BoxGeometry(LAYOUT.tray.w, 0.05, LAYOUT.tray.d);
  private railGeo = new THREE.BoxGeometry(0.09, 0.06, LAYOUT.tray.d - 0.18);
  private railEndGeo = new THREE.BoxGeometry(LAYOUT.tray.w, 0.06, 0.09);
  private mat = new THREE.MeshStandardMaterial({
    color: '#2a2d33',
    metalness: 0.65,
    roughness: 0.45,
  });

  constructor() {
    this.group.position.set(LAYOUT.tray.x, 0, LAYOUT.tray.z);

    const plate = new THREE.Mesh(this.plateGeo, this.mat);
    plate.position.y = LAYOUT.tray.topY - 0.025;
    plate.castShadow = true;
    plate.receiveShadow = true;
    this.group.add(plate);

    const mkRail = (geo: THREE.BufferGeometry, x: number, z: number): THREE.Mesh => {
      const m = new THREE.Mesh(geo, this.mat);
      m.position.set(x, LAYOUT.tray.topY + 0.03, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };

    const halfW = LAYOUT.tray.w / 2;
    const halfD = LAYOUT.tray.d / 2;
    mkRail(this.railEndGeo, 0, halfD);
    mkRail(this.railEndGeo, 0, -halfD);
    mkRail(this.railGeo, halfW, 0);
    mkRail(this.railGeo, -halfW, 0);
  }

  get topY(): number {
    return 0.08;
  }

  contains(p: THREE.Vector3): boolean {
    return (
      Math.abs(p.x - LAYOUT.tray.x) < 1.75 &&
      Math.abs(p.z - LAYOUT.tray.z) < 1.1
    );
  }

  reset(): void {
    this.group.position.set(LAYOUT.tray.x, 0, LAYOUT.tray.z);
    this.group.rotation.set(0, 0, 0);
  }

  dispose(): void {
    this.plateGeo.dispose();
    this.railGeo.dispose();
    this.railEndGeo.dispose();
    this.mat.dispose();
  }
}