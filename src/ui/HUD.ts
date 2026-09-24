import type {
  AchievementChip,
  ChoiceKind,
  Choices,
  FinalHandlers,
  FinalStats,
  HUD,
  HUDHandlers,
  HintProgressSpec,
  HintSpec,
  SessionRecord,
  ToastTone,
} from '../game/GameState';
import { HELP } from '../game/constants';
import { ACHIEVEMENT_DEFS } from '../game/History';

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
  const freeRoamOverlay = byId<HTMLElement>('overlay-freeroam');

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
  const btnNextJoint = byId<HTMLButtonElement>('btn-nextjoint');
  const btnSandbox = byId<HTMLButtonElement>('btn-sandbox');
  const btnPhoto = byId<HTMLButtonElement>('btn-photo');
  const btnExitFreeRoam = byId<HTMLButtonElement>('btn-exit-freeroam');
  const btnPhotoFreeroam = byId<HTMLButtonElement>('btn-photo-freeroam');
  const btnHelp = byId<HTMLButtonElement>('btn-help');
  const btnSettings = byId<HTMLButtonElement>('btn-settings');
  const btnSound = byId<HTMLButtonElement>('btn-sound');

  const sessionHistory = byId<HTMLElement>('session-history');
  const achievCount = byId<HTMLElement>('achiev-count');
  const achievStrip = byId<HTMLElement>('achiev-strip');

  const photoUi = byId<HTMLElement>('photo-ui');
  const btnPhotoCapture = byId<HTMLButtonElement>('btn-photo-capture');
  const btnPhotoExit = byId<HTMLButtonElement>('btn-photo-exit');
  const emberGlow = byId<HTMLElement>('ember-glow');

  const choiceBar = byId<HTMLElement>('choice-bar');
  const choiceBtns = Array.from(
    document.querySelectorAll<HTMLButtonElement>('#choice-bar [data-kind]'),
  );

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
  let photoFreeroamCb: (() => void) | null = null;
  let finalHandlers: FinalHandlers | null = null;
  let helpBody = '';
  let finalBound = false;
  let photoHandlers: { onCapture: () => void; onExit: () => void } | null = null;

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
    on(btnNextJoint, 'click', () => finalHandlers?.onNextJoint());
    on(btnSandbox, 'click', () => finalHandlers?.onSandbox());
    on(btnPhoto, 'click', () => finalHandlers?.onPhoto());
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

  const setFreeRoam = (
    visible: boolean,
    onExit: (() => void) | null,
    onPhoto: (() => void) | null = null,
  ): void => {
    freeRoamOverlay.hidden = !visible;
    btnExitFreeRoam.hidden = !visible;
    btnPhotoFreeroam.hidden = !visible || !onPhoto;
    exitFreeRoamCb = onExit;
    photoFreeroamCb = onPhoto;
  };

  const setFinalExtras = (records: SessionRecord[], chips: AchievementChip[]): void => {
    sessionHistory.textContent = '';
    if (!records.length) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'No sessions yet.';
      sessionHistory.appendChild(empty);
    } else {
      for (const r of records.slice(0, 5)) {
        const item = document.createElement('p');
        item.className = 'history-item';
        const t = document.createElement('span');
        t.className = 'h-time';
        t.textContent = r.timeLabel;
        const rec = document.createElement('span');
        rec.className = 'h-rec';
        rec.textContent =
          `${r.roll}% · ${r.styleLabel} · ${r.strain} · ${r.paper}${r.chain > 1 ? ` · ×${r.chain}` : ''}`;
        item.append(t, rec);
        sessionHistory.appendChild(item);
      }
    }
    achievCount.textContent = `${chips.length} / ${ACHIEVEMENT_DEFS.length}`;
    achievStrip.textContent = '';
    if (!chips.length) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'Keep playing to unlock.';
      achievStrip.appendChild(empty);
    } else {
      for (const c of chips) {
        const chip = document.createElement('span');
        chip.className = 'achiev-chip';
        chip.title = c.name;
        chip.textContent = c.name;
        achievStrip.appendChild(chip);
      }
    }
  };

  const setPhotoMode = (active: boolean, handlers: { onCapture: () => void; onExit: () => void } | null): void => {
    photoHandlers = handlers;
    photoUi.hidden = !active;
    document.body.classList.toggle('photo-mode', active);
  };

  const setEmberGlow = (v: number): void => {
    const k = Math.max(0, Math.min(1, v));
    const opacity = 0.12 + k * 0.5;
    if (emberGlow.style.opacity !== String(opacity)) emberGlow.style.opacity = String(opacity);
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

  let currentChoices: Choices | null = null;

  /** Mirror the current recipe onto the segmented pills, then show/hide the bar. */
  const renderChoices = (): void => {
    for (const btn of choiceBtns) {
      const kind = btn.dataset.kind as ChoiceKind | undefined;
      const active = !!currentChoices && btn.dataset.value === currentChoices[kind as keyof Choices];
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  };

  const setChoiceBar = (state: Choices | null): void => {
    currentChoices = state;
    if (!state) {
      choiceBar.hidden = true;
      return;
    }
    renderChoices();
    choiceBar.hidden = false;
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
  for (const btn of choiceBtns) {
    on(btn, 'click', () => {
      const kind = btn.dataset.kind as ChoiceKind | undefined;
      const value = btn.dataset.value;
      if (!kind || !value || !currentChoices) return;
      currentChoices = { ...currentChoices, [kind]: value } as Choices;
      renderChoices();
      handlers.onSelectChoice(kind, value);
    });
  }
  on(btnHelp, 'click', openHelp);
  on(btnSettings, 'click', openSettings);
  on(btnBlow, 'click', () => blowCb?.());
  on(btnContinue, 'click', () => {
    const cb = continueCb;
    continueCb = null;
    cb?.();
  });
  on(btnExitFreeRoam, 'click', () => exitFreeRoamCb?.());
  on(btnPhotoFreeroam, 'click', () => photoFreeroamCb?.());
  on(btnPhotoCapture, 'click', () => photoHandlers?.onCapture());
  on(btnPhotoExit, 'click', () => photoHandlers?.onExit());

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
    if ((e as KeyboardEvent).key !== 'Escape') return;
    if (photoHandlers && !photoUi.hidden) {
      photoHandlers.onExit();
      return;
    }
    closeModals();
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
    setFinalExtras,
    setPhotoMode,
    setEmberGlow,
    setFreeRoam,
    setHelpBody,
    openHelp,
    openSettings,
    closeModals,
    setSoundIcon,
    setChoiceBar,
    dispose,
  };
}