import * as THREE from 'three';
import type { GraphicsLevel, SceneManager as SceneManagerContract } from '../game/GameState';
import { QUALITY } from '../game/constants';
import { gradientTexture } from '../utils/textures';

const BG_TOP = '#1a1a22';
const BG_BOTTOM = '#0b0b10';
const FOG_COLOR = '#0e0e14';
const FOG_DENSITY = 0.055;

export class SceneManager implements SceneManagerContract {
  readonly scene: THREE.Scene;
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;

  constructor(canvas: HTMLCanvasElement, initialQuality: GraphicsLevel = 'high') {
    const q = QUALITY[initialQuality];

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: q.aa,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, q.dpr));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
    this.scene.background = gradientTexture(BG_TOP, BG_BOTTOM);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
    this.camera.position.set(0, 3.4, 5.6);
    this.camera.lookAt(0, 0.35, 0.1);
  }

  /**
   * Owned by SceneManager (Environment never touches background/fog).
   * `bg` drives the gradient top; the bottom is derived as a darker shade.
   */
  setThemeColors(bg: string, fog: string): void {
    const bottom = new THREE.Color(bg).multiplyScalar(0.62).getStyle();
    this.scene.background = gradientTexture(bg, bottom);
    this.scene.fog?.color.set(fog);
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setQuality(g: GraphicsLevel): void {
    const q = QUALITY[g];
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, q.dpr));
    this.renderer.shadowMap.enabled = q.shadows;
    if (q.shadows) this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
