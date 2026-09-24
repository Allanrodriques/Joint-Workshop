import * as THREE from 'three';
import type { ZoneRing as ZoneRingI } from '../game/GameState';
import { radialTexture } from '../utils/textures';

/** Ground ring that marks a drop zone; green when the placement is good. */
export class ZoneRing implements ZoneRingI {
  readonly group = new THREE.Group();

  private ringGeo = new THREE.RingGeometry(0.7, 0.86, 40, 1);
  private ringGood = new THREE.MeshBasicMaterial({
    color: '#5ee6a8',
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private ringNeutral = new THREE.MeshBasicMaterial({
    color: '#cfd0d4',
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private ring: THREE.Mesh;

  private discGeo = new THREE.CircleGeometry(0.86, 32);
  private discMat = new THREE.MeshBasicMaterial({
    map: radialTexture('#b8ffd9'),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private disc: THREE.Mesh;

  private good = true;
  private t = 0;

  constructor() {
    this.ringGeo.rotateX(-Math.PI / 2);
    this.discGeo.rotateX(-Math.PI / 2);

    this.ring = new THREE.Mesh(this.ringGeo, this.ringGood);
    this.ring.position.y = 0.012;
    this.group.add(this.ring);

    this.disc = new THREE.Mesh(this.discGeo, this.discMat);
    this.disc.position.y = 0.004;
    this.group.add(this.disc);

    this.group.visible = false;
  }

  showAt(pos: THREE.Vector3, radius: number, good?: boolean): void {
    this.group.position.copy(pos);
    const scale = radius / 0.86;
    this.group.scale.set(scale, scale, 1);
    this.good = good ?? true;
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  update(dt: number): void {
    this.t += dt;
    const pulse = 0.55 + 0.35 * Math.sin(this.t * 4);
    this.ringGood.opacity = this.good ? pulse : 0;
    this.ringNeutral.opacity = this.good ? 0 : pulse * 0.8;
    this.ring.material = this.good ? this.ringGood : this.ringNeutral;
    this.discMat.opacity = this.good ? 0.4 + 0.15 * Math.sin(this.t * 4) : 0.12;
  }

  dispose(): void {
    this.ringGeo.dispose();
    this.discGeo.dispose();
    this.ringGood.dispose();
    this.ringNeutral.dispose();
    this.discMat.dispose();
  }
}