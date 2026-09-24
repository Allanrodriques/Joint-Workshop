import * as THREE from 'three';
import { SceneManager } from '../scene/SceneManager';
import { CameraController } from '../scene/CameraController';
import { createLighting, type Lighting } from '../scene/Lighting';
import { createEnvironment, type Environment } from '../scene/Environment';
import { World } from '../objects/World';
import { InteractionManager } from '../interaction/InteractionManager';
import { createHUD } from '../ui/HUD';
import { createProgress } from '../ui/Progress';
import { createSettingsPanel } from '../ui/Settings';
import { createLabels } from '../ui/Labels';
import { AudioManager } from '../audio/AudioManager';
import { createStages } from '../stages';
import { Tweens } from '../utils/tween';
import { disposeTextureCache } from '../utils/textures';
import {
  allUnlockedChips,
  loadHistory,
  loadMeta,
  pushSession,
  saveMeta,
  unlockBy,
} from './History';
import type { AchievementCtx, AchievementDef } from './History';
import {
  AMOUNTS,
  CAMERA_VIEWS,
  CHOICES_STORE_KEY,
  DEFAULT_CHOICES,
  HELP,
  PAPERS,
  STAGE_ORDER,
  STRAINS,
  THEMES,
  defaultSettings,
} from './constants';
import type {
  AmountId,
  ChoiceKind,
  Choices,
  FinalStats,
  GameAPI,
  GraphicsLevel,
  HintSpec,
  LabelDef,
  PaperId,
  Settings as GameSettings,
  SettingsPanel,
  SessionRecord,
  Stage,
  StageId,
  Stats,
  StrainId,
  ToastTone,
} from './GameState';

const STORE_KEY = 'joint-workshop.settings.v1';

export class Game implements GameAPI {
  readonly sceneMx: SceneManager;
  readonly world: World;
  readonly hud: ReturnType<typeof createHUD>;
  readonly progress: ReturnType<typeof createProgress>;
  readonly labels: ReturnType<typeof createLabels>;
  readonly settings: GameSettings;
  readonly stats: Stats;
  readonly choices: Choices;
  readonly audio = new AudioManager();
  readonly cameraRig: CameraController;
  readonly interaction: InteractionManager;
  readonly tweens = new Tweens();

  private readonly lighting: Lighting;
  private readonly environment: Environment;
  private readonly settingsPanel: SettingsPanel;
  private readonly stages: { [K in StageId]: Stage };
  private current: Stage;
  private raf = 0;
  private lastTime = 0;
  private running = false;
  private manualGraphics = false;
  private fpsAvg = 60;
  private lowFpsTime = 0;
  private disposed = false;
  private chain = 0;
  private sessionRecorded = false;
  private readonly cleanup: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.settings = this.loadSettings();
    this.choices = this.loadChoices();
    this.sceneMx = new SceneManager(canvas, this.settings.graphics);
    this.cameraRig = new CameraController(this.sceneMx.camera, canvas, {
      reducedMotion: () => this.settings.motion === 'reduced',
    });
    this.lighting = createLighting(this.sceneMx.scene);
    this.environment = createEnvironment(this.sceneMx.scene, this.sceneMx.renderer);
    this.world = new World(this.sceneMx.scene);
    this.world.setQuality(this.settings.graphics);
    this.world.build();
    this.applyChoicesNow();

    this.interaction = new InteractionManager({
      camera: this.sceneMx.camera,
      scene: this.sceneMx.scene,
      domElement: canvas,
      controls: this.cameraRig.controls,
      onTrack: (id: string) => this.track(id),
      reducedMotion: () => this.settings.motion === 'reduced',
    });

    const labelsRoot = document.getElementById('labels');
    this.labels = createLabels(labelsRoot ?? document.body);
    this.progress = createProgress();
    this.hud = createHUD({
      onSoundToggle: () => this.toggleSound(),
      onSelectChoice: (kind, value) => this.selectChoice(kind, value),
    });
    this.settingsPanel = createSettingsPanel(
      () => this.settings,
      (patch) => this.patchSettings(patch),
    );

    this.stages = createStages();
    this.current = this.stages.INTRO;

    this.stats = {
      startedAt: 0,
      finishedAt: 0,
      interactions: new Set<string>(),
      rollCompletion: 0,
    };

    this.applySettingsNow(true);
    this.bindGlobalEvents();
    this.resize();
  }

  /* ---------------------------------------------------------------- */
  /* Boot / loop                                                      */
  /* ---------------------------------------------------------------- */

  boot(): void {
    this.cameraRig.setImmediate(
      new THREE.Vector3(...CAMERA_VIEWS.INTRO.pos),
      new THREE.Vector3(...CAMERA_VIEWS.INTRO.target),
    );
    this.cameraRig.setLimits(1.5, 14, false);
    this.hud.showIntro(() => this.startRun());
    this.hud.setHelpBody(HELP.INTRO ?? '');
    this.progress.setStage('INTRO');
    this.current.enter(this);
    this.start();
  }

  private startRun(): void {
    this.audio.unlock();
    this.audio.setAmbient(this.settings.sound);
    this.chain = 1;
    this.sessionRecorded = false;
    this.stats.startedAt = performance.now();
    this.stats.finishedAt = 0;
    this.stats.interactions.clear();
    this.stats.rollCompletion = 0;
    this.hud.hideIntro();
    this.hud.hideFinal();
    this.go('PREPARE');
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now: number) => {
      if (!this.running || this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0.0001, (now - this.lastTime) / 1000));
      this.lastTime = now;
      this.frame(dt, now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private pause(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame(dt: number, _now: number): void {
    this.fpsAvg += (1 / dt - this.fpsAvg) * 0.05;
    this.checkAutoQuality(dt);

    this.tweens.update(dt);
    this.current.update(dt, this);
    this.world.update(dt, this.sceneMx.camera);
    this.hud.setEmberGlow(this.world.joint.litLevel);
    this.interaction.update(dt);
    this.cameraRig.update(dt);
    this.labels.update(
      this.sceneMx.camera,
      this.sceneMx.renderer.domElement.clientWidth,
      this.sceneMx.renderer.domElement.clientHeight,
    );
    this.sceneMx.render();
  }

  /* ---------------------------------------------------------------- */
  /* GameAPI                                                          */
  /* ---------------------------------------------------------------- */

  /** Current stage id (debug/QA surface). */
  get stage(): StageId {
    return this.current.id;
  }

  /** Project a world position to CSS-pixel coordinates (debug/QA surface). */
  project(world: THREE.Vector3): { x: number; y: number; z: number } | null {
    const v = world.clone().project(this.sceneMx.camera);
    if (v.z > 1) return null;
    const w = this.sceneMx.renderer.domElement.clientWidth;
    const h = this.sceneMx.renderer.domElement.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, z: v.z };
  }

  get scene(): THREE.Scene {
    return this.sceneMx.scene;
  }

  get camera(): THREE.PerspectiveCamera {
    return this.sceneMx.camera;
  }

  /** QA drone: live drag targets, projected to screen px. */
  debugTargets(): Array<{ id: string; mode: string; enabled: boolean; x: number; y: number; planeY: number | null; world: { x: number; y: number; z: number } }> {
    const vec = new THREE.Vector3();
    const out: Array<{ id: string; mode: string; enabled: boolean; x: number; y: number; planeY: number | null; world: { x: number; y: number; z: number } }> = [];
    for (const t of this.interaction.targetsLive) {
      if (!t.enabled) continue;
      t.root.getWorldPosition(vec);
      const p = this.project(vec);
      if (p) {
        const dy = t.dragY;
        const planeY = typeof dy === 'number' ? dy : dy ? dy() : null;
        out.push({
          id: t.id,
          mode: t.mode,
          enabled: true,
          x: p.x,
          y: p.y,
          planeY,
          world: { x: vec.x, y: vec.y, z: vec.z },
        });
      }
    }
    return out;
  }

  /** QA drone: project an explicit world triple to CSS px. */
  screenFromWorld(x: number, y: number, z: number): { x: number; y: number } | null {
    const p = this.project(new THREE.Vector3(x, y, z));
    return p ? { x: p.x, y: p.y } : null;
  }

  /** QA drone: live snap zones, projected via snapTo (interior point) to screen px. */
  debugZones(): Array<{ id: string; x: number; y: number }> {
    const probe = new THREE.Vector3(0, 0.1, 0);
    const out: Array<{ id: string; x: number; y: number }> = [];
    for (const z of this.interaction.zonesLive) {
      if (z.enabled === false) continue;
      const p = z.snapTo(probe);
      const onScreen = this.project(p);
      if (onScreen) out.push({ id: z.id, x: onScreen.x, y: onScreen.y });
    }
    return out;
  }

  /** QA drone: screen pixel whose ray onto plane at planeY lands inside zone, else null. */
  debugZoneTarget(
    zoneId: string,
    planeY: number,
    offset?: { x: number; y: number; z: number },
  ): { x: number; y: number } | null {
    const zone = this.interaction.zonesLive.find((z) => z.id === zoneId);
    if (!zone || zone.enabled === false) return null;
    const raycaster = new THREE.Raycaster();
    const cam = this.sceneMx.camera;
    const w = this.sceneMx.renderer.domElement.clientWidth;
    const h = this.sceneMx.renderer.domElement.clientHeight;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const hit = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    const ox = offset?.x ?? 0;
    const oz = offset?.z ?? 0;
    let best: { x: number; y: number } | null = null;
    const step = Math.max(6, Math.min(24, Math.min(w, h) / 40));
    const seed = this.project(new THREE.Vector3(0, planeY, 0));
    const cx = seed ? seed.x : w / 2;
    const cy = seed ? seed.y : h / 2;
    const tryPx = (px: number, py: number): boolean => {
      ndc.set((px / w) * 2 - 1, -((py / h) * 2 - 1));
      raycaster.setFromCamera(ndc, cam);
      if (!raycaster.ray.intersectPlane(plane, hit)) return false;
      hit.x += ox;
      hit.z += oz;
      if (!zone.contains(hit)) return false;
      best = { x: px, y: py };
      return true;
    };
    // Full-canvas scan: seed at the world-origin projection, then spiral outward
    // far enough to cover every on-screen pixel (camera may be rotated arbitrarily).
    const maxR = Math.ceil(Math.max(w, h) / step);
    for (let r = 0; r <= maxR && !best; r++) {
      for (let gy = -r; gy <= r && !best; gy++) {
        for (let gx = -r; gx <= r && !best; gx++) {
          if (Math.abs(gx) !== r && Math.abs(gy) !== r) continue;
          if (tryPx(cx + gx * step, cy + gy * step)) break;
        }
      }
    }
    return best;
  }

  /** QA drone: project a named world object to CSS px. */
  debugAnchor(name: string): { x: number; y: number } | null {
    const vec = new THREE.Vector3();
    const obj =
      name === 'tray'
        ? this.world.tray.group
        : name === 'paper'
          ? this.world.paper.group
          : name === 'filter'
            ? this.world.filter.group
            : name === 'joint'
              ? this.world.joint.group
              : name === 'bud'
                ? this.world.bud.group
                : null;
    if (!obj) return null;
    obj.getWorldPosition(vec);
    const p = this.project(vec);
    return p ? { x: p.x, y: p.y } : null;
  }

  /** QA drone: live drag state (target, drop point, zone membership). */
  debugDrag() {
    return this.interaction.debugDrag();
  }

  /** QA drone: current ARRANGE state machine (drives placement acceptance). */
  debugArrangement(): { piecesPlaced: number; totalPieces: number; filterPlaced: boolean; completed: boolean; progress: number; placedIds: string[] } | null {
    const s = this.stages['ARRANGE'] as { debug?: { piecesPlaced: number; totalPieces: number; filterPlaced: boolean; completed: boolean; progress: number; placedIds: string[] } } | undefined;
    return s?.debug ?? null;
  }

  go(id: StageId): void {
    if (this.current.id === id) return;
    this.current.exit(this);
    const next = this.stages[id];
    this.progress.setStage(id);
    this.cameraRig.moveTo(
      new THREE.Vector3(...CAMERA_VIEWS[id].pos),
      new THREE.Vector3(...CAMERA_VIEWS[id].target),
    );
    this.cameraRig.setLimits(
      id === 'FREE_ROAM' ? 1.2 : 1.5,
      id === 'FREE_ROAM' ? 16 : 14,
      id === 'FREE_ROAM',
    );
    this.current = next;
    next.enter(this);
    this.hud.setHelpBody(HELP[id] ?? '');

    if (id === 'FINAL') {
      if (this.stats.finishedAt === 0) this.stats.finishedAt = performance.now();
      this.showFinalPanel();
    } else {
      this.hud.hideFinal();
    }
    if (id === 'FREE_ROAM') {
      this.hud.hideFinal();
      this.onEnterFreeRoam();
    }
  }

  next(): void {
    const i = STAGE_ORDER.indexOf(this.current.id);
    const target = STAGE_ORDER[Math.min(Math.max(i + 1, 0), STAGE_ORDER.length - 1)];
    if (target !== this.current.id) this.go(target);
  }

  stageComplete(message: string, continueLabel = 'CONTINUE'): void {
    this.toast(message, 'good');
    this.hud.showContinue(continueLabel, () => {
      this.hud.hideContinue();
      this.next();
    });
  }

  toast(text: string, tone: ToastTone = 'neutral'): void {
    this.hud.toast(text, tone);
  }

  setHint(h: HintSpec | null): void {
    this.hud.setHint(h);
  }

  setLabels(defs: LabelDef[]): void {
    this.labels.set(defs);
  }

  track(id: string): void {
    this.stats.interactions.add(id);
  }

  shake(amount: number): void {
    if (this.settings.motion === 'reduced') return;
    this.cameraRig.addShake(amount);
  }

  reducedMotion(): boolean {
    return this.settings.motion === 'reduced';
  }

  quality(): GraphicsLevel {
    return this.settings.graphics;
  }

  applySettings(): void {
    this.applySettingsNow();
  }

  /* ---------------------------------------------------------------- */
  /* Roll recipe (strain / paper / fill)                              */
  /* ---------------------------------------------------------------- */

  setChoices(patch: Partial<Choices>): void {
    if (patch.strain && !STRAINS.some((s) => s.id === patch.strain)) return;
    if (patch.paper && !PAPERS.some((p) => p.id === patch.paper)) return;
    if (patch.amount && !AMOUNTS.some((a) => a.id === patch.amount)) return;
    Object.assign(this.choices, patch);
    this.saveChoices();
    this.applyChoicesNow();

    const label = patch.strain
      ? STRAINS.find((s) => s.id === patch.strain)?.name
      : patch.paper
        ? PAPERS.find((p) => p.id === patch.paper)?.name
        : patch.amount
          ? AMOUNTS.find((a) => a.id === patch.amount)?.name
          : undefined;
    if (label) {
      this.audio.click();
      this.toast(label, 'amber');
    }
  }

  private selectChoice(kind: ChoiceKind, value: string): void {
    const patch: Partial<Choices> = {};
    if (kind === 'strain') patch.strain = value as StrainId;
    else if (kind === 'paper') patch.paper = value as PaperId;
    else if (kind === 'amount') patch.amount = value as AmountId;
    this.setChoices(patch);
  }

  private loadChoices(): Choices {
    const base: Choices = { ...DEFAULT_CHOICES };
    try {
      const raw = localStorage.getItem(CHOICES_STORE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw) as Partial<Choices>;
      if (parsed.strain && STRAINS.some((s) => s.id === parsed.strain)) base.strain = parsed.strain;
      if (parsed.paper && PAPERS.some((p) => p.id === parsed.paper)) base.paper = parsed.paper;
      if (parsed.amount && AMOUNTS.some((a) => a.id === parsed.amount)) base.amount = parsed.amount;
    } catch {
      /* storage unavailable */
    }
    return base;
  }

  private saveChoices(): void {
    try {
      localStorage.setItem(CHOICES_STORE_KEY, JSON.stringify(this.choices));
    } catch {
      /* storage unavailable */
    }
  }

  private applyChoicesNow(): void {
    const strain = STRAINS.find((s) => s.id === this.choices.strain);
    if (strain) this.world.bud.applyStrain(strain);
    const paper = PAPERS.find((p) => p.id === this.choices.paper) ?? PAPERS[1];
    this.world.paper.setPaper(paper);
    this.world.joint.applyPaper(paper);
  }

  /* ---------------------------------------------------------------- */
  /* Settings / theme                                                 */
  /* ---------------------------------------------------------------- */

  private loadSettings(): GameSettings {
    const base = defaultSettings();
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return {
        graphics: parsed.graphics ?? base.graphics,
        motion: parsed.motion ?? base.motion,
        sound: parsed.sound ?? base.sound,
        themeIndex: Math.min(THEMES.length - 1, Math.max(0, parsed.themeIndex ?? 0)),
        skipIntro: parsed.skipIntro ?? base.skipIntro,
        music: parsed.music ?? base.music,
      };
    } catch {
      return base;
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage unavailable */
    }
  }

  private patchSettings(patch: Partial<GameSettings>): void {
    if (patch.graphics) this.manualGraphics = true;
    Object.assign(this.settings, patch);
    this.saveSettings();
    this.applySettingsNow();
  }

  private applySettingsNow(initial = false): void {
    const root = document.getElementById('app') ?? document.documentElement;
    root.setAttribute('data-motion', this.settings.motion);
    document.documentElement.setAttribute('data-motion', this.settings.motion);

    this.sceneMx.setQuality(this.settings.graphics);
    this.lighting.setQuality(this.settings.graphics);
    this.environment.setQuality(this.settings.graphics);
    this.world.setQuality(this.settings.graphics);

    const theme = THEMES[this.settings.themeIndex];
    this.sceneMx.setThemeColors(theme.bg, theme.fog);
    this.environment.setTheme(theme);
    this.world.applyTheme(theme);
    document.documentElement.style.setProperty('--accent', theme.accent);
    document.documentElement.style.setProperty('--brown', theme.deskLight);

    this.audio.setEnabled(this.settings.sound);
    this.audio.setMusic(this.settings.music);
    this.hud.setSoundIcon(this.settings.sound);
    if (!this.settings.sound) this.audio.setAmbient(false);
    else if (this.stats.startedAt > 0) this.audio.setAmbient(true);

    this.resize();
    if (!initial) this.settingsPanel.sync();
  }

  private toggleSound(): void {
    this.patchSettings({ sound: !this.settings.sound });
    this.audio.click();
  }

  cycleTheme(): void {
    const next = (this.settings.themeIndex + 1) % THEMES.length;
    this.patchSettings({ themeIndex: next });
    this.toast(`Scene: ${THEMES[next].name}`, 'amber');
  }

  /* ---------------------------------------------------------------- */
  /* Final / replay / free roam                                       */
  /* ---------------------------------------------------------------- */

  private showFinalPanel(): void {
    const stats = this.computeStats();
    let history = loadHistory();

    if (!this.sessionRecorded) {
      this.sessionRecorded = true;
      const ms = Math.max(
        0,
        (this.stats.finishedAt || performance.now()) - (this.stats.startedAt || 0),
      );
      const seconds = Math.round(ms / 1000);
      const record: SessionRecord = {
        at: Date.now(),
        seconds,
        timeLabel: stats.timeLabel,
        objects: stats.objects,
        roll: stats.roll,
        style: stats.style,
        styleLabel: stats.styleLabel,
        strain: this.choices.strain,
        paper: this.choices.paper,
        amount: this.choices.amount,
        chain: this.chain,
      };
      history = pushSession(record);
      const fresh = unlockBy({
        ...this.baseAchievementCtx(stats),
        sessions: history.length,
        strains: new Set(history.map((r) => r.strain)),
        combos: new Set(history.map((r) => `${r.strain}|${r.paper}|${r.amount}`)).size,
        chains: history.map((r) => r.chain),
      });
      this.toastFresh(fresh);
    } else {
      const fresh = unlockBy(this.baseAchievementCtx(stats));
      this.toastFresh(fresh);
    }

    this.hud.showFinal(stats, {
      onReplay: () => this.replay(),
      onScene: () => this.cycleTheme(),
      onFreeRoam: () => this.go('FREE_ROAM'),
      onNextJoint: () => this.nextJoint(),
      onSandbox: () => this.go('SANDBOX'),
      onPhoto: () => this.enterPhotoMode(),
    });
    this.hud.setFinalExtras(history, allUnlockedChips());
  }

  private baseAchievementCtx(stats?: FinalStats): AchievementCtx {
    const history = loadHistory();
    const meta = loadMeta();
    return {
      sessions: history.length,
      bestRoll: history.reduce((m, r) => Math.max(m, r.roll), 0),
      fastest: history.reduce((m, r) => (m === 0 ? r.seconds : Math.min(m, r.seconds)), 0),
      objects: stats?.objects ?? this.stats.interactions.size,
      style: stats?.style ?? 0,
      strains: new Set<string>(),
      combos: 0,
      chains: [],
      freeRoam: meta.freeRoam > 0,
      photos: meta.photos,
    };
  }

  private toastFresh(fresh: AchievementDef[]): void {
    for (const d of fresh) this.toast(`Unlocked: ${d.name}`, 'good');
  }

  private onEnterFreeRoam(): void {
    const meta = loadMeta();
    meta.freeRoam += 1;
    saveMeta(meta);
    const fresh = unlockBy(this.baseAchievementCtx());
    this.toastFresh(fresh);
  }

  /** Full-screen photo capture overlay. */
  enterPhotoMode(): void {
    this.hud.setPhotoMode(true, {
      onCapture: () => this.capturePhoto(),
      onExit: () => this.exitPhotoMode(),
    });
  }

  exitPhotoMode(): void {
    this.hud.setPhotoMode(false, null);
  }

  private capturePhoto(): void {
    try {
      this.sceneMx.render();
      const canvas = this.sceneMx.renderer.domElement;
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.download = `joint-workshop-${Date.now()}.png`;
      a.href = dataUrl;
      document.body.appendChild(a);
      a.click();
      a.remove();
      this.toast('Snapshot saved.', 'good');
      this.track('photo');
      const meta = loadMeta();
      meta.photos += 1;
      saveMeta(meta);
      const fresh = unlockBy(this.baseAchievementCtx());
      this.toastFresh(fresh);
    } catch {
      this.toast('Could not capture photo.', 'amber');
    }
  }

  private resetRun(nextChain: number, message: string): void {
    this.hud.hideFinal();
    this.hud.hideFinished();
    this.hud.closeModals();
    this.world.reset();
    this.world.smoke.stop();
    this.world.smoke.reset();
    this.world.joint.setLit(false);
    this.world.joint.setSpin(false);
    this.world.joint.hide();
    this.world.lighter.reset();
    for (const id of STAGE_ORDER) this.stages[id].reset(this);
    this.tweens.clear();
    this.chain = nextChain;
    this.sessionRecorded = false;
    this.stats.startedAt = performance.now();
    this.stats.finishedAt = 0;
    this.stats.interactions.clear();
    this.stats.rollCompletion = 0;
    this.go('PREPARE');
    this.toast(message, 'good');
  }

  private replay(): void {
    this.resetRun(1, 'Fresh roll. Let\'s go.');
  }

  /** Roll another joint back to back — chains the session for the streak reward. */
  private nextJoint(): void {
    const next = this.chain + 1;
    this.resetRun(next, next > 2 ? `${next} in a row — keep it rolling.` : `Another one — that's ${next} in a row.`);
  }

  exitFreeRoam(): void {
    this.go(this.stats.rollCompletion >= 100 ? 'FINAL' : 'PREPARE');
  }

  private computeStats(): FinalStats {
    const ms = Math.max(0, (this.stats.finishedAt || performance.now()) - (this.stats.startedAt || 0));
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const timeLabel = m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;

    const objects = this.stats.interactions.size;
    const speedBonus = totalSec < 75 ? 25 : totalSec < 120 ? 16 : 8;
    const variety = Math.min(objects, 15);
    const rollBonus = this.stats.rollCompletion >= 100 ? 20 : this.stats.rollCompletion * 0.2;
    const style = Math.max(40, Math.min(100, Math.round(55 + speedBonus + variety + rollBonus)));
    const styleLabel = style >= 90 ? 'Silky' : style >= 75 ? 'Smooth' : style >= 60 ? 'Steady' : 'Careful';

    return {
      timeLabel,
      objects,
      roll: this.stats.rollCompletion,
      style,
      styleLabel,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Plumbing                                                         */
  /* ---------------------------------------------------------------- */

  private resize = (): void => {
    const canvas = this.sceneMx.renderer.domElement;
    const parent = canvas.parentElement ?? document.body;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.sceneMx.resize(w, h);
    this.cameraRig.setLimits(
      this.current.id === 'FREE_ROAM' ? 1.2 : 1.5,
      this.current.id === 'FREE_ROAM' ? 16 : 14,
      this.current.id === 'FREE_ROAM',
    );
    this.current.onViewportChange?.(this);
  };

  private bindGlobalEvents(): void {
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    this.cleanup.push(() => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    });

    const ro = new ResizeObserver(() => this.resize());
    const app = document.getElementById('app');
    if (app) ro.observe(app);
    this.cleanup.push(() => ro.disconnect());

    const onVisibility = () => {
      if (document.hidden) this.pause();
      else if (!this.disposed) {
        this.lastTime = performance.now();
        this.start();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanup.push(() => document.removeEventListener('visibilitychange', onVisibility));

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') this.hud.closeModals();
      else if (e.key === 'h' || e.key === 'H') this.hud.openHelp();
      else if (e.key === 'm' || e.key === 'M') this.toggleSound();
    };
    window.addEventListener('keydown', onKey);
    this.cleanup.push(() => window.removeEventListener('keydown', onKey));

    const onBeforeUnload = () => this.dispose();
    window.addEventListener('beforeunload', onBeforeUnload);
    this.cleanup.push(() => window.removeEventListener('beforeunload', onBeforeUnload));
  }

  private checkAutoQuality(dt: number): void {
    if (this.manualGraphics || this.settings.graphics === 'low') return;
    if (this.fpsAvg < 26) {
      this.lowFpsTime += dt;
      if (this.lowFpsTime > 2.5) {
        this.lowFpsTime = 0;
        const next: GraphicsLevel = this.settings.graphics === 'high' ? 'medium' : 'low';
        this.patchSettings({ graphics: next });
        this.toast(`Graphics → ${next}`, 'neutral');
      }
    } else {
      this.lowFpsTime = Math.max(0, this.lowFpsTime - dt);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pause();
    this.cleanup.forEach((fn) => fn());
    this.stages[this.current.id].exit(this);
    this.interaction.dispose();
    this.cameraRig.dispose();
    this.world.dispose();
    this.lighting.dispose();
    this.environment.dispose();
    this.hud.dispose();
    this.settingsPanel.dispose();
    this.audio.dispose();
    this.labels.clear();
    this.tweens.clear();
    disposeTextureCache();
    this.sceneMx.dispose();
  }
}
