import type { SessionRecord } from './GameState';

export const HISTORY_KEY = 'joint-workshop.history.v1';
export const ACHIEVEMENTS_KEY = 'joint-workshop.achievements.v1';
export const PROGRESS_KEY = 'joint-workshop.progress.v1';
export const MAX_HISTORY = 8;

export interface AchievementDef {
  id: string;
  name: string;
  blurb: string;
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: 'first-roll', name: 'First Roll', blurb: 'Finish a full session.' },
  { id: 'master-roller', name: 'Master Roller', blurb: 'Roll to a perfect 100%.' },
  { id: 'speedster', name: 'Speedster', blurb: 'Wrap a session in under 75s.' },
  { id: 'whirlwind', name: 'Whirlwind', blurb: 'Wrap a session in under a minute.' },
  { id: 'networker', name: 'Well Connected', blurb: 'Poke at 12+ objects in one run.' },
  { id: 'stylist', name: 'Silky Hands', blurb: 'Score 90+ style points.' },
  { id: 'regular', name: 'Regular', blurb: 'Finish 5 sessions.' },
  { id: 'collector', name: 'Strain Collector', blurb: 'Roll all three strains.' },
  { id: 'tinkerer', name: 'Tinkerer', blurb: 'Try 4 different recipes.' },
  { id: 'double', name: 'Double Rolled', blurb: 'Roll two joints back to back.' },
  { id: 'explorer', name: 'Explorer', blurb: 'Roam the desk freely.' },
  { id: 'photographer', name: 'Photographer', blurb: 'Capture a snapshot.' },
];

export interface ProgressMeta {
  photos: number;
  freeRoam: number;
}

export interface AchievementCtx {
  sessions: number;
  bestRoll: number;
  fastest: number;
  objects: number;
  style: number;
  strains: Set<string>;
  combos: number;
  chains: number[];
  freeRoam: boolean;
  photos: number;
}

export function loadHistory(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SessionRecord[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

export function pushSession(rec: SessionRecord): SessionRecord[] {
  const list = [rec, ...loadHistory()].slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
  return list;
}

export function loadUnlocked(): Set<string> {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function allUnlockedChips(): Array<{ id: string; name: string }> {
  const set = loadUnlocked();
  return ACHIEVEMENT_DEFS.filter((d) => set.has(d.id)).map((d) => ({
    id: d.id,
    name: d.name,
  }));
}

export function loadMeta(): ProgressMeta {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { photos: 0, freeRoam: 0 };
    const parsed = JSON.parse(raw) as Partial<ProgressMeta>;
    return {
      photos: Number(parsed.photos) || 0,
      freeRoam: Number(parsed.freeRoam) || 0,
    };
  } catch {
    return { photos: 0, freeRoam: 0 };
  }
}

export function saveMeta(meta: ProgressMeta): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(meta));
  } catch {
    /* storage unavailable */
  }
}

function satisfies(id: string, ctx: AchievementCtx): boolean {
  switch (id) {
    case 'first-roll':
      return ctx.sessions >= 1;
    case 'master-roller':
      return ctx.bestRoll >= 100;
    case 'speedster':
      return ctx.fastest > 0 && ctx.fastest < 75;
    case 'whirlwind':
      return ctx.fastest > 0 && ctx.fastest < 60;
    case 'networker':
      return ctx.objects >= 12;
    case 'stylist':
      return ctx.style >= 90;
    case 'regular':
      return ctx.sessions >= 5;
    case 'collector':
      return ctx.strains.size >= 3;
    case 'tinkerer':
      return ctx.combos >= 4;
    case 'double':
      return ctx.chains.some((c) => c >= 2);
    case 'explorer':
      return ctx.freeRoam;
    case 'photographer':
      return ctx.photos >= 1;
    default:
      return false;
  }
}

/**
 * Evaluate an achievement context, persist any newly met achievements and
 * return the fresh crops (for toasts + the FINAL panel summary).
 */
export function unlockBy(ctx: AchievementCtx): AchievementDef[] {
  const unlocked = loadUnlocked();
  const fresh = ACHIEVEMENT_DEFS.filter((d) => satisfies(d.id, ctx) && !unlocked.has(d.id));
  for (const d of fresh) unlocked.add(d.id);
  if (fresh.length) {
    try {
      localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify([...unlocked]));
    } catch {
      /* storage unavailable */
    }
  }
  return fresh;
}