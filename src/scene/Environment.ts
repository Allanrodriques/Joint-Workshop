import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GraphicsLevel, ThemeDef } from '../game/GameState';
import { QUALITY } from '../game/constants';

export interface Environment {
  setTheme(theme: ThemeDef): void;
  setQuality(g: GraphicsLevel): void;
  dispose(): void;
}

const BASE_INTENSITY = 0.45;

export function createEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
): Environment {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.04);
  const envTexture = target.texture;

  scene.environment = envTexture;
  scene.environmentIntensity = BASE_INTENSITY;

  let theme: ThemeDef | null = null;

  function intensity(): number {
    if (!theme) return BASE_INTENSITY;
    if (theme.name === 'Slate Lab') return 0.5;
    if (theme.name === 'Golden Oak') return 0.48;
    return BASE_INTENSITY;
  }

  function setTheme(next: ThemeDef): void {
    theme = next;
    scene.environmentIntensity = intensity();
  }

  function setQuality(g: GraphicsLevel): void {
    if (QUALITY[g].env) {
      scene.environment = envTexture;
      scene.environmentIntensity = intensity();
    } else {
      scene.environment = null;
    }
  }

  function dispose(): void {
    scene.environment = null;
    envTexture.dispose();
    target.dispose();
    pmrem.dispose();
    room.dispose();
  }

  return { setTheme, setQuality, dispose };
}
