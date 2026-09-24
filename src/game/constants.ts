import type {
  AmountId,
  Choices,
  GraphicsLevel,
  MotionLevel,
  PaperId,
  Settings,
  StageId,
  StrainId,
  ThemeDef,
} from './GameState';

export const STAGE_ORDER: StageId[] = [
  'INTRO',
  'PREPARE',
  'CLEAN',
  'BREAK',
  'ARRANGE',
  'ROLL',
  'FINISHED',
  'SMOKE',
  'FINAL',
];

/** Stage → progress step index (1..6) */
export const PROGRESS_STEP: Partial<Record<StageId, number>> = {
  PREPARE: 1,
  CLEAN: 2,
  BREAK: 3,
  ARRANGE: 4,
  ROLL: 5,
  FINISHED: 5,
  SMOKE: 6,
};

/* ---------------------------------------------------------------- */
/* World layout (tabletop units ≈ dm)                               */
/* ---------------------------------------------------------------- */

export const LAYOUT = {
  deskTopY: 0,
  tray: { x: 0, z: 0.1, w: 3.8, d: 2.4, topY: 0.055 },
  budStart: { x: -2.55, y: 0.16, z: 0.95 },
  budOnTray: { x: -0.7, y: 0.2, z: 0.15 },
  paper: { x: 0, y: 0.06, z: 0.1, len: 2.4, width: 1.2, radius: 0.165 },
  filterStart: { x: 2.4, y: 0.1, z: 0.15 },
  filterSnap: { x: -0.95, y: 0.16, z: -0.42 },
  stack: { x: 2.55, y: 0, z: 1.05 },
  lighter: { x: 2.6, y: 0, z: -0.75 },
  ashtray: { x: -2.5, y: 0, z: -0.95 },
  /** creator plaque — tucked in the back-right corner, away from gameplay */
  plaque: { x: 2.2, z: -2.05 },
  discard: { x: -1.62, y: 0, z: 1.42 },
  joint: { x: 0, y: 0.225, z: 0.1, len: 2.4, radius: 0.17 },
  /** piece slots on the paper during arrange (local-ish world z near inner edge) */
  pieceSlots: [
    { x: -0.62, z: -0.45 },
    { x: -0.28, z: -0.44 },
    { x: 0.06, z: -0.46 },
    { x: 0.4, z: -0.44 },
    { x: 0.74, z: -0.45 },
    { x: 1.0, z: -0.46 },
  ],
} as const;

export const CAMERA_VIEWS: Record<StageId, { pos: [number, number, number]; target: [number, number, number] }> = {
  INTRO: { pos: [0, 3.4, 5.6], target: [0, 0.35, 0.1] },
  PREPARE: { pos: [0, 3.0, 4.9], target: [0, 0.3, 0.2] },
  CLEAN: { pos: [-1.2, 2.1, 3.0], target: [-1.0, 0.3, 0.5] },
  BREAK: { pos: [0.25, 2.0, 2.75], target: [-0.5, 0.26, 0.1] },
  ARRANGE: { pos: [0, 3.3, 2.55], target: [0, 0.1, 0.1] },
  ROLL: { pos: [1.35, 2.35, 2.95], target: [0, 0.2, 0.1] },
  FINISHED: { pos: [1.7, 1.35, 2.25], target: [0, 0.22, 0.1] },
  SMOKE: { pos: [0.7, 2.1, 3.7], target: [0.3, 0.55, 0.1] },
  FINAL: { pos: [0, 2.7, 4.7], target: [0, 0.5, 0.1] },
  FREE_ROAM: { pos: [0, 3.2, 5.2], target: [0, 0.4, 0.1] },
  SANDBOX: { pos: [0.2, 2.6, 4.4], target: [0, 0.35, 0.1] },
};

export const ROLL = {
  /** screen px → progress */
  dragGain: 0.0016,
  dyGain: 0.35,
  window: 0.28,
} as const;

export const CLEAN = { debrisCount: 5 } as const;
export const BREAK = { chunkCount: 9, requiredBroken: 9 } as const;
export const ARRANGE = { totalPieces: 4 } as const;

/** Kind of plant material depicted by a bud chunk (visual variety, not gameplay). */
export type HerbalPart = 'leaf' | 'stem' | 'seed' | 'trim';

/** Visual variety per chunk index (length must match BREAK.chunkCount). */
export const HERB: { variants: HerbalPart[] } = {
  variants: ['leaf', 'leaf', 'trim', 'leaf', 'stem', 'seed', 'seed', 'stem', 'leaf'],
};

/* ---------------------------------------------------------------- */
/* Roll recipe player choices                                      */
/* ---------------------------------------------------------------- */

export interface StrainDef {
  id: StrainId;
  name: string;
  leaf: string;
  trim: string;
  core: string;
  accent: string;
}

/** Plant material is recolored by choosing a strain. 'green' matches the classic look. */
export const STRAINS: StrainDef[] = [
  { id: 'green', name: 'Green Lotus', leaf: '#5b8f2e', trim: '#7ea65c', core: '#4a7338', accent: '#7ddc6a' },
  { id: 'violet', name: 'Violet Haze', leaf: '#6a4a82', trim: '#8a6aa0', core: '#5a3a6e', accent: '#c79aee' },
  { id: 'gold', name: 'Golden Pine', leaf: '#8f7a2e', trim: '#a89a52', core: '#7a5a2c', accent: '#e8c06a' },
];

export interface PaperDef {
  id: PaperId;
  name: string;
  /** sheet width actual (paper wraps around the longest axis) */
  width: number;
  /** rolling diameter — the fatter/slimmer the joint */
  radius: number;
  /** finished joint length */
  length: number;
  /** drag("effort") multiplier for the ROLL stage — larger = easier/faster wrap */
  gain: number;
}

/** 'regular' matches today's LAYOUT.paper values exactly. */
export const PAPERS: PaperDef[] = [
  { id: 'slim', name: 'Slim', width: 0.95, radius: 0.15, length: 2.2, gain: 1.22 },
  { id: 'regular', name: 'Regular', width: 1.2, radius: 0.17, length: 2.4, gain: 1 },
  { id: 'king', name: 'King Size', width: 1.5, radius: 0.19, length: 2.7, gain: 0.84 },
];

export interface AmountDef {
  id: AmountId;
  name: string;
  /** how many broken pieces go into the ARRANGE stage (max 6 slots) */
  pieces: number;
  /** drag("effort") multiplier while rolling */
  gain: number;
}

/** 'regular' matches today's ARRANGE.totalPieces of 4. */
export const AMOUNTS: AmountDef[] = [
  { id: 'light', name: 'Light', pieces: 3, gain: 1.15 },
  { id: 'regular', name: 'Regular', pieces: 4, gain: 1 },
  { id: 'generous', name: 'Generous', pieces: 5, gain: 0.9 },
];

export const DEFAULT_CHOICES: Choices = {
  strain: 'green',
  paper: 'regular',
  amount: 'regular',
};

export const CHOICES_STORE_KEY = 'joint-workshop.choices.v1';

/* ---------------------------------------------------------------- */
/* Help copy                                                        */
/* ---------------------------------------------------------------- */

export const HELP: Record<string, string> = {
  PREPARE:
    'Grab the green material with a mouse or finger and drag it onto the tray. Objects glow green when they are in the right spot, then snap gently into place.',
  CLEAN:
    'Pull the stems and seeds out of the trimmed flower and drag them into the bin. Toss each waste piece to fill the counter — clear them all to get a clean shake.',
  BREAK:
    'Click or tap the bud to pop it apart into smaller game pieces. You can also drag the loose pieces around the tray — they bounce and settle.',
  ARRANGE:
    'Drag the broken pieces onto the rolling paper, then drop the filter at the end of the sheet. Green outline means correct placement. Tap a placed piece to rotate it.',
  ROLL:
    'Drag left/right (or any direction) across the paper to roll it up. The paper wraps in real time and the ring shows your progress. Keep dragging to 100%.',
  FINISHED: 'Your roll is done. Press LIGHT IT to fire up the final scene.',
  SMOKE:
    'The roll is lit — hold BLOW SMOKE and drag to steer the smoke around. It keeps rising until you hit END SESSION. Orbit and zoom with drag and scroll.',
  FINAL:
    'The session is wrapped. Play again for a fresh run, roll another joint back to back, change the desk scene, or enter Free Roam to orbit around and poke at everything.',
  FREE_ROAM:
    'Free Roam: drag empty space to orbit, scroll or pinch to zoom, and drag any object on the desk. Capture a photo, then exit whenever you like.',
  SANDBOX:
    'Sandbox: drag anything on the desk. Roll the paper to build a joint, scatter the bud, fire up the lighter — no rules, no timer. Exit to the wrap panel any time.',
  INTRO: 'Press START to open the workshop.',
};

/* ---------------------------------------------------------------- */
/* Themes (CHANGE SCENE)                                            */
/* ---------------------------------------------------------------- */

export const THEMES: ThemeDef[] = [
  {
    name: 'Walnut Night',
    deskBase: '#4a3220',
    deskDark: '#2a1b10',
    deskLight: '#6b4a2b',
    bg: '#121218',
    fog: '#0e0e14',
    accent: '#e8a552',
  },
  {
    name: 'Golden Oak',
    deskBase: '#7a5734',
    deskDark: '#4d3620',
    deskLight: '#a87b4a',
    bg: '#15141a',
    fog: '#111016',
    accent: '#f0b46a',
  },
  {
    name: 'Slate Lab',
    deskBase: '#33363e',
    deskDark: '#1d1f25',
    deskLight: '#4a4e59',
    bg: '#0d1013',
    fog: '#0a0c0f',
    accent: '#5ee6a8',
  },
];

export function defaultSettings(): Settings {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    graphics: detectGraphics(),
    motion: (reduced ? 'reduced' : 'full') as MotionLevel,
    sound: true,
    themeIndex: 0,
    skipIntro: false,
    music: true,
  };
}

export function detectGraphics(): GraphicsLevel {
  if (typeof navigator === 'undefined') return 'medium';
  const coarse =
    (navigator.maxTouchPoints > 0 &&
      window.matchMedia?.('(pointer: coarse)')?.matches) ??
    false;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (coarse) return mem <= 4 || cores <= 4 ? 'low' : 'medium';
  if (mem >= 8 && cores >= 8) return 'high';
  return 'medium';
}

export const QUALITY = {
  high: { dpr: 2, shadow: 2048, shadows: true, smoke: 150, fx: 420, aa: true, env: true },
  medium: { dpr: 1.5, shadow: 1024, shadows: true, smoke: 96, fx: 280, aa: true, env: true },
  low: { dpr: 1, shadow: 512, shadows: false, smoke: 58, fx: 160, aa: false, env: false },
} as const satisfies Record<GraphicsLevel, {
  dpr: number;
  shadow: number;
  shadows: boolean;
  smoke: number;
  fx: number;
  aa: boolean;
  env: boolean;
}>;
