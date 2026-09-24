import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

function canvas(size: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  return { c, g };
}

function toTexture(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function memo(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** Stylised wood grain. */
export function woodTexture(base: string, dark: string, light: string, repeat = 2): THREE.Texture {
  const key = `wood:${base}:${dark}:${light}:${repeat}`;
  return memo(key, () => {
    const { c, g } = canvas(512);
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 140; i++) {
      const y = Math.random() * 512;
      const h = 1 + Math.random() * 4;
      g.globalAlpha = 0.05 + Math.random() * 0.12;
      g.fillStyle = Math.random() > 0.5 ? dark : light;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) {
        g.lineTo(x, y + Math.sin(x * 0.02 + i) * 6 + (Math.random() - 0.5) * 3);
      }
      g.lineTo(512, y + h);
      for (let x = 512; x >= 0; x -= 32) {
        g.lineTo(x, y + h + Math.sin(x * 0.02 + i) * 6);
      }
      g.closePath();
      g.fill();
    }
    // knots
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 8 + Math.random() * 18;
      const grad = g.createRadialGradient(x, y, 1, x, y, r);
      grad.addColorStop(0, dark);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.35;
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    return toTexture(c, repeat);
  });
}

/** Soft round blob (particles, glows, fake contact shadows). */
export function radialTexture(hex = '#ffffff', soft = 0.18): THREE.Texture {
  const key = `radial:${hex}:${soft}`;
  return memo(key, () => {
    const { c, g } = canvas(128);
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    grad.addColorStop(0, hex);
    grad.addColorStop(soft, hex);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Wispy smoke puff with soft irregular edge. */
export function smokeTexture(): THREE.Texture {
  return memo('smoke', () => {
    const { c, g } = canvas(128);
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    // punch a few holes for wispiness
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 10; i++) {
      const x = 30 + Math.random() * 68;
      const y = 30 + Math.random() * 68;
      const r = 6 + Math.random() * 16;
      const hole = g.createRadialGradient(x, y, 0, x, y, r);
      hole.addColorStop(0, 'rgba(0,0,0,0.5)');
      hole.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = hole;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Flame sprite. */
export function flameTexture(): THREE.Texture {
  return memo('flame', () => {
    const { c, g } = canvas(128);
    const grad = g.createRadialGradient(64, 78, 4, 64, 70, 56);
    grad.addColorStop(0, 'rgba(255,255,240,1)');
    grad.addColorStop(0.25, 'rgba(255,200,90,0.95)');
    grad.addColorStop(0.6, 'rgba(255,120,40,0.55)');
    grad.addColorStop(1, 'rgba(255,60,10,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    // teardrop shape
    g.globalCompositeOperation = 'destination-in';
    g.beginPath();
    g.moveTo(64, 8);
    g.bezierCurveTo(96, 48, 104, 84, 64, 120);
    g.bezierCurveTo(24, 84, 32, 48, 64, 8);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Subtle paper fibre. */
export function fiberTexture(): THREE.Texture {
  return memo('fiber', () => {
    const { c, g } = canvas(256);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      g.globalAlpha = 0.04 + Math.random() * 0.07;
      g.strokeStyle = Math.random() > 0.5 ? '#d8d2c4' : '#ffffff';
      g.beginPath();
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 8);
      g.stroke();
    }
    g.globalAlpha = 1;
    return toTexture(c, 1);
  });
}

/** Vertical background gradient. */
export function gradientTexture(top: string, bottom: string): THREE.Texture {
  const key = `grad:${top}:${bottom}`;
  return memo(key, () => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function disposeTextureCache(): void {
  cache.forEach((t) => t.dispose());
  cache.clear();
}
