import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../packages/components/primitives/button';
import { useAtlasSettings } from '../keyboard/useMapHotkeys';
import type { SettingsService, TutorialId } from '../services/SettingsService';
import { useDialogFocus } from './useDialogFocus';
import { placeTutorialCard } from './tutorialPlacement';
import { t } from '../i18n';

/** A screenshot shown above a step's text, for what the user cannot see yet. */
export interface TutorialImage { src: string; alt: string }
export interface TutorialStep { title: string; body: string; selector?: string; image?: TutorialImage }
interface TutorialProps {
  settings?: SettingsService;
  id: TutorialId;
  steps: TutorialStep[];
  /** Names the tour above each step, e.g. "Loot"; "Getting started" by default. */
  label?: string;
  action?: { label: string; onClick: () => void } | undefined;
}
export function Tutorial(props: TutorialProps): React.JSX.Element | null {
  const settings = useAtlasSettings(props.settings);
  if (!settings?.shouldShowTutorial(props.id)) return null;
  return <TutorialCard {...props} settings={settings} />;
}
function TutorialCard({ settings, id, steps, label = t('tour.label'), action }: TutorialProps & { settings: SettingsService }): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  // A tour's steps may change while it shows (a step that no longer applies); stay within them.
  const step = steps[Math.min(index, steps.length - 1)]!;
  const finish = useCallback(() => settings.completeTutorial(id), [settings, id]);
  useDialogFocus(card, finish);
  useEffect(() => {
    const measure = (): void => {
      const target = step.selector ? document.querySelector(step.selector) : null;
      const bounds = target?.getBoundingClientRect();
      setRect(bounds && bounds.width && bounds.height ? bounds : null);
    };
    measure();
    // Follow the asset manager's entrance and resizes without assuming a fixed layout.
    const timer = window.setInterval(measure, 200);
    window.addEventListener('resize', measure);
    return () => { window.clearInterval(timer); window.removeEventListener('resize', measure); };
  }, [step.selector]);
  // Screenshots need room to be read.
  const width = Math.min(step.image ? 440 : 360, window.innerWidth - 32);
  const height = card.current?.offsetHeight ?? 240;
  const placement: React.CSSProperties = rect
    ? { width, ...placeTutorialCard(rect, { width, height }, { width: window.innerWidth, height: window.innerHeight }) }
    : { width, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  return createPortal(
    <div className="atlas-vtt-plugin atlas-vtt-root atlas-onboarding-overlay">
      {rect ? <div className="atlas-onboarding-spotlight" style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }} /> : <div className="atlas-onboarding-dimmer" />}
      <div ref={card} className="atlas-onboarding-card" style={placement} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
        {step.image && <img className="atlas-onboarding-image" src={step.image.src} alt={step.image.alt} />}
        <div className="atlas-onboarding-content">
          <div className="atlas-onboarding-eyebrow">{label} · {index + 1} / {steps.length}</div>
          <h3 id={titleId}>{step.title}</h3>
          <p id={bodyId}>{step.body}</p>
        </div>
        <div className="atlas-onboarding-actions">
          <Button variant="ghost" onClick={finish}>{t('tour.skip')}</Button>
          <div className="atlas-onboarding-actions-end">
            {index > 0 && <Button variant="ghost" onClick={() => setIndex(index - 1)}>{t('common.back')}</Button>}
            {index < steps.length - 1 ? <Button onClick={() => setIndex(index + 1)}>{t('tour.next')}</Button> :
              <Button onClick={() => { finish(); action?.onClick(); }}>{action?.label ?? t('tour.gotIt')}</Button>}
          </div>
        </div>
      </div>
    </div>, document.body,
  );
}
