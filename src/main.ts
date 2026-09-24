import './styles/main.css';
import { Game } from './game/Game';
import { IntroController, type IntroAPI } from './intro/IntroController';

const canvas = document.getElementById('scene') as HTMLCanvasElement | null;

if (!canvas) {
  throw new Error('Scene canvas not found');
}

const game = new Game(canvas);
window.__jointWorkshop = game;

const intro = new IntroController({
  canvas,
  renderer: game.sceneMx.renderer,
  settings: game.settings,
  audio: game.audio,
  onDone: () => game.boot(),
});
window.__jointIntro = intro;

// FOUC fail-safe: the boot shell has covered the page since first paint.
// The intro has now painted at least one frame through the renderer, so the
// shell can go and the (fully styled) app can become visible.
const boot = document.getElementById('app-boot');
boot?.remove();
const app = document.getElementById('app');
if (app) app.style.visibility = 'visible';

declare global {
  interface Window {
    __jointWorkshop?: Game;
    __jointIntro?: IntroAPI;
  }
}