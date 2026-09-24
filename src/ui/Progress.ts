import type { ProgressUI, StageId } from '../game/GameState';
import { PROGRESS_STEP } from '../game/constants';

export function createProgress(): ProgressUI {
  const steps = Array.from(
    document.querySelectorAll<HTMLElement>('.progress .step[data-stage]'),
  );

  const setStage = (stage: StageId): void => {
    const current = PROGRESS_STEP[stage];
    if (current === undefined) return;

    for (const step of steps) {
      const stepStage = step.dataset.stage as StageId | undefined;
      if (!stepStage) continue;
      const stepNum = PROGRESS_STEP[stepStage];
      if (stepNum === undefined) continue;
      step.classList.toggle('done', stepNum < current);
      step.classList.toggle('active', stepNum === current);
      step.classList.toggle('locked', stepNum > current);
      if (stepNum === current) {
        step.setAttribute('aria-current', 'step');
      } else {
        step.removeAttribute('aria-current');
      }
    }
  };

  return { setStage };
}