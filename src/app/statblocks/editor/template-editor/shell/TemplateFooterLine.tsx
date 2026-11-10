import React from 'react';
import type { SessionSnapshot } from '../sessionTypes';
import { t } from '../../../../i18n';

/** The line under the card while nothing else needs it (§12.1). */
export const GESTURE_HINT = t('templateEditor.gestureHint');
export const NEWER_LINE = t('templateEditor.newerTemplate');
export const BUILT_IN_LINE = t('templateEditor.builtInLine');

/** What the line says about the template, else how to work the card. */
function footerLine(snapshot: Pick<SessionSnapshot, 'readOnlyReason' | 'builtIn'>): string {
  if (snapshot.readOnlyReason === 'newer') return NEWER_LINE;
  return snapshot.builtIn ? BUILT_IN_LINE : GESTURE_HINT;
}

/**
 * The template editor's line under the card (§2.4): a template of a newer
 * Atlas, a built-in (which Save keeps as a new template), else the gesture
 * hint. It sits in the footer slot, so nothing in it moves the card.
 */
export function TemplateFooterLine({ snapshot }: { snapshot: Pick<SessionSnapshot, 'readOnlyReason' | 'builtIn'> }): React.JSX.Element {
  return <div className="atlas-te-footer-line"><span>{footerLine(snapshot)}</span></div>;
}
