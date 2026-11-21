import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { visibleViewport } from '../host/visibleViewport';
import { createPortal } from 'react-dom';
import { Button } from '../packages/components/primitives/button';
import { useAtlasSettings } from '../keyboard/useMapHotkeys';
import type { SettingsService, TutorialId } from '../services/SettingsService';
import { useDialogFocus } from './useDialogFocus';
import { useTutorialTarget } from './useTutorialTarget';
import { placeTutorialCard } from './tutorialPlacement';
import { t } from '../i18n';
import { portalHost } from '../host/portalHost';

/** A screenshot shown above a step's text, for what the user cannot see yet. */
export interface TutorialImage { src: string; alt: string }
export interface TutorialStep {
  title: string;
  body: string;
  /** The element the step points at; without one, or while it is not on screen, the card stands in the middle. */
  selector?: string;
  image?: TutorialImage;
  /** Keys shown as key caps under the text, in the user's own bindings. */
  keys?: readonly string[];
}
interface TutorialProps {
  settings?: SettingsService | undefined;
  id: TutorialId;
  steps: TutorialStep[];
  /** Names the tour above each step, e.g. "Loot"; "Getting started" by default. */
  label?: string;
  action?: { label: string; onClick: () => void } | undefined;
  /** Where the steps' selectors are looked up: the tour's own view, so a second map beside it is never pointed at. */
  root?: ParentNode | null | undefined;
}
export function Tutorial(props: TutorialProps): React.JSX.Element | null {
  const settings = useAtlasSettings(props.settings);
  if (!settings?.shouldShowTutorial(props.id) || props.steps.length === 0) return null;
  return <TutorialCard {...props} settings={settings} />;
}
function TutorialCard({ settings, id, steps, label = t('tour.label'), action, root }: TutorialProps & { settings: SettingsService }): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  // A tour's steps may change while it shows (a step that no longer applies); stay within them.
  const at = Math.min(index, steps.length - 1);
  const step = steps[at]!;
  const last = at === steps.length - 1;
  const rect = useTutorialTarget(step.selector, root);
  const finish = useCallback(() => settings.completeTutorial(id), [settings, id]);
  const next = useCallback(() => {
    if (!last) { setIndex(at + 1); return; }
    finish();
    action?.onClick();
  }, [last, at, finish, action]);
  useDialogFocus(card, finish);
  // The step's main button keeps the focus, so Enter always goes on.
  useEffect(() => { card.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(); }, [at]);
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
    else if (event.key === 'ArrowLeft' && at > 0) { event.preventDefault(); setIndex(at - 1); }
  };
  // Screenshots need room to be read.
  const seen = visibleViewport(window);
  const width = Math.min(step.image ? 440 : 360, seen.right - 32);
  const height = card.current?.offsetHeight ?? 240;
  const placement: React.CSSProperties = rect
    ? { width, ...placeTutorialCard(rect, { width, height }, { width: seen.right, height: seen.bottom }) }
    : { width, left: (seen.right - width) / 2, top: Math.max(16, (seen.bottom - height) / 2) };
  return createPortal(
    <div className="atlas-vtt-plugin atlas-vtt-root atlas-onboarding-overlay">
      <div
        className={`atlas-onboarding-spotlight${rect ? '' : ' atlas-onboarding-spotlight--none'}`}
        style={rect
          ? { left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }
          : { left: seen.right / 2, top: seen.bottom / 2, width: 0, height: 0 }}
      />
      <div ref={card} className="atlas-onboarding-card" style={placement} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} onKeyDown={onKeyDown}>
        {step.image && <img className="atlas-onboarding-image" src={step.image.src} alt={step.image.alt} />}
        <div className="atlas-onboarding-content">
          <div className="atlas-onboarding-eyebrow">
            <span>{label}</span>
            {steps.length > 1 && (
              <span className="atlas-onboarding-progress">
                <span className="atlas-onboarding-progress__label">{t('tour.progress', { step: at + 1, total: steps.length })}</span>
                {steps.map((_, i) => <span key={i} aria-hidden="true" className={dotClassName(i, at)} />)}
              </span>
            )}
          </div>
          <div className="atlas-onboarding-step" key={at}>
            <h3 id={titleId}>{step.title}</h3>
            <p id={bodyId}>{step.body}</p>
            {step.keys && step.keys.length > 0 && (
              <div className="atlas-onboarding-keys">{step.keys.map(key => <kbd key={key}>{key}</kbd>)}</div>
            )}
          </div>
        </div>
        <div className="atlas-onboarding-actions">
          {(!last || action) && <Button variant="ghost" onClick={finish}>{last ? t('tour.notNow') : t('tour.skip')}</Button>}
          <div className="atlas-onboarding-actions-end">
            {at > 0 && <Button variant="ghost" onClick={() => setIndex(at - 1)}>{t('common.back')}</Button>}
            <Button key={last ? 'done' : 'next'} data-autofocus onClick={next}>{last ? action?.label ?? t('tour.gotIt') : t('tour.next')}</Button>
          </div>
        </div>
      </div>
    </div>, portalHost(),
  );
}

function dotClassName(dot: number, current: number): string {
  if (dot === current) return 'atlas-onboarding-dot is-current';
  if (dot < current) return 'atlas-onboarding-dot is-done';
  return 'atlas-onboarding-dot';
}
