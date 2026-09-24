import * as THREE from 'three';
import type { GraphicsLevel } from '../game/GameState';
import { QUALITY } from '../game/constants';

export interface Lighting {
  setQuality(g: GraphicsLevel): void;
  dispose(): void;
}

export function createLighting(scene: THREE.Scene): Lighting {
  const hemi = new THREE.HemisphereLight('#cfd8ff', '#2a1c12', 0.5);
  scene.add(hemi);

  const key = new THREE.DirectionalLight('#ffe6c4', 2.0);
  key.position.set(3.5, 6, 2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(QUALITY.high.shadow, QUALITY.high.shadow);
  const ortho = key.shadow.camera;
  ortho.left = -5;
  ortho.right = 5;
  ortho.top = 5;
  ortho.bottom = -5;
  ortho.near = 0.5;
  ortho.far = 20;
  ortho.updateProjectionMatrix();
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key);

  const rim = new THREE.DirectionalLight('#8fb0ff', 0.35);
  rim.position.set(-4, 3, -4);
  scene.add(rim);

  const fill = new THREE.PointLight('#ff9a5a', 12, 14, 2);
  fill.position.set(-3, 2.2, -1.5);
  scene.add(fill);

  function setQuality(g: GraphicsLevel): void {
    const size = QUALITY[g].shadow;
    if (key.shadow.mapSize.x !== size) {
      key.shadow.map?.dispose();
      key.shadow.map = null;
      key.shadow.mapSize.set(size, size);
      key.shadow.needsUpdate = true;
    }
    // castShadow stays on; renderer.shadowMap.enabled is SceneManager's job.
  }

  function dispose(): void {
    key.shadow.map?.dispose();
    key.shadow.map = null;
    scene.remove(hemi, key, rim, fill);
    hemi.dispose();
    key.dispose();
    rim.dispose();
    fill.dispose();
  }

  return { setQuality, dispose };
}
