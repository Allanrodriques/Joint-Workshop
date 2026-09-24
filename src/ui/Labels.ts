import * as THREE from 'three';
import type { LabelDef, Labels } from '../game/GameState';

interface Entry {
  el: HTMLElement;
  def: LabelDef;
}

function classNameFor(tone: LabelDef['tone']): string {
  return tone ? `label tone-${tone}` : 'label';
}

export function createLabels(container: HTMLElement): Labels {
  const items = new Map<string, Entry>();
  const world = new THREE.Vector3();

  const set = (defs: LabelDef[]): void => {
    const seen = new Set<string>();
    for (const def of defs) {
      seen.add(def.id);
      let entry = items.get(def.id);
      if (!entry) {
        const el = document.createElement('div');
        container.appendChild(el);
        entry = { el, def };
        items.set(def.id, entry);
      }
      entry.def = def;
      entry.el.className = classNameFor(def.tone);
      entry.el.textContent = def.text;
      entry.el.style.opacity = def.visible ? '1' : '0';
    }
    for (const [id, entry] of items) {
      if (!seen.has(id)) {
        entry.el.remove();
        items.delete(id);
      }
    }
  };

  const update = (camera: THREE.Camera, width: number, height: number): void => {
    for (const entry of items.values()) {
      const { el, def } = entry;
      if (!def.visible) {
        el.style.opacity = '0';
        continue;
      }
      if (def.anchor instanceof THREE.Vector3) {
        world.copy(def.anchor);
      } else {
        def.anchor.getWorldPosition(world);
      }
      world.project(camera);
      const behind = world.z > 1;
      el.style.opacity = behind ? '0' : '1';
      if (!behind) {
        const x = (world.x * 0.5 + 0.5) * width;
        const y = (-world.y * 0.5 + 0.5) * height;
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      }
    }
  };

  const clear = (): void => {
    items.forEach((entry) => entry.el.remove());
    items.clear();
  };

  const dispose = (): void => {
    clear();
  };

  const api: Labels & { dispose: () => void } = { set, update, clear, dispose };
  return api;
}