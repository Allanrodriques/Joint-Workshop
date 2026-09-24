import * as THREE from 'three';
import { PAPER, PAPER_R, TABLE, clamp01 } from './timeline';
import { easeOutCubic, lerp, smoothstep } from '../utils/math';
import { fiberTexture, gradientTexture, radialTexture, woodTexture } from '../utils/textures';

const WIN = 0.22;

function radialShadowTexture(): THREE.Texture {
  return radialTexture('#000000', 0.42);
}

/**
 * The darkened tabletop: a small warm-lit rolling workspace with a tray, a
 * lighter, dust motes and the rolling paper that wraps into the finished roll.
 */
export class IntroScene {
  readonly scene = new THREE.Scene();

  private readonly reduced: boolean;
  private readonly shadows: boolean;

  // Reveal lighting
  private readonly hemi: THREE.HemisphereLight;
  private readonly spot: THREE.SpotLight;
  private readonly rim: THREE.DirectionalLight;
  private readonly centerGlow: THREE.Sprite;
  private readonly lightPool: THREE.Mesh;

  // Props
  private readonly tableTop: THREE.Mesh;
  private readonly tableBody: THREE.Mesh;
  private lighterCap!: THREE.MeshStandardMaterial;
  private glint = 0;

  // Rolling paper (deforming plane)
  private readonly paperGroup = new THREE.Group();
  private readonly paperMesh: THREE.Mesh;
  private readonly paperGeo: THREE.BufferGeometry;
  private readonly paperMat: THREE.MeshStandardMaterial;
  private readonly sArr: number[] = [];
  private readonly flatX: number[] = [];
  private readonly flatY: number[] = [];
  private readonly flatZ: number[] = [];

  // Finished-roll tips
  private readonly tipLeft: THREE.Group;
  private readonly tipRight: THREE.Group;
  private readonly emberSprite: THREE.SpriteMaterial;
  private readonly emberLight: THREE.PointLight;
  private readonly contactShadow: THREE.Mesh;
  private readonly shadowMat: THREE.MeshBasicMaterial;
  private readonly flecks: THREE.MeshStandardMaterial;

  // Dust
  private readonly dust: THREE.Points;
  private readonly dustGeo: THREE.BufferGeometry;
  private readonly dustMat: THREE.PointsMaterial;
  private readonly dustPos: Float32Array;

  private emberTarget = 0;
  private ember = 0;
  private time = 0;
  private rollK = 0;
  private floatK = 0;

  private readonly temp = new THREE.Vector3();

  constructor(opts: { reduced: boolean; shadows: boolean }) {
    this.reduced = opts.reduced;
    this.shadows = opts.shadows;

    this.scene.background = gradientTexture('#0d0c12', '#050407');
    this.scene.fog = new THREE.FogExp2('#08070c', 0.055);

    // --- Lights -------------------------------------------------------
    this.hemi = new THREE.HemisphereLight('#39424f', '#080605', 0.32);
    this.scene.add(this.hemi);

    this.spot = new THREE.SpotLight('#ffe2b0', 0, 9, 0.6, 0.8, 1.4);
    this.spot.position.set(0, 3.1, 1.15);
    this.spot.target.position.set(0, 0, 0);
    this.spot.castShadow = this.shadows;
    this.scene.add(this.spot);
    this.scene.add(this.spot.target);

    this.rim = new THREE.DirectionalLight('#8fb0ff', this.shadows ? 0.25 : 0.18);
    this.rim.position.set(-3, 1.8, -2.6);
    this.scene.add(this.rim);

    this.centerGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTexture('#ffb45e', 0.55),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.centerGlow.position.set(0, 0.24, 0);
    this.centerGlow.scale.set(2.1, 1.5, 1);
    this.scene.add(this.centerGlow);

    this.lightPool = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 0.8),
      new THREE.MeshBasicMaterial({
        map: radialTexture('#ffcf8a', 0.55),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.lightPool.rotation.x = -Math.PI / 2;
    this.lightPool.position.set(0, 0.02, 0);
    this.scene.add(this.lightPool);

    // --- Tabletop -----------------------------------------------------
    const topMat = new THREE.MeshStandardMaterial({
      map: woodTexture('#4a3220', '#2a1b10', '#6b4a2b', 1.6),
      color: '#ffffff',
      roughness: 0.9,
    });
    this.tableTop = new THREE.Mesh(new THREE.PlaneGeometry(TABLE.hx * 2, TABLE.hz * 2), topMat);
    this.tableTop.rotation.x = -Math.PI / 2;
    this.tableTop.receiveShadow = this.shadows;
    this.scene.add(this.tableTop);

    const bodyMat = new THREE.MeshStandardMaterial({ color: '#1a1009', roughness: 0.95 });
    this.tableBody = new THREE.Mesh(new THREE.BoxGeometry(TABLE.hx * 2 + 0.1, 0.22, TABLE.hz * 2 + 0.1), bodyMat);
    this.tableBody.position.y = -0.11;
    this.tableBody.castShadow = false;
    this.scene.add(this.tableBody);

    this.buildTray();
    this.buildLighter();

    // --- Rolling paper ------------------------------------------------
    const plane = new THREE.PlaneGeometry(PAPER.LEN, PAPER.W, 8, 44);
    plane.rotateX(-Math.PI / 2);
    this.paperGeo = plane;
    const pos = plane.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const jitter = (Math.random() - 0.5) * 0.006;
      this.sArr.push(z + PAPER.W / 2);
      this.flatX.push(x);
      this.flatY.push(0.012 + jitter * 0.4);
      this.flatZ.push(z + jitter);
    }
    pos.needsUpdate = true;
    this.paperGeo.computeVertexNormals();

    this.paperMat = new THREE.MeshStandardMaterial({
      color: '#f2ecdf',
      roughness: 0.85,
      side: THREE.DoubleSide,
      map: fiberTexture(),
    });
    this.paperMesh = new THREE.Mesh(this.paperGeo, this.paperMat);
    this.paperMesh.castShadow = this.shadows;
    this.paperMesh.receiveShadow = this.shadows;
    this.paperGroup.add(this.paperMesh);

    // Filter / ember tips (hidden until the roll is done).
    const filterMat = new THREE.MeshStandardMaterial({ color: '#dcc093', roughness: 0.8 });
    const tipMat = new THREE.MeshStandardMaterial({ color: '#cfd8b0', roughness: 0.85 });
    this.flecks = new THREE.MeshStandardMaterial({
      color: '#3ecf8e',
      roughness: 0.6,
      emissive: '#1f7a52',
      emissiveIntensity: 0.7,
    });

    this.tipLeft = new THREE.Group();
    const filterCyl = new THREE.CylinderGeometry(PAPER_R * 1.05, PAPER_R * 1.05, 0.32, 20, 1);
    filterCyl.rotateZ(Math.PI / 2);
    const filterMesh = new THREE.Mesh(filterCyl, filterMat);
    filterMesh.position.x = -PAPER.LEN * 0.5 - 0.16 + 0.06;
    const filterCapR = new THREE.Mesh(new THREE.CircleGeometry(PAPER_R * 1.05, 20), filterMat);
    filterCapR.rotation.y = Math.PI / 2;
    filterCapR.position.x = filterMesh.position.x - 0.16;
    const filterCapL = new THREE.Mesh(new THREE.CircleGeometry(PAPER_R * 1.05, 20), filterMat);
    filterCapL.rotation.y = -Math.PI / 2;
    filterCapL.position.x = filterMesh.position.x + 0.16;
    this.tipLeft.add(filterMesh, filterCapR, filterCapL);
    this.tipLeft.visible = false;

    this.tipRight = new THREE.Group();
    const tipCyl = new THREE.CylinderGeometry(PAPER_R * 0.9, PAPER_R * 1.02, 0.14, 20, 1);
    tipCyl.rotateZ(Math.PI / 2);
    const tipMesh = new THREE.Mesh(tipCyl, tipMat);
    tipMesh.position.x = PAPER.LEN * 0.5 - 0.02;
    const fleckGeo = new THREE.OctahedronGeometry(0.05, 0);
    const fleck1 = new THREE.Mesh(fleckGeo, this.flecks);
    fleck1.position.set(PAPER.LEN * 0.5 + 0.05, 0.0, 0.05);
    const fleck2 = new THREE.Mesh(fleckGeo, this.flecks);
    fleck2.position.set(PAPER.LEN * 0.5 + 0.07, 0.02, -0.03);
    this.tipRight.add(tipMesh, fleck1, fleck2);
    this.tipRight.visible = false;

    this.emberSprite = new THREE.SpriteMaterial({
      map: radialTexture('#ff7a2a', 0.55),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const emberMesh = new THREE.Sprite(this.emberSprite);
    emberMesh.position.set(PAPER.LEN * 0.5 + 0.09, 0.02, 0);
    emberMesh.scale.set(0.16, 0.16, 1);
    this.tipRight.add(emberMesh);

    this.emberLight = new THREE.PointLight('#ff7a2a', 0, 2.8, 1.8);
    this.emberLight.position.set(PAPER.LEN * 0.5 + 0.1, 0.05, 0);
    this.tipRight.add(this.emberLight);

    this.paperGroup.add(this.tipLeft, this.tipRight);
    this.scene.add(this.paperGroup);

    // Contact shadow blob beneath the finished roll.
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: radialShadowTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.4), this.shadowMat);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.set(0, 0.013, 0);
    this.scene.add(this.contactShadow);

    // --- Ambient dust --------------------------------------------------
    const dustCount = Math.round(this.shadows ? 120 : 60);
    this.dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      this.dustPos[i * 3] = (Math.random() - 0.5) * 3.2;
      this.dustPos[i * 3 + 1] = 0.1 + Math.random() * 1.6;
      this.dustPos[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
    }
    this.dustGeo = new THREE.BufferGeometry();
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    this.dustMat = new THREE.PointsMaterial({
      map: radialTexture('#ffe3b0', 0.5),
      size: 0.018,
      color: '#cfe0c0',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.dust = new THREE.Points(this.dustGeo, this.dustMat);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  /** 0..1 — how far the warm reveal light has come up. */
  setLight(k: number): void {
    const kk = smoothstep(k);
    this.spot.intensity = 1.6 * kk;
    if (this.spot.castShadow && kk > 0.05) {
      this.spot.intensity = 1.9 * kk;
    }
    this.hemi.intensity = 0.32 + 0.1 * kk;
    (this.centerGlow.material as THREE.SpriteMaterial).opacity = 0.16 * kk;
    (this.lightPool.material as THREE.MeshBasicMaterial).opacity = 0.3 * kk;
    this.dustMat.opacity = 0.16 * kk;
    this.rim.intensity = (this.shadows ? 0.25 : 0.18) * (0.4 + 0.6 * kk);
  }

  /** 0..1 — rolling paper wrap progress. */
  paperRoll(k: number): void {
    this.rollK = k;
    const pos = this.paperGeo.attributes.position as THREE.BufferAttribute;
    const wobT = this.time;
    for (let i = 0; i < pos.count; i++) {
      const s = this.sArr[i];
      const frac = s / PAPER.W;
      const c = smoothstep((k * (1 + WIN) - frac) / WIN);
      // Guard: WIN windowing creates NaN for frac==0 at k==0 (smoothstep of -inf → 0).
      const theta = frac * Math.PI * 2;
      const rad = PAPER_R;
      const yRoll = rad * (1 - Math.cos(theta));
      const zRoll = -PAPER.W / 2 + rad * Math.sin(theta);
      const wobble = Math.sin(this.flatX[i] * 3 + wobT) * 0.0012 * (1 - c);
      pos.setXYZ(
        i,
        this.flatX[i],
        lerp(this.flatY[i], yRoll, c) + wobble,
        lerp(this.flatZ[i], zRoll, c),
      );
    }
    pos.needsUpdate = true;
    this.paperGeo.computeVertexNormals();

    // Shift the group so the wrapped cylinder stays centred on the table.
    this.paperGroup.position.z = lerp(0, PAPER.W / 2, easeOutCubic(k));
  }

  /** 0..1 — lift the finished roll off the table. */
  setFloat(k: number): void {
    this.floatK = k;
  }

  /** 0..1 — ember glow intensity. */
  setEmber(i: number): void {
    this.emberTarget = clamp01(i);
  }

  lighterGlint(): void {
    this.glint = 1;
  }

  /** World-space point the smoke rises from. */
  emberOrigin(out: THREE.Vector3): THREE.Vector3 {
    this.temp.set(PAPER.LEN * 0.5 + 0.05, 0.05, 0);
    return this.paperGroup.localToWorld(this.temp).copy(out);
  }

  /** Where the smoky "JW" signature should sit. */
  signatureCenter(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 1.38, 0.15);
  }

  update(dt: number, time: number): void {
    this.time += dt;

    // Damping toward target light values.
    this.ember = lerp(this.ember, this.emberTarget, 1 - Math.exp(-6 * dt));
    this.emberSprite.opacity = this.ember * (0.8 + 0.2 * Math.sin(time * 8));
    this.emberLight.intensity = 2.6 * this.ember * (0.9 + 0.1 * Math.sin(time * 21));
    this.tipRight.visible = this.rollK >= 0.995;
    this.tipLeft.visible = this.rollK >= 0.995;

    // Float & slow spin once ready.
    if (this.floatK > 0) {
      const baseY = lerp(0.012, 0.33, easeOutCubic(this.floatK));
      this.paperGroup.position.y = this.reduced
        ? baseY
        : baseY + Math.sin(time * 1.3) * 0.012;
      if (!this.reduced) {
        this.paperGroup.rotation.y += dt * 0.22;
        this.paperGroup.rotation.z = Math.sin(time * 0.7) * 0.02;
      }
      this.shadowMat.opacity = 0.34 * (1 - this.floatK * 0.6);
      this.contactShadow.scale.set(1 + this.floatK * 0.3, 1 + this.floatK * 0.3, 1);
      this.contactShadow.position.x = Math.cos(time * 1.3) * 0.02;
      this.contactShadow.position.z = Math.sin(time * 1.3 * 0.7) * 0.02;
    }

    // Lighter glint.
    this.glint *= Math.exp(-5.5 * dt);
    this.lighterCap.emissiveIntensity = this.glint * 1.4;

    // Dust drift.
    const dustPosAttr = this.dustGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.dustPos.length; i += 3) {
      this.dustPos[i] += Math.sin(time * 0.14 + i) * 0.0022 * dt * 60;
      this.dustPos[i + 1] += Math.cos(time * 0.1 + i * 0.7) * 0.0016 * dt * 60;
      this.dustPos[i + 2] += Math.sin(time * 0.12 + i * 1.3) * 0.0018 * dt * 60;
    }
    dustPosAttr.needsUpdate = true;
  }

  private buildTray(): void {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({
      color: '#a97a42',
      metalness: 0.65,
      roughness: 0.32,
    });
    const dark = new THREE.MeshStandardMaterial({ color: '#3a2a18', roughness: 0.6 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.05, 24), metal);
    base.position.y = 0.025;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.012, 8, 28), metal);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.052;
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.315, 24), dark);
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.048;
    group.add(base, rim, inner);
    group.position.set(-0.8, 0, 0.46);
    group.rotation.y = 0.5;
    this.scene.add(group);
  }

  private buildLighter(): void {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: '#23242b',
      roughness: 0.5,
      metalness: 0.35,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.56, 0.16), bodyMat);
    body.position.y = 0.28;
    this.lighterCap = new THREE.MeshStandardMaterial({
      color: '#c8b489',
      metalness: 0.85,
      roughness: 0.25,
    });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16), this.lighterCap);
    cap.position.y = 0.575;
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 0.05, 12),
      this.lighterCap,
    );
    nozzle.position.set(0, 0.62, 0);
    group.add(body, cap, nozzle);
    group.position.set(0.98, 0, -0.4);
    group.rotation.x = -0.28;
    group.rotation.y = -0.55;
    this.scene.add(group);
  }

  dispose(): void {
    this.scene.traverse((obj) => {
      const mat = (obj as THREE.Mesh & { material?: THREE.Material | THREE.Material[] }).material;
      if (mat) {
        if (Array.isArray(mat)) {
          for (const m of mat) m.dispose();
        } else {
          mat.dispose();
        }
      }
      const geo = (obj as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (geo && geo !== this.paperGeo && geo !== this.dustGeo) geo.dispose();
    });
    this.paperGeo.dispose();
    this.dustGeo.dispose();
  }
}