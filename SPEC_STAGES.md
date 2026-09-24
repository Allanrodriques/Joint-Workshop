# Stage + Interaction Build Spec (for agent)

Implement EXACTLY against contracts in `src/game/GameState.ts` and `src/game/constants.ts`.
Object layer already exists in `src/objects/*` (read them for exact behavior).
tsconfig: strict, noUnusedLocals, noUnusedParameters. No `console`, no `TODO`, no `throw new Error('todo')`.
`import type` for type-only imports.

## Your exclusive files
- `src/interaction/RaycastManager.ts`
- `src/interaction/DragController.ts`
- `src/interaction/InteractionManager.ts`
- `src/stages/PrepareStage.ts`, `CleanStage.ts`, `BreakStage.ts`, `ArrangeStage.ts`, `RollStage.ts`, `FinishedStage.ts`, `SmokeStage.ts`, `IdleStages.ts`, `index.ts`

Do not edit anything else.

---

## RaycastManager.ts
`export class RaycastManager`
- `constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, scene: THREE.Scene)`
- internal NDC vector updated from element bounding rect on each pick
- `pick(objects: THREE.Object3D[], recursive?: boolean): THREE.Intersection | null`
- `pickFirst(targets: DragTarget[]): { target: DragTarget; point: THREE.Vector3; object: THREE.Object3D } | null`
  — intersect each enabled target's root recursively (build array of roots), nearest hit wins
- `resolveRoot(obj: THREE.Object3D, targets: DragTarget[]): DragTarget | null` — walk parents until an object that is some target's root
- `clear(): void`

## DragController.ts
`export class DragController` — pointer state machine used by InteractionManager.

`constructor(params: { camera; domElement; raycast: RaycastManager; getTargets: () => DragTarget[]; getZones: () => SnapZone[]; onTrack: (id: string) => void; controls: OrbitControls; reducedMotion: () => boolean })`

- `domElement.style.touchAction = 'none'`.
- Listeners on **window with capture: true** for pointerdown/move/up (so we run before OrbitControls on the canvas).
- pointerdown (primary button only): raycast via raycast.pickFirst. If hit target (enabled, mode drag/both for drag, or click/both for click):
  - `e.stopPropagation()` (prevents orbit from starting), `controls.enabled = false`, `domElement.setPointerCapture(e.pointerId)`.
  - record downX/downY/downTime/pointerId/target; drag plane = horizontal plane at planeY = number if `target.dragY` is number, else `target.dragY?.() ?? root world y`; grabOffset = root world pos − plane point.
  - call `target.onGrab?.(t, point)`; `onTrack(target.id)`.
  - game feel (skip for mode 'click'): lift root +0.08 y and tilt rotation.x/z toward (0.12, −0.08) over ~0.12 s via internal micro-tween; store restY/restRot.
- pointermove: if dragging — intersect plane, desired world = planePoint + grabOffset, clamp to `target.bounds` if present, convert with `root.parent.worldToLocal(desired)`, set `root.position`; tilt `rotation.z = clamp(-dx * 0.002, -0.25, 0.25)`; call `target.onMove?.(t, worldPoint, deltaWorld)`; accumulate total movement. `e.preventDefault()` while dragging.
  If not dragging and `e.pointerType === 'mouse'` — hover raycast: canvas cursor = target.cursor ?? 'grab' / 'grabbing' while dragging / '' otherwise; call `onHover(true/false)` on change.
- pointerup: if dragging — if total movement < 7 px and elapsed < 600 ms → `target.onClick?.(t, point)`; else find first zone with `enabled !== false && contains(worldPoint)` → `target.onDrop?.(t, point, zone | null)`; if zone, micro-tween `root.position` to `zone.snapTo(point)` over 0.14 s with easeOutBack, then `onTrack('snap:' + zone.id)`.
  Always: tween lift/tilt back to rest, `controls.enabled = orbitDesired` (an internal flag; default true, settable by InteractionManager.setOrbit).
- `update(dt)` advances micro-tweens; `reset()` cancels state/tweens; `dispose()` removes all listeners.
- Clicks/taps must work on touch (pointer events only).

## InteractionManager.ts
`export class InteractionManager` implements the GameState interface of the same name.
`constructor(opts: { camera; scene; domElement; controls: OrbitControls; onTrack: (id) => void; reducedMotion: () => boolean })` — owns RaycastManager + DragController, exposes `readonly controls`.
- `setTargets` / `setZones` store arrays.
- `setOrbit(enabled)`: `controls.enableRotate = enabled` (zoom always allowed), store orbitDesired into DragController.
- `update(dt)` / `reset()` / `dispose()` delegate.

---

## Stages — shared pattern
Each stage: `export class XStage implements Stage { readonly id: StageId; enter(game); update(dt, game); exit(game); reset(game) }`

- `enter`: `game.cameraRig.moveTo(new Vector3(...CAMERA_VIEWS[id].pos), new Vector3(...CAMERA_VIEWS[id].target))`; `game.hud.hideContinue()`; `game.hud.setRollRing(null)`; `game.hud.setBlowVisible(false, null)`; `game.setHint({...})`; `game.setLabels([...])`; `game.interaction.setTargets([...])`; `game.interaction.setZones([...])`; `game.interaction.setOrbit(...)`; `game.setHelpBody(HELP[id])` — wait: GameAPI has no setHelpBody; skip help (Game handles it).
- `exit`: clear targets/zones/labels/hint/roll ring/blow/zone ring; `interaction.setOrbit(true)`.
- `reset(game)`: reset this stage's own progress flags to initial AND restore the object state it owns (call the relevant world object resets; assume a full `world.reset()` also runs on replay — still reset local flags).
- Use `game.tweens`, `world.fx.burst`, `game.audio.*`, `game.shake`, `game.track(id)` (track each meaningful interaction: each speck/chunk/piece ids like `speck:3`, `chunk:2`, `piece:1`, `filter`, `bud`, `paper-roll`).
- Never import other stages; `index.ts` wires them.

### PrepareStage ('PREPARE')
- Ensure `world.bud.setCoreFormed(false)`, bud at `LAYOUT.budStart` (only if not already prepared — store `prepared` flag; on enter if prepared, place at budOnTray), `world.paper.setVisible(false)`, `world.joint.hide()`, `world.filter` visible at start, `world.zone.hide()`.
- Target: `{ id: 'bud', root: world.bud.group, mode: 'both', enabled: true, dragY: () => world.bud.group.position.y }`.
- Zone: `{ id: 'tray', contains: p => world.tray.contains(p), snapTo: () => new Vector3(LAYOUT.budOnTray.x, LAYOUT.budOnTray.y, LAYOUT.budOnTray.z) }`.
- Hint `{ kicker: '01 · PREPARE', text: 'Drag the green material onto the tray.', progress: prepared ? 1 : 0 }`.
- Label `{ id: 'l-bud', text: 'material →', anchor: world.bud.group, visible: true }`.
- `onDrop` with zone → `world.fx.burst(point, { count: 10, colors: greens }), game.audio.place(), game.shake(0.06), game.setHintProgress(1), prepared = true`, remove label, then after 0.35 s `game.stageComplete('Nice. Ready for the next step.')` (use `game.tweens.add({ duration: 0.35, onUpdate: () => {}, onComplete: ... })`).
- Wrong drop: nothing (bud stays, still draggable).
- `reset`: prepared=false; if world not fully reset, move bud back to budStart.

### CleanStage ('CLEAN')
- enter: ensure bud at budOnTray (tween if needed), `setCoreFormed(false)`, `world.bud.clearSpecks()` then `spawnSpecks(CLEAN.speckCount)`.
- Targets: for each speck root from `world.bud.speckMeshes()`: `{ id: 'speck:' + i, root, mode: 'click', enabled: true, cursor: 'pointer' }`. NOTE raycast may hit the invisible proxy child — DragController's raycast is recursive against root so proxy hits resolve to that speck root via resolveRoot. (If a speck root has userData.speckRoot on an ancestor, resolveRoot walking to target root still works because proxy is a descendant of root.)
- `onClick(t)`: `const ok = world.bud.removeSpeck(t.root)`; if ok → get world pos (`t.root.getWorldPosition` BEFORE remove — capture in a temp vector first; if remove already detached, use captured), `world.fx.burst(pos, { count: 8, colors: ['#3a2c18', '#4f7d3a', '#8a6a3a'] })`, `game.audio.pop()`, `game.shake(0.04)`, cleaned++, `game.setHintProgress(cleaned / total)`, `game.track(t.id)`. Disable that target (`t.enabled = false`).
- Hint `{ kicker: '02 · CLEAN', text: 'Tap the specks to clean it up.', progress: 0 }`.
- Label on bud: `{ id: 'l-clean', text: 'tap ✕', anchor: world.bud.group, visible: true }`.
- When `cleaned / totalSpecks >= 0.85` → hide label, remove leftover specks (each with 0.2 s delay tween calling removeSpeck), `game.stageComplete('Nice. Ready for the next step.')` once (guard flag).
- `reset`: cleaned=0, completed=false.

### BreakStage ('BREAK')
- enter: bud assembled at tray, `clearSpecks()`, `setCoreFormed(false)`.
- Targets: one per chunk from `world.bud.chunkMeshes()`: `{ id: 'chunk:' + i, root: mesh, mode: 'both', enabled: true, dragY: () => mesh.getWorldPosition(v).y }` (capture temp vector correctly per target — use a closure creating/reusing one module-level temp).
- `onClick(t, point)`: compute center = `t.root.getWorldPosition(tmp)`; `impulse = center.sub(point).setY(0)` normalized * 2.4, plus small random; call `world.bud.breakNearest(point, impulse)`; if it returned true (track which chunk broke — prefer `world.bud.chunkMeshes().findIndex(m => m === t.root)` and call `breakChunk(idx, impulse)` directly for determinism): `fx.burst`, `audio.pop()`, `shake(0.08)`, broken++, progress = broken / BREAK.requiredBroken, `track(t.id)`.
- In `update`: for each chunk target whose mesh `userData.broken` — set `enabled = !!userData.settled` (objects layer sets settled flag; if the flag name differs, check `src/objects/MaterialObject.ts` and use the actual settled signal; if none exposed, treat enabled = true always after a short 0.4 s delay via elapsed timer).
- Hint `{ kicker: '03 · BREAK', text: 'Click the bud to pop it apart. Drag the pieces to scatter them.', progress }`.
- Label: `{ id: 'l-break', text: 'click me', anchor: world.bud.group, visible: true }` — remove once broken > 0.
- When `broken >= BREAK.requiredBroken` → `game.stageComplete('Nice texture.')` once.
- After broken, pieces draggable (mode both already).

### ArrangeStage ('ARRANGE')
- enter: `world.paper.setVisible(true)` + `setProgress(0)`; bud `setCoreFormed(false)`; ensure chunks visible & scattered on tray (they come from break stage); `interaction.setOrbit(false)`.
- Choose up to 6 visible chunk meshes as pieces (skip if fewer — use what exists). Track `placedIds: Set`.
- Targets: each piece `{ id: 'piece:' + i, root, mode: 'drag', dragY: () => LAYOUT.paper.y + 0.12 }`; filter `{ id: 'filter', root: world.filter.group, mode: 'drag', dragY: () => LAYOUT.filterSnap.y + 0.05 }`.
- Zones:
  - material zone: `contains: p => p.x > -0.95 && p.x < 1.15 && p.z > -0.62 && p.z < -0.12`, `snapTo: p => { const slot = LAYOUT.pieceSlots[Math.min(nextSlot++, LAYOUT.pieceSlots.length - 1)]; return new Vector3(slot.x, LAYOUT.paper.y + 0.14, slot.z); }` (closure `nextSlot`; if nextSlot >= length, snap near `p` clamped into the band instead — still accept).
  - filter zone: `contains: p => p.distanceTo(filterSnap) < 0.4` (xz distance fine), `snapTo: () => filterSnap.clone()`.
- `onDrop(t, point, zone)`:
  - piece + material zone: `audio.place()`, `fx.burst(point, { count: 6, colors: greens })`, `zone.showAt(point, 0.35, true)` then hide after 0.4 s, placed++, `track(t.id)`, refresh hint/labels, if placed >= ARRANGE.requiredPieces && filterPlaced → complete.
  - filter + filter zone: `filterPlaced = true`, `audio.place()`, `zone.showAt(..., true)`, same completion check.
  - no zone: nothing special (piece stays where dropped — still draggable).
- `onClick` on an already-placed piece → rotate +45° around Y via `game.tweens` (rotation.y target += Math.PI/4 over 0.25 s), `track('piece-rotate:' + id)`.
- Hint updates: pieces short → `'Drag the pieces onto the paper.'`; pieces ok & no filter → `'Now drop the filter at the end.'`; both → `'Looking good.'`; progress = placed/required * 0.7 + (filterPlaced ? 0.3 : 0). Kicker `'04 · ARRANGE'`.
- Labels: `'paper'` anchored at `world.paper.group` offset (use a THREE.Object3D child? anchor can be the group — fine), `'material →'` anchored to first unplaced piece (update on drop), `'filter →'` anchored to filter (hide once placed).
- Complete once: `game.stageComplete('Everything is in place.')`.
- `reset`: nextSlot=0, placed=0, filterPlaced=false, completed=false.

### RollStage ('ROLL') — centerpiece
- enter: `world.paper.setVisible(true)`; `world.bud.setCoreFormed(true)`; position bud group per objects-agent note: `world.bud.group.position.set(0, LAYOUT.paper.y + LAYOUT.paper.radius, LAYOUT.paper.z + world.paper.progress * 0.6 - 0.6)` (i.e. (0, 0.225, −0.5) at start); `interaction.setOrbit(false)`.
- Target: `{ id: 'paper', root: world.paper.mesh, mode: 'drag', dragY: () => LAYOUT.paper.y + 0.05 }`.
  - `onMove(t, point, delta)`: `const d = Math.abs(delta.x) + Math.abs(delta.z); if (d > 0.02) progress += d * 0.42;` clamp 0..1 (world-space k = 0.42 — screen-px constant ROLL.dragGain is unused by design).
  - Do NOT let the default position update move the paper: the DragController sets root.position — the paper mesh position should be restored: in `onMove`, after default applied, force `world.paper.mesh.position.set(0, 0, 0)` (mesh local rest) — or better set target `mode: 'drag'` and in onGrab/onMove reset `t.root.position.set(0,0,0)` and `t.root.rotation.set(0,0,0)` each move (mesh is child of paper.group). Verify rest local position from `src/objects/RollingPaper.ts` and restore exactly that.
- Every `update(dt)`: `world.paper.setProgress(progress)`; `world.bud.group.position.z = LAYOUT.paper.z + progress * 0.6 - 0.6` (follow the paper's internal z-drift; y stays LAYOUT.paper.y + radius); `world.bud.group.position.x = 0`.
- `hud.setRollRing(progress)`; `game.setHintProgress(progress)`; hint kicker `'05 · ROLL'`, text `'Drag across the paper to roll it up.'`.
- Haptics: at 0.25/0.5/0.75 thresholds — `game.shake(0.05)`, `game.audio.paper()` (throttled: play paper sound every ~0.15 s while progress increases, via a sound timer), tiny `fx.burst` at paper center (count 4). `navigator.vibrate?.(8)` guarded.
- Label: `{ id: 'l-roll', text: 'drag ↺', anchor: world.paper.group, visible: true }` — hide when progress > 0.06.
- At progress >= 1 (once): `world.paper.setVisible(false)`; `world.joint.show()` at `LAYOUT.joint` (objects align automatically); `world.bud.setCoreFormed(false)` + hide bud group; `fx.burst(joint pos, { count: 40, colors: ['#7ddc6a', '#e8a552', '#f3eee2', '#5ee6a8'], speed: 2.2 })`, `game.audio.chime()`, `game.shake(0.16)`, `game.stats.rollCompletion = 100`, `game.toast('Perfect roll.', 'good')`, `game.track('roll-complete')`, then after 0.7 s `game.go('FINISHED')`.
- `reset`: progress=0, done=false, paper.setProgress(0), joint.hide().

### FinishedStage ('FINISHED')
- enter: camera FINISHED view; `world.joint.show(); world.joint.setSpin(true);` celebration burst once (`fx.burst` at joint, count 30, speed 1.8), `audio.chime()`; `game.hud.showFinished(() => game.go('SMOKE'))`; hint null; targets [] (orbit allowed: setOrbit(true), limits: setLimits(1.4, 6, false)).
- update: nothing required (joint spins via world.update).
- exit: `hud.hideFinished()`.
- reset: joint.setSpin(false).

### SmokeStage ('SMOKE')
- enter: camera SMOKE view; `world.smoke.setEmitter(out => world.joint.getTipWorld(out))` (set once); `world.joint.setLit(true)`; `world.lighter.flyTo(new Vector3(LAYOUT.joint.x + 1.35, LAYOUT.joint.y + 0.1, LAYOUT.joint.z), 0.9, () => { world.lighter.setFlame(true); audio.ignite(); shake(0.08); game.tweens.add({ duration: 0.45, delay: 0.35, onUpdate: () => {}, onComplete: () => { world.lighter.setFlame(false); world.lighter.goHome(0.8); } }); })`; after flame moment `world.smoke.start()`; hint kicker `'06 · SMOKE'`, text `'Watch it rise — or blow it sideways.'`; `hud.setBlowVisible(true, onBlow)`; label `'ember'` anchored at joint; setOrbit(true), setLimits(1.6, 7, false).
- `onBlow`: `world.smoke.puff(22, { dir: new THREE.Vector3(1.6, 0.55, 0.15).normalize(), speed: 2.4 })`, `audio.whoosh()`, `shake(0.1)`, `track('blow')`.
- `update`: after 9 s elapsed (or after first blow + 4 s) and not finished → `game.go('FINAL')` once.
- `reset`: lit=false etc. (world.reset handles most; clear local timers).

### IdleStages.ts
Export `IntroStage`, `FinalStage`, `FreeRoamStage`:
- `IntroStage` (`'INTRO'`): enter: camera INTRO view, hint null, targets [], orbit on. update/exit/reset: minimal.
- `FinalStage` (`'FINAL'`): enter: camera FINAL view; compute nothing (Game fills stats) — call `game.hud.showFinal` is Game's job (Game listens on go('FINAL')); here just: keep smoke running, targets [] (orbit on, pan off), hint null. Actually: Game will call hud.showFinal itself when transitioning to FINAL — FinalStage only sets camera + orbit + hint null. Do NOT show final panel here.
- `FreeRoamStage` (`'FREE_ROAM'`): enter: camera FREE_ROAM view; `interaction.setOrbit(true)`; `interaction.setLimits(1.2, 10, true)` (pan enabled); targets: simple drag targets for bud group, paper group, filter, joint, lighter, ashtray (`{ id: 'roam:' + name, root, mode: 'drag', dragY: () => root.getWorldPosition(v).y }`); no zones; `game.hud.setFreeRoam(true, () => game.go('FINAL'))`; hint `{ kicker: 'FREE ROAM', text: 'Orbit, zoom and drag anything on the desk.' }`. exit: `hud.setFreeRoam(false, null)`, `setLimits(..., false)`, clear targets.
- exit for FinalStage: nothing heavy.

### index.ts
`export function createStages(): { [K in StageId]: Stage }` returning instances of all eight (INTRO, PREPARE, CLEAN, BREAK, ARRANGE, ROLL, FINISHED, SMOKE, FINAL, FREE_ROAM — all StageIds from GameState).

After writing everything, run `npx tsc --noEmit` and fix errors ONLY in your files (other modules already compile).
Reply with: files created, exported signatures, calibration notes (roll gain used, settled-flag handling), any contract issues.
