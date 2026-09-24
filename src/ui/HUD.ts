import type {
  FinalHandlers,
  FinalStats,
  HUD,
  HUDHandlers,
  HintProgressSpec,
  HintSpec,
  ToastTone,
} from '../game/GameState';
import { HELP } from '../game/constants';

const ROLL_CIRCUMFERENCE = 2 * Math.PI * 30;
const TOAST_LIVE_MS = 2600;
const TOAST_LEAVE_MS = 320;
const MAX_TOASTS = 4;

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing HUD element #${id}`);
  return node as T;
}

export function createHUD(handlers: HUDHandlers): HUD {
  const intro = byId<HTMLElement>('overlay-intro');
  const finished = byId<HTMLElement>('overlay-finished');
  const finalOverlay = byId<HTMLElement>('overlay-final');

  const hint = byId<HTMLElement>('hint');
  const hintKicker = byId<HTMLElement>('hint-kicker');
  const hintText = byId<HTMLElement>('hint-text');
  const hintMeta = byId<HTMLElement>('hint-meta');
  const hintBar = byId<HTMLElement>('hint-bar');
  const hintPct = byId<HTMLElement>('hint-pct');
  const hintStatusEl = byId<HTMLElement>('hint-status');
  const hintToggle = byId<HTMLButtonElement>('hint-toggle');
  const btnBlow = byId<HTMLButtonElement>('btn-blow');
  const btnContinue = byId<HTMLButtonElement>('hint-continue');

  const rollRing = byId<HTMLElement>('roll-ring');
  const ringFg = byId<HTMLElement>('ring-fg');
  const rollPct = byId<HTMLElement>('roll-pct');

  const smokeUI = byId<HTMLElement>('smoke-ui');
  const smokeStatus = byId<HTMLElement>('smoke-status');
  const smokeStatusLabel = byId<HTMLElement>('smoke-status-label');
  const btnBlowHold = byId<HTMLButtonElement>('btn-blow-hold');
  const btnEndSession = byId<HTMLButtonElement>('btn-end-session');

  const toasts = byId<HTMLElement>('toasts');

  const btnStart = byId<HTMLButtonElement>('btn-start');
  const btnLight = byId<HTMLButtonElement>('btn-light');
  const btnReplay = byId<HTMLButtonElement>('btn-replay');
  const btnScene = byId<HTMLButtonElement>('btn-scene');
  const btnFreeRoam = byId<HTMLButtonElement>('btn-freeroam');
  const btnExitFreeRoam = byId<HTMLButtonElement>('btn-exit-freeroam');
  const btnHelp = byId<HTMLButtonElement>('btn-help');
  const btnSettings = byId<HTMLButtonElement>('btn-settings');
  const btnSound = byId<HTMLButtonElement>('btn-sound');

  const modalSettings = byId<HTMLElement>('modal-settings');
  const modalHelp = byId<HTMLElement>('modal-help');
  const helpBodyEl = byId<HTMLElement>('help-body');
  const modals = Array.from(document.querySelectorAll<HTMLElement>('.modal'));

  const statTime = byId<HTMLElement>('stat-time');
  const statObjects = byId<HTMLElement>('stat-objects');
  const statRoll = byId<HTMLElement>('stat-roll');
  const statStyle = byId<HTMLElement>('stat-style');

  let continueCb: (() => void) | null = null;
  let blowCb: (() => void) | null = null;
  let startCb: (() => void) | null = null;
  let lightCb: (() => void) | null = null;
  let exitFreeRoamCb: (() => void) | null = null;
  let finalHandlers: FinalHandlers | null = null;
  let helpBody = '';
  let finalBound = false;

  interface SmokeHandlers {
    onBlowStart(): void;
    onBlowMove(dx: number, dy: number): void;
    onBlowEnd(): void;
    onEnd(): void;
  }
  let smokeHandlers: SmokeHandlers | null = null;
  let smokeBound = false;
  let smokeDown = false;
  let smokeLastX = 0;
  let smokeLastY = 0;

  const toastTimers = new Set<number>();
  const cleanups: Array<() => void> = [];

  function on(
    target: EventTarget,
    type: string,
    fn: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, fn, options);
    cleanups.push(() => target.removeEventListener(type, fn, options));
  }

  let hintFraction = 0;
  let hintCount: number | undefined = undefined;
  let hintTotal: number | undefined = undefined;
  let hintMetaHidden = true;

  /** Render the thin bar + "n / total" readout from live gameplay numbers. */
  const applyHintProgress = (
    fraction: number,
    count: number | undefined,
    total: number | undefined,
  ): void => {
    const k = Math.max(0, Math.min(1, fraction));
    if (count !== undefined) hintCount = count;
    if (total !== undefined) hintTotal = total;
    hintFraction = k;
    hintBar.style.width = `${(k * 100).toFixed(1)}%`;
    hintPct.dataset.pct = String(Math.round(k * 100));
    if (hintCount !== undefined && hintTotal !== undefined && hintTotal > 0) {
      hintPct.textContent = `${hintCount} / ${hintTotal}`;
    } else {
      hintPct.textContent = `${Math.round(k * 100)}%`;
    }
    hint.classList.toggle('complete', k >= 1);
  };

  const setHintProgress = (p: number | HintProgressSpec): void => {
    if (typeof p === 'number') {
      applyHintProgress(p, undefined, undefined);
    } else {
      applyHintProgress(p.fraction, p.count, p.total);
    }
  };

  const deriveStatus = (fraction: number | undefined): string => {
    if (fraction === undefined) return 'READY';
    if (fraction <= 0) return 'READY';
    if (fraction >= 1) return 'COMPLETE';
    return 'IN PROGRESS';
  };

  const setHintStatus = (status?: string): void => {
    if (!status) status = deriveStatus(hintFraction);
    hintStatusEl.textContent = status;
    hint.dataset.status = status;
    hintStatusEl.hidden = hintMetaHidden;
  };

  const hideContinue = (): void => {
    btnContinue.hidden = true;
    continueCb = null;
  };

  const showContinue = (label: string | undefined, cb: () => void): void => {
    btnContinue.textContent = label && label.trim() ? label.trim() : 'CONTINUE';
    btnContinue.hidden = false;
    continueCb = cb;
  };

  const setBlowVisible = (visible: boolean, cb: (() => void) | null): void => {
    btnBlow.hidden = !visible;
    blowCb = cb;
  };

  const bindSmoke = (): void => {
    if (smokeBound) return;
    smokeBound = true;
    on(btnBlowHold, 'pointerdown', ((e: Event) => {
      const ev = e as PointerEvent;
      ev.preventDefault();
      smokeDown = true;
      smokeLastX = ev.clientX;
      smokeLastY = ev.clientY;
      btnBlowHold.classList.add('pressed');
      if (typeof btnBlowHold.setPointerCapture === 'function' && ev.pointerId != null) {
        try {
          btnBlowHold.setPointerCapture(ev.pointerId);
        } catch {
          /* pointer is being captured elsewhere */
        }
      }
      smokeHandlers?.onBlowStart();
    }) as EventListener);
    on(btnBlowHold, 'pointermove', ((e: Event) => {
      if (!smokeDown) return;
      const ev = e as PointerEvent;
      const dx = ev.clientX - smokeLastX;
      const dy = ev.clientY - smokeLastY;
      smokeLastX = ev.clientX;
      smokeLastY = ev.clientY;
      smokeHandlers?.onBlowMove(dx, dy);
    }) as EventListener);
    const endBlow = (): void => {
      if (!smokeDown) return;
      smokeDown = false;
      btnBlowHold.classList.remove('pressed');
      smokeHandlers?.onBlowEnd();
    };
    on(btnBlowHold, 'pointerup', endBlow);
    on(btnBlowHold, 'pointercancel', endBlow);
    on(btnBlowHold, 'lostpointercapture', endBlow);
    on(btnEndSession, 'click', () => smokeHandlers?.onEnd());
  };

  const setSmokePanel = (
    active: boolean,
    handlers: SmokeHandlers | null,
  ): void => {
    smokeHandlers = handlers;
    if (active) {
      bindSmoke();
      smokeUI.hidden = false;
    } else {
      smokeDown = false;
      btnBlowHold.classList.remove('pressed');
      smokeUI.hidden = true;
    }
  };

  const setSmokeStatus = (label: string, blowing: boolean): void => {
    smokeStatusLabel.textContent = label;
    smokeStatus.classList.toggle('blowing', blowing);
  };

  const setHint = (h: HintSpec | null): void => {
    if (!h) {
      hint.hidden = true;
      hint.classList.remove('complete');
      hint.dataset.status = '';
      hintFraction = 0;
      hintCount = undefined;
      hintTotal = undefined;
      hintStatusEl.textContent = '';
      hintStatusEl.hidden = true;
      hintPct.dataset.pct = '0';
      hideContinue();
      btnBlow.hidden = true;
      blowCb = null;
      return;
    }
    hint.hidden = false;
    hintKicker.textContent = h.kicker;
    hintText.textContent = h.text;
    hintMetaHidden = h.progress === undefined;
    hintMeta.hidden = hintMetaHidden;
    if (h.progress !== undefined) {
      applyHintProgress(h.progress, h.count, h.total);
    } else {
      hintClassFromSpec(h);
    }
    setHintStatus(h.status);
    if (h.showContinue) {
      btnContinue.hidden = false;
      if (h.continueLabel) btnContinue.textContent = h.continueLabel;
    } else {
      hideContinue();
    }
    if (h.showBlow) {
      btnBlow.hidden = false;
    } else {
      btnBlow.hidden = true;
      blowCb = null;
    }
  };

  /** When a stage has no numeric progress (e.g. SMOKE), keep only the state styling honest. */
  const hintClassFromSpec = (h: HintSpec): void => {
    const frac =
      h.count !== undefined && h.total !== undefined && h.total > 0
        ? h.count / h.total
        : 0;
    hintPct.textContent = h.count !== undefined && h.total !== undefined ? `${h.count} / ${h.total}` : '';
    hintBar.style.width = '0%';
    hintPct.dataset.pct = '0';
    hintFraction = frac;
    hint.classList.toggle('complete', frac >= 1);
  };

  const toast = (text: string, tone: ToastTone = 'neutral'): void => {
    while (toasts.childElementCount >= MAX_TOASTS) {
      toasts.firstElementChild?.remove();
    }
    const node = document.createElement('div');
    node.className = tone === 'neutral' ? 'toast' : `toast ${tone}`;
    node.textContent = text;
    toasts.appendChild(node);
    const timer1 = window.setTimeout(() => node.classList.add('leave'), TOAST_LIVE_MS);
    const timer2 = window.setTimeout(() => node.remove(), TOAST_LIVE_MS + TOAST_LEAVE_MS);
    toastTimers.add(timer1);
    toastTimers.add(timer2);
  };

  const setRollRing = (p: number | null): void => {
    if (p === null) {
      rollRing.hidden = true;
      return;
    }
    rollRing.hidden = false;
    const k = Math.max(0, Math.min(1, p));
    ringFg.style.strokeDashoffset = `${(ROLL_CIRCUMFERENCE * (1 - k)).toFixed(2)}`;
    rollPct.textContent = `${Math.round(k * 100)}%`;
  };

  const showIntro = (onStart: () => void): void => {
    intro.hidden = false;
    startCb = onStart;
  };

  const hideIntro = (): void => {
    intro.hidden = true;
    startCb = null;
  };

  const showFinished = (onLight: () => void): void => {
    finished.hidden = false;
    lightCb = onLight;
  };

  const hideFinished = (): void => {
    finished.hidden = true;
    lightCb = null;
  };

  const bindFinal = (): void => {
    if (finalBound) return;
    finalBound = true;
    on(btnReplay, 'click', () => finalHandlers?.onReplay());
    on(btnScene, 'click', () => finalHandlers?.onScene());
    on(btnFreeRoam, 'click', () => finalHandlers?.onFreeRoam());
  };

  const showFinal = (stats: FinalStats, handlers: FinalHandlers): void => {
    finalHandlers = handlers;
    bindFinal();
    statTime.textContent = stats.timeLabel;
    statObjects.textContent = String(stats.objects);
    statRoll.textContent = `${Math.max(0, Math.round(stats.roll))}%`;
    statStyle.textContent = stats.styleLabel
      ? `${stats.style} · ${stats.styleLabel}`
      : `${stats.style}`;
    finalOverlay.hidden = false;
  };

  const hideFinal = (): void => {
    finalOverlay.hidden = true;
  };

  const setFreeRoam = (visible: boolean, onExit: (() => void) | null): void => {
    btnExitFreeRoam.hidden = !visible;
    exitFreeRoamCb = onExit;
  };

  const setHelpBody = (text: string): void => {
    helpBody = text;
  };

  const openHelp = (): void => {
    closeModals();
    helpBodyEl.textContent = helpBody.trim() ? helpBody : HELP.INTRO;
    modalHelp.hidden = false;
  };

  const openSettings = (): void => {
    closeModals();
    modalSettings.hidden = false;
    const first = modalSettings.querySelector<HTMLInputElement>('input[type="radio"]');
    first?.focus();
  };

  const closeModals = (): void => {
    modals.forEach((m) => {
      m.hidden = true;
    });
  };

  const setSoundIcon = (on: boolean): void => {
    btnSound.setAttribute('aria-pressed', String(on));
    btnSound.classList.toggle('muted', !on);
  };

  const dispose = (): void => {
    toastTimers.forEach((t) => window.clearTimeout(t));
    toastTimers.clear();
    cleanups.forEach((fn) => fn());
    cleanups.length = 0;
  };

  on(btnStart, 'click', () => {
    const cb = startCb;
    startCb = null;
    cb?.();
  });

  on(btnLight, 'click', () => {
    const cb = lightCb;
    lightCb = null;
    cb?.();
  });

  on(btnSound, 'click', () => handlers.onSoundToggle());
  on(btnHelp, 'click', openHelp);
  on(btnSettings, 'click', openSettings);
  on(btnBlow, 'click', () => blowCb?.());
  on(btnContinue, 'click', () => {
    const cb = continueCb;
    continueCb = null;
    cb?.();
  });
  on(btnExitFreeRoam, 'click', () => exitFreeRoamCb?.());

  on(hintToggle, 'click', () => {
    const collapsed = hint.classList.toggle('collapsed');
    hintToggle.setAttribute('aria-expanded', String(!collapsed));
    hintToggle.setAttribute('aria-label', collapsed ? 'Expand objective' : 'Minimize objective');
  });

  document.querySelectorAll<HTMLElement>('[data-close]').forEach((btn) => {
    on(btn, 'click', () => {
      const id = btn.dataset.close;
      if (!id) return;
      document.getElementById(id)?.setAttribute('hidden', '');
    });
  });

  on(document, 'keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') closeModals();
  });

  return {
    setHint,
    setHintProgress,
    setHintStatus,
    toast,
    showContinue,
    hideContinue,
    setBlowVisible,
    setRollRing,
    setSmokePanel,
    setSmokeStatus,
    showIntro,
    hideIntro,
    showFinished,
    hideFinished,
    showFinal,
    hideFinal,
    setFreeRoam,
    setHelpBody,
    openHelp,
    openSettings,
    closeModals,
    setSoundIcon,
    dispose,
  };
}