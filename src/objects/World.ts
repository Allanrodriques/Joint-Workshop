import * as THREE from 'three';
import type { GraphicsLevel, ThemeDef, World as WorldI } from '../game/GameState';
import { QUALITY } from '../game/constants';
import { Desk } from './Desk';
import { Tray } from './Tray';
import { MaterialObject } from './MaterialObject';
import { RollingPaper } from './RollingPaper';
import { Filter } from './Filter';
import { Lighter } from './Lighter';
import { Ashtray } from './Ashtray';
import { DiscardBin } from './DiscardBin';
import { PaperStack } from './PaperStack';
import { FinishedJoint } from './FinishedJoint';
import { SmokeSystem } from './SmokeSystem';
import { ParticleFX } from './ParticleFX';
import { CursorHand } from './CursorHand';
import { ZoneRing } from './ZoneRing';
import { CreatorPlaque } from './CreatorPlaque';

/** Owns every scene object and their per-frame update + disposal. */
export class World implements WorldI {
  readonly tray: Tray;
  readonly bud: MaterialObject;
  readonly paper: RollingPaper;
  readonly filter: Filter;
  readonly joint: FinishedJoint;
  readonly lighter: Lighter;
  readonly ashtray: Ashtray;
  readonly discard: DiscardBin;
  readonly paperStack: PaperStack;
  readonly plaque: CreatorPlaque;

  smoke!: SmokeSystem;
  fx!: ParticleFX;
  readonly cursor = new CursorHand();
  readonly zone = new ZoneRing();

  private desk = new Desk();
  private scene: THREE.Scene;
  private _quality: GraphicsLevel = 'medium';

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.tray = new Tray();
    this.bud = new MaterialObject();
    this.paper = new RollingPaper();
    this.filter = new Filter();
    this.joint = new FinishedJoint();
    this.lighter = new Lighter();
    this.ashtray = new Ashtray();
    this.discard = new DiscardBin();
    this.paperStack = new PaperStack();
    this.plaque = new CreatorPlaque();
  }

  build(): void {
    const g = QUALITY[this._quality];
    this.smoke = new SmokeSystem(QUALITY.high.smoke);
    this.smoke.setDensity(g.smoke / QUALITY.high.smoke);
    this.fx = new ParticleFX(g.fx);

    this.scene.add(this.desk.group);
    this.scene.add(this.tray.group);
    this.scene.add(this.bud.group);
    this.scene.add(this.paper.group);
    this.scene.add(this.filter.group);
    this.scene.add(this.lighter.group);
    this.scene.add(this.ashtray.group);
    this.scene.add(this.discard.group);
    this.scene.add(this.paperStack.group);
    this.scene.add(this.joint.group);
    this.scene.add(this.plaque.group);
    this.scene.add(this.smoke.group);
    this.scene.add(this.fx.group);
    this.scene.add(this.cursor.group);
    this.scene.add(this.zone.group);

    this.paper.setVisible(false);
    this.joint.hide();
    this.cursor.setVisible(false);
    this.zone.hide();
  }

  applyTheme(theme: ThemeDef): void {
    this.desk.setTheme(theme);
  }

  setQuality(g: GraphicsLevel): void {
    this._quality = g;
    if (this.smoke) this.smoke.setDensity(QUALITY[g].smoke / QUALITY.high.smoke);
  }

  reset(): void {
    this.bud.reset();
    this.paper.reset();
    this.paper.setVisible(false);
    this.filter.reset();
    this.joint.reset();
    this.lighter.reset();
    this.smoke.stop();
    this.smoke.reset();
    this.fx.reset();
    this.zone.hide();
    this.cursor.reset();
  }

  update(dt: number, camera: THREE.Camera): void {
    this.bud.update(dt);
    this.paper.update(dt);
    this.lighter.update(dt);
    this.joint.update(dt);
    this.smoke.update(dt, camera);
    this.fx.update(dt);
    this.cursor.update(dt, camera);
    this.zone.update(dt);
  }

  dispose(): void {
    this.desk.dispose();
    this.tray.dispose();
    this.bud.dispose();
    this.paper.dispose();
    this.filter.dispose();
    this.lighter.dispose();
    this.ashtray.dispose();
    this.discard.dispose();
    this.paperStack.dispose();
    this.joint.dispose();
    this.smoke.dispose();
    this.fx.dispose();
    this.cursor.dispose();
    this.zone.dispose();
    this.plaque.dispose();
  }
}