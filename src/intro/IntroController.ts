import * as THREE from 'three';
import '../styles/intro.css';
import { IntroCamera, type IntroCameraKey } from './IntroCamera';
import { IntroScene } from './IntroScene';
import { IntroParticles } from './IntroParticles';
import { IntroSmoke } from './IntroSmoke';
import { T, clamp01, seg } from './timeline';
import { lerp } from '../utils/math';
import type { AudioManager } from '../audio/AudioManager';
import type { Settings } from '../game/GameState';

export interface IntroOptions {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  settings: Settings;
  audio: AudioManager;
  onDone: () => void;
}

export interface IntroAPI {
  readonly ready: boolean;
  readonly progress: number;
  skip(): void;
  dispose(): void;
}

const CAMERA_PATH: IntroCameraKey[] = [
  { t: 0.0, pos: [0, 0.55, 2.2], target: [0, 0.3, 0] },
  { t: 1.5, pos: [0.7, 0.5, 1.55], target: [0, 0.28, 0] },
  { t: 3.0, pos: [1.12, 0.6, 1.0], target: [0, 0.22, 0] },
  { t: 4.5, pos: [1.5, 0.88, 0.68], target: [0, 0.5, 0] },
  { t: 5.6, pos: [1.18, 1.02, 1.12], target: [0, 1.1, 0.1] },
  { t: 6.1, pos: [0.95, 1.28, 1.42], target: [0, 1.38, 0.15] },
  { t: 7.7, pos: [0.3, 1.35, 1.9], target: [0, 1.34, 0.25] },
];

const PHASES: Array<{ until: number; label: string }> = [
  { until: T.LIGHT_START, label: 'INITIALIZING WORKSHOP' },
  { until: T.SWIRL_START, label: 'LIGHTING' },
  { until: T.ROLL_START, label: 'GATHERING' },
  { until: T.ROLL_END, label: 'ROLLING' },
  { until: T.SMOKE_START, label: 'PACKING' },
  { until: T.SIG_END, label: 'SEALING' },
  { until: T.DONE, label: 'SIGNING' },
];

/**
 * Cinematic intro. Runs its own scene through the main renderer before the
 * game loop starts; on completion it fades to black, fires `onDone` (so the
 * Game can `boot()`), then fades through to the game scene and disposes.
 */
export class IntroController implements IntroAPI {
  private readonly opts: IntroOptions;
  private readonly reduced: boolean;
  private readonly scene: IntroScene;
  private readonly camera: IntroCamera;
  private readonly particles: IntroParticles;
  private readonly smoke: IntroSmoke;

  private readonly root: HTMLElement;
  private readonly veil: HTMLElement;
  private readonly progressWrap: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly phaseEl: HTMLElement;
  private readonly pctEl: HTMLElement;
  private readonly enterBtn: HTMLButtonElement;

  private raf = 0;
  private start = performance.now();
  private last = 0;
  private _progress = 0;
  private _ready = false;
  private booted = false;
  private leaving: 'dim' | 'reveal' | 'gone' | null = null;
  private leaveT = 0;
  private disposed = false;
  private readonly autoSkip: boolean;
  private autoExitQueued = true;

  private sigLaunched = false;
  private burstLaunched = false;
  private rollSfxPlayed = false;
  private smokeSfxPlayed = false;
  private readySfxPlayed = false;
  private nextFlyBy = 1.6;
  private lastLabel = '';
  private lastPct = -1;
  private lastAria = -1;

  private readonly mouseNdc = new THREE.Vector2(0, 0);
  private readonly tmpVec = new THREE.Vector3();

  constructor(opts: IntroOptions) {
    this.opts = opts;
    const osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.reduced = opts.settings.motion === 'reduced' || osReduced;
    this.autoSkip = opts.settings.skipIntro;
    this.scene = new IntroScene({ reduced: this.reduced, shadows: opts.settings.graphics !== 'low' });
    this.camera = new IntroCamera(this.aspect(), this.reduced);
    this.camera.setPath(CAMERA_PATH);
    this.camera.camera.position.set(...CAMERA_PATH[0].pos);
    this.camera.camera.lookAt(0, 0.3, 0);

    const particles = this.reduced ? 130 : opts.settings.graphics === 'high' ? 230 : 150;
    this.particles = new IntroParticles(particles, this.reduced);
    const smokeN = this.reduced ? 90 : opts.settings.graphics === 'high' ? 180 : 120;
    this.smoke = new IntroSmoke(smokeN, this.reduced, () => this.scene.emberOrigin(this.tmpVec));

    this.scene.scene.add(this.camera.camera);
    this.scene.scene.add(this.particles.group);
    this.scene.scene.add(this.smoke.group);

    this.root = document.getElementById('intro') as HTMLElement;
    this.veil = document.getElementById('intro-veil') as HTMLElement;
    this.progressWrap = document.getElementById('intro-progress') as HTMLElement;
    this.bar = document.getElementById('intro-progress-bar') as HTMLElement;
    this.phaseEl = document.getElementById('intro-phase') as HTMLElement;
    this.pctEl = document.getElementById('intro-pct') as HTMLElement;
    this.enterBtn = document.getElementById('intro-enter') as HTMLButtonElement;

    this.bind();
    this.last = this.start;
    this.loop(this.start);
  }

  get ready(): boolean {
    return this._ready;
  }

  get progress(): number {
    return this._progress;
  }

  /** QA surface: immediately conclude the intro. */
  skip(): void {
    if (this.booted || this.disposed) return;
    this.opts.audio.unlock();
    this.startExit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.root.remove();
    this.scene.scene.remove(this.camera.camera, this.particles.group, this.smoke.group);
    this.scene.dispose();
    this.particles.dispose();
    this.smoke.dispose();
    this.camera.dispose();
    this.unbind();
  }

  private aspect(): number {
    const dom = this.opts.renderer.domElement;
    return Math.max(0.0001, dom.clientWidth / Math.max(1, dom.clientHeight));
  }

  private bind(): void {
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.onResize);
    if (this.enterBtn) this.enterBtn.addEventListener('click', this.onEnter);
  }

  private unbind(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    if (this.enterBtn) this.enterBtn.removeEventListener('click', this.onEnter);
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    const dom = this.opts.renderer.domElement;
    const w = Math.max(1, dom.clientWidth);
    const h = Math.max(1, dom.clientHeight);
    this.mouseNdc.set((e.clientX / w) * 2 - 1, -((e.clientY / h) * 2 - 1));
    this.camera.setMouse(this.mouseNdc.x, this.mouseNdc.y);
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.leaving) return;
    this.opts.audio.unlock();
    if (this.ready) {
      this.startExit();
      return;
    }
    const dom = this.opts.renderer.domElement;
    const w = Math.max(1, dom.clientWidth);
    const h = Math.max(1, dom.clientHeight);
    const ndc = new THREE.Vector2((e.clientX / w) * 2 - 1, -((e.clientY / h) * 2 - 1));
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera.camera);
    const hit = ray.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      new THREE.Vector3(),
    );
    if (hit) this.particles.disturb(hit, 1.5);
    this.smoke.nudge();
  };

  private readonly onEnter = (): void => {
    if (!this.ready || this.leaving) return;
    this.opts.audio.click();
    this.startExit();
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.leaving) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.startExit();
    } else if (this.ready && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.startExit();
    }
  };

  private readonly onResize = (): void => {
    this.camera.resize(this.aspect());
  };

  private startExit(): void {
    if (this.leaving) return;
    this.leaving = 'dim';
    this.leaveT = 0;
    try {
      this.opts.audio.unlock();
      this.opts.audio.whoosh();
    } catch {
      /* no-op */
    }
    this.root.classList.add('intro-leaving');
    this.smoke.clearSignature();
  }

  private loop = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0.0001, (now - this.last) / 1000));
    this.last = now;

    if (this.leaving === 'dim') {
      this.leaveT = Math.min(1, this.leaveT + dt / 0.42);
      this.veil.style.opacity = String(this.leaveT);
      if (this.leaveT >= 1) {
        if (!this.booted) {
          this.booted = true;
          this.opts.onDone();
        }
        this.leaving = 'reveal';
        this.leaveT = 0;
      }
      this.updateScene(dt, Math.min(T.READY, (now - this.start) / 1000));
    } else if (this.leaving === 'reveal') {
      this.leaveT = Math.min(1, this.leaveT + dt / 0.55);
      this.veil.style.opacity = String(1 - this.leaveT);
      this.updateScene(dt, T.READY);
      if (this.leaveT >= 1) {
        this.leaving = 'gone';
        this.dispose();
        return;
      }
    } else {
      const time = (now - this.start) / 1000;
      this.updateScene(dt, time);
      this.tick(time);
    }
    this.render();
  };

  private updateScene(dt: number, time: number): void {
    const cam = this.camera.camera;
    this.camera.update(time);
    this.scene.update(dt, time);

    const light = seg(time, T.LIGHT_START, T.LIGHT_FULL);
    this.scene.setLight(light);
    const roll = seg(time, T.ROLL_START, T.ROLL_END);
    this.scene.paperRoll(roll);
    const float = seg(time, T.FLOAT_START, T.FLOAT_FULL);
    this.scene.setFloat(float);
    const ember = clamp01((roll - 0.88) / 0.12) + (this.burstLaunched ? 0.25 : 0);
    this.scene.setEmber(clamp01(ember));

    this.particles.update(dt, time);
    this.smoke.update(dt, cam);
  }

  private tick(time: number): void {
    if (!this.sigLaunched && time >= T.SIG_START) {
      this.sigLaunched = true;
      this.smoke.beginSignature(this.scene.signatureCenter(this.tmpVec));
    }
    if (!this.burstLaunched && time >= T.BURST) {
      this.burstLaunched = true;
      this.opts.audio.pop();
      this.scene.lighterGlint();
      const c = this.scene.signatureCenter(this.tmpVec);
      this.particles.disturb(c, 5.5);
      for (let i = 0; i < 4; i++) this.smoke.nudge();
    }
    if (!this.rollSfxPlayed && time >= T.ROLL_START) {
      this.rollSfxPlayed = true;
      this.opts.audio.paper();
    }
    if (!this.smokeSfxPlayed && time >= T.SMOKE_START) {
      this.smokeSfxPlayed = true;
      this.opts.audio.whoosh();
    }
    if (!this.readySfxPlayed && time >= T.READY) {
      this.readySfxPlayed = true;
      this.opts.audio.chime();
    }

    if (!this.reduced && time > this.nextFlyBy && time < T.SIG_START) {
      this.particles.flyBy(this.camera.camera.position);
      this.nextFlyBy = time + lerp(1.4, 2.6, Math.random());
    }

if (time >= T.READY && !this._ready) {
      this._ready = true;
      this.enterBtn?.removeAttribute('disabled');
      this.enterBtn?.classList.add('is-ready');
      this.root.setAttribute('aria-hidden', 'false');
      if (this.autoSkip && this.autoExitQueued) {
        this.autoExitQueued = false;
        this.startExit();
        return;
      }
    }

    this._progress = this.computeProgress(time);
    this.syncDom(time);
  }

  private computeProgress(time: number): number {
    if (time >= T.READY) return 1;
    const eASES: Array<[number, number, number, number]> = [
      [0, T.LIGHT_START, 0.02, 0.06],
      [T.LIGHT_START, T.TITLE_IN, 0.06, 0.14],
      [T.TITLE_IN, T.SWIRL_START, 0.14, 0.28],
      [T.SWIRL_START, T.SWIRL_SETTLE, 0.28, 0.46],
      [T.SWIRL_SETTLE, T.ROLL_START, 0.46, 0.62],
      [T.ROLL_START, T.ROLL_END, 0.62, 0.82],
      [T.ROLL_END, T.SMOKE_START, 0.82, 0.9],
      [T.SMOKE_START, T.SIG_START, 0.9, 0.95],
      [T.SIG_START, T.BURST, 0.95, 0.99],
      [T.BURST, T.READY, 0.99, 1],
    ];
    for (const [a, b, lo, hi] of eASES) {
      if (time >= a && time < b) return lerp(lo, hi, seg(time, a, b));
    }
    return 1;
  }

  private syncDom(time: number): void {
    let label = 'READY';
    for (const p of PHASES) {
      if (time < p.until) {
        label = p.label;
        break;
      }
    }
    const pct = Math.round(this._progress * 100);
    if (label !== this.lastLabel) {
      this.lastLabel = label;
      this.phaseEl.textContent = label;
    }
    if (pct !== this.lastPct) {
      this.lastPct = pct;
      this.bar.style.width = `${pct}%`;
      this.pctEl.textContent = `${pct}%`;
    }
    if (pct !== this.lastAria) {
      this.lastAria = pct;
      this.progressWrap.setAttribute('aria-valuenow', String(pct));
    }
  }

  private render(): void {
    this.opts.renderer.render(this.scene.scene, this.camera.camera);
  }
}

declare global {
  interface Window {
    __jointIntro?: IntroAPI;
  }
}