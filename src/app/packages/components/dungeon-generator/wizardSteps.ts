import { type MessageKey, t } from '../../../i18n';

/** The wizard's steps, in the order a dungeon is made. */
export const WIZARD_STEPS = ['theme', 'layout', 'features', 'style', 'name'] as const;
export type WizardStep = typeof WIZARD_STEPS[number];

/** A step's short name, for the progress marks. */
export const stepName = (step: WizardStep): string => t(`dungeon.step.${step}` as MessageKey);

/** The question a step asks, its heading. */
export const stepTitle = (step: WizardStep): string => t(`dungeon.step.${step}.title` as MessageKey);
