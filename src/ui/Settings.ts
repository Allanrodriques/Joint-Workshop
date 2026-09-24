import type {
  GraphicsLevel,
  MotionLevel,
  Settings,
  SettingsPanel,
} from '../game/GameState';
import { detectGraphics } from '../game/constants';

const GFX = new Set(['high', 'medium', 'low']);
const MOTION = new Set(['full', 'reduced']);

export function createSettingsPanel(
  getSettings: () => Settings,
  applyPatch: (patch: Partial<Settings>) => void,
): SettingsPanel {
  const modal = document.getElementById('modal-settings');
  let gfxNote: HTMLElement | null = null;
  let radios: HTMLInputElement[] = [];
  if (modal) {
    gfxNote = document.getElementById('gfx-note');
    radios = Array.from(modal.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  }

  const cleanups: Array<() => void> = [];

  function on(target: EventTarget, type: string, fn: EventListener): void {
    target.addEventListener(type, fn);
    cleanups.push(() => target.removeEventListener(type, fn));
  }

  const readChecked = (name: string): string | null => {
    const el = modal?.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
    return el ? el.value : null;
  };

  const setAppMotion = (motion: MotionLevel): void => {
    const app = document.getElementById('app');
    if (app) app.dataset.motion = motion;
  };

  const setGroup = (name: string, value: string): void => {
    modal
      ?.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)
      .forEach((r) => {
        r.checked = r.value === value;
      });
  };

  const sync = (): void => {
    const s = getSettings();
    setGroup('gfx', s.graphics);
    setGroup('motion', s.motion);
    setGroup('snd', s.sound ? 'on' : 'off');
    setAppMotion(s.motion);
    if (gfxNote) {
      const detected = detectGraphics();
      gfxNote.textContent =
        s.graphics === detected ? `Auto-detected: ${detected}` : `Manual: ${s.graphics}`;
    }
  };

  const applyFromRadios = (): void => {
    const patch: Partial<Settings> = {};
    const gfx = readChecked('gfx');
    if (gfx && GFX.has(gfx)) patch.graphics = gfx as GraphicsLevel;
    const motion = readChecked('motion');
    if (motion && MOTION.has(motion)) {
      patch.motion = motion as MotionLevel;
      setAppMotion(motion as MotionLevel);
    }
    const snd = readChecked('snd');
    if (snd === 'on' || snd === 'off') patch.sound = snd === 'on';
    applyPatch(patch);
    sync();
  };

  for (const r of radios) on(r, 'change', applyFromRadios);

  return {
    sync,
    dispose: () => {
      cleanups.forEach((fn) => fn());
      cleanups.length = 0;
    },
  };
}