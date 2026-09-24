import type { Stage, StageId } from '../game/GameState';
import { PrepareStage } from './PrepareStage';
import { CleanStage } from './CleanStage';
import { BreakStage } from './BreakStage';
import { ArrangeStage } from './ArrangeStage';
import { RollStage } from './RollStage';
import { FinishedStage } from './FinishedStage';
import { SmokeStage } from './SmokeStage';
import { FinalStage, FreeRoamStage, IntroStage } from './IdleStages';

export function createStages(): { [K in StageId]: Stage } {
  return {
    INTRO: new IntroStage(),
    PREPARE: new PrepareStage(),
    CLEAN: new CleanStage(),
    BREAK: new BreakStage(),
    ARRANGE: new ArrangeStage(),
    ROLL: new RollStage(),
    FINISHED: new FinishedStage(),
    SMOKE: new SmokeStage(),
    FINAL: new FinalStage(),
    FREE_ROAM: new FreeRoamStage(),
  };
}
