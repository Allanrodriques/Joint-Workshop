import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { LAYOUT } from '../game/constants';

const MONO_FONT = '"SF Mono", "Roboto Mono", Menlo, Consolas, monospace';

const PLATE = {
  w: 0.5,
  h: 0.28,
  t: 0.022,
  radius: 0.012,
  standH: 0.02,
  standW: 0.2,
  standD: 0.1,
  /** face plane is drawn slightly proud of the plate front */
  faceZ: 0.013,
} as const;

const FACE = { w: 0.44, h: 0.225 };

const GLOW = 0.16;

/**
 * Small engraved metal "built by" signature on the back corner of the desk.
 * Pure easter egg — canvas-drawn text (no font dependency), fully static.
 */
export class CreatorPlaque {
  readonly group = new THREE.Group();

  /** exposed for QA/debug */
  readonly faceMat: THREE.MeshStandardMaterial;

  private readonly assembly = new THREE.Group();

  private readonly metalMat: THREE.MeshStandardMaterial;
  private readonly brushedTex: THREE.Texture;
  private readonly faceMap: THREE.Texture;
  private readonly emitMap: THREE.Texture;

  private readonly plateGeo: RoundedBoxGeometry;
  private readonly standGeo: RoundedBoxGeometry;
  private readonly faceGeo = new THREE.PlaneGeometry(FACE.w, FACE.h);

  constructor() {
    this.group.position.set(LAYOUT.plaque.x, 0.014, LAYOUT.plaque.z);

    this.brushedTex = this.buildBrushed();
    this.metalMat = new THREE.MeshStandardMaterial({
      map: this.brushedTex,
      color: '#c6cdd8',
      metalness: 0.85,
      roughness: 0.34,
      envMapIntensity: 0.6,
    });

    const { emitTex, mapTex } = this.buildFace();
    this.faceMap = mapTex;
    this.emitMap = emitTex;
    this.faceMat = new THREE.MeshStandardMaterial({
      map: this.faceMap,
      emissive: '#ffb45e',
      emissiveIntensity: GLOW,
      emissiveMap: this.emitMap,
      metalness: 0.8,
      roughness: 0.32,
      envMapIntensity: 0.5,
    });

    this.plateGeo = new RoundedBoxGeometry(PLATE.w, PLATE.h, PLATE.t, 3, PLATE.radius);
    this.standGeo = new RoundedBoxGeometry(PLATE.standW, PLATE.standH, PLATE.standD, 3, 0.006);

    const plate = new THREE.Mesh(this.plateGeo, this.metalMat);
    plate.position.y = PLATE.standH + PLATE.h / 2;
    plate.castShadow = true;
    plate.receiveShadow = true;

    const stand = new THREE.Mesh(this.standGeo, this.metalMat);
    stand.position.y = PLATE.standH / 2;
    stand.receiveShadow = true;

    const face = new THREE.Mesh(this.faceGeo, this.faceMat);
    face.position.set(0, PLATE.standH + PLATE.h / 2, PLATE.faceZ);
    face.receiveShadow = true;

    this.assembly.add(plate, stand, face);
    this.assembly.rotation.set(-0.1, -0.31, 0);
    this.group.add(this.assembly);
  }

  dispose(): void {
    this.plateGeo.dispose();
    this.standGeo.dispose();
    this.faceGeo.dispose();
    this.metalMat.dispose();
    this.faceMat.dispose();
    this.brushedTex.dispose();
    this.faceMap.dispose();
    this.emitMap.dispose();
  }

  /* ---------------------------------------------------------------- */

  /** subtle vertical brushed-metal grain */
  private buildBrushed(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#22262e';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.04)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 26, y + 2);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /**
   * Engraved face: brushed metal + thin green accent edge + warm text.
   * `mapTex` is the visible engraving; `emitTex` is an alpha/white mask used
   * as the emissive map so ONLY the lettering (and a whisper of the edge)
   * glows, tinted by the warm emissive colour.
   */
  private buildFace(): { mapTex: THREE.CanvasTexture; emitTex: THREE.CanvasTexture } {
    const W = 512;
    const H = Math.round((W * FACE.h) / FACE.w);
    const border = Math.round(W * 0.024);
    const radius = Math.round(W * 0.032);

    const map = document.createElement('canvas');
    map.width = W;
    map.height = H;
    const g = map.getContext('2d')!;

    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#272d38');
    grad.addColorStop(0.5, '#1d222b');
    grad.addColorStop(1, '#171b23');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    for (let i = 0; i < 90; i++) {
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.05)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(Math.random() * W, Math.random() * H);
      g.lineTo(Math.random() * W, Math.random() * H);
      g.stroke();
    }

    this.stackInset(g, W, H, border, radius, 'rgba(62, 207, 142, 0.25)');
    this.stackInset(g, W - border * 2, H - border * 2, border * 0.5, radius * 0.6, 'rgba(62, 207, 142, 0.85)');

    this.drawCopy(g, true);

    const emit = document.createElement('canvas');
    emit.width = W;
    emit.height = H;
    const e = emit.getContext('2d')!;
    this.roundedRect(e, border, border, W - border * 2, H - border * 2, radius);
    e.strokeStyle = 'rgba(255,255,255,0.22)';
    e.lineWidth = Math.round(W * 0.006);
    e.stroke();
    this.drawCopy(e, false);

    const mapTex = new THREE.CanvasTexture(map);
    mapTex.colorSpace = THREE.SRGBColorSpace;
    mapTex.anisotropy = 4;
    const emitTex = new THREE.CanvasTexture(emit);
    emitTex.colorSpace = THREE.SRGBColorSpace;
    return { mapTex, emitTex };
  }

  private stackInset(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    inset: number,
    radius: number,
    stroke: string,
  ): void {
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = w * 0.012;
    g.shadowOffsetY = w * 0.006;
    this.roundedRect(g, inset / 2, inset / 2, w - inset, h - inset, radius);
    g.strokeStyle = stroke;
    g.lineWidth = Math.max(2, Math.round(w * 0.006));
    g.stroke();
    g.restore();
  }

  private drawCopy(g: CanvasRenderingContext2D, engraved: boolean): void {
    const W = g.canvas.width;
    const H = g.canvas.height;
    const cx = W / 2;
    const mainY = H * 0.5;

    g.font = `800 ${Math.round(W * 0.075)}px ${MONO_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (engraved) {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillText('BUILT BY ALLAN', cx, mainY + Math.round(W * 0.006));
      g.fillStyle = '#171b21';
    } else {
      g.fillStyle = '#ffffff';
    }
    g.fillText('BUILT BY ALLAN', cx, mainY);
  }

  private roundedRect(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
}