import * as THREE from 'three';
import type { PaperStackProp } from '../game/GameState';
import { LAYOUT } from '../game/constants';

/** Small stack of loose rolling papers. */
export class PaperStack implements PaperStackProp {
  readonly group = new THREE.Group();

  private sheetGeo = new THREE.BoxGeometry(0.9, 0.004, 0.55);
  private sheetMat = new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.85 });

  constructor() {
    this.group.position.set(LAYOUT.stack.x, 0, LAYOUT.stack.z);
    for (let i = 0; i < 4; i++) {
      const sheet = new THREE.Mesh(this.sheetGeo, this.sheetMat);
      sheet.position.set((Math.random() - 0.5) * 0.01, 0.002 + i * 0.0045, (Math.random() - 0.5) * 0.01);
      sheet.rotation.y = (Math.random() - 0.5) * 0.06;
      sheet.rotation.x = (Math.random() - 0.5) * 0.01;
      sheet.rotation.z = (Math.random() - 0.5) * 0.01;
      sheet.castShadow = true;
      sheet.receiveShadow = true;
      this.group.add(sheet);
    }
  }

  dispose(): void {
    this.sheetGeo.dispose();
    this.sheetMat.dispose();
  }
}