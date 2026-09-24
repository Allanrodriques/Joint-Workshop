import * as THREE from 'three';
import type { ThemeDef } from '../game/GameState';
import { woodTexture } from '../utils/textures';

/** Tabletop desk. Top surface sits at y=0. */
export class Desk {
  readonly group = new THREE.Group();

  private bodyMat = new THREE.MeshStandardMaterial({ color: '#2a1b10', roughness: 0.9 });
  private topMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 });
  private insetMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
  private edgeMat = new THREE.MeshStandardMaterial({ color: '#1a0f08', roughness: 0.7, metalness: 0.15 });

  private bodyGeo = new THREE.BoxGeometry(10, 0.28, 6.5);
  private topGeo = new THREE.PlaneGeometry(10, 6.5);
  private insetGeo = new THREE.PlaneGeometry(9.6, 6.1);
  private edgeGeo = new THREE.BoxGeometry(10.08, 0.03, 6.58);

  constructor() {
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.position.y = -0.14;
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    const top = new THREE.Mesh(this.topGeo, this.topMat);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.001;
    top.receiveShadow = true;
    this.group.add(top);

    const edge = new THREE.Mesh(this.edgeGeo, this.edgeMat);
    edge.position.y = 0.015;
    edge.receiveShadow = true;
    this.group.add(edge);

    const inset = new THREE.Mesh(this.insetGeo, this.insetMat);
    inset.rotation.x = -Math.PI / 2;
    inset.position.y = 0.034;
    inset.receiveShadow = true;
    this.group.add(inset);

    this.setTheme({
      name: 'Walnut Night',
      deskBase: '#4a3220',
      deskDark: '#2a1b10',
      deskLight: '#6b4a2b',
      bg: '#121218',
      fog: '#0e0e14',
      accent: '#e8a552',
    });
  }

  setTheme(theme: ThemeDef): void {
    this.topMat.map = woodTexture(theme.deskBase, theme.deskDark, theme.deskLight, 3);
    this.topMat.needsUpdate = true;
    this.insetMat.map = woodTexture(theme.deskBase, theme.deskDark, theme.deskLight, 3);
    this.insetMat.needsUpdate = true;
    this.bodyMat.color.set(theme.deskDark);
    this.edgeMat.color.set(theme.deskDark);
  }

  dispose(): void {
    this.bodyGeo.dispose();
    this.topGeo.dispose();
    this.insetGeo.dispose();
    this.edgeGeo.dispose();
    this.bodyMat.dispose();
    this.topMat.dispose();
    this.insetMat.dispose();
    this.edgeMat.dispose();
  }
}