import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { formatRange } from '../../../../creatures/creatureValues';
import { t } from '../../../../i18n';
import type { TokenAsset } from '../types';
import { TrayPicks } from './TrayPicks';
import type { EncounterPick } from './encounterPicks';
import type { EncounterMetrics } from './encounterMetrics';

interface EncounterTrayProps {
  picks: readonly EncounterPick[];
  metrics: EncounterMetrics;
  saving: boolean;
  onCountChange: (token: TokenAsset, count: number) => void;
  /** Shows a creature's statblock in the feed; null for one the feed cannot show. */
  revealOf: (token: TokenAsset) => (() => void) | null;
  onClear: () => void;
  /** The encounter's name as typed; empty saves it as `defaultName`. */
  name: string;
  defaultName: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }): React.JSX.Element {
  return (
    <LabelTooltip label={hint} describe>
      <span className="atlas-encounter-tray__metric" tabIndex={0}>
        <span className="atlas-encounter-tray__metric-label">{label}</span>
        <span className="atlas-encounter-tray__metric-value">{value}</span>
      </span>
    </LabelTooltip>
  );
}

/** The encounter being built, floating over the feed once it holds a creature: its name, its creatures with their counts, what can be said of it in any system, and Save. */
export function EncounterTray({ picks, metrics, saving, onCountChange, revealOf, onClear, name, defaultName, onNameChange, onSave }: EncounterTrayProps): React.JSX.Element {
  const still = useReducedMotion();
  const away = still ? { opacity: 0 } : { opacity: 0, y: 12 };
  return (
    <motion.footer
      className="atlas-encounter-tray"
      initial={away}
      animate={{ opacity: 1, y: 0 }}
      exit={away}
      transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
    >
      <input
        type="text"
        className="atlas-encounter-tray__name-input"
        value={name}
        placeholder={defaultName}
        aria-label={t('encounter.builder.name')}
        spellCheck={false}
        onChange={(event) => onNameChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || saving) return;
          event.preventDefault();
          onSave();
        }}
      />
      <TrayPicks picks={picks} onCountChange={onCountChange} revealOf={revealOf} />
      <div className="atlas-encounter-tray__summary">
        <span className="atlas-encounter-tray__count">{t('encounter.builder.count', { count: metrics.count })}</span>
        {metrics.rating && (
          <Metric label={metrics.rating.label} value={formatRange(metrics.rating)} hint={t('encounter.builder.ratingHint')} />
        )}
        {metrics.totals.map((total) => (
          <Metric key={total.key} label={total.name} value={String(total.value)} hint={t('encounter.builder.totalHint', { name: total.name })} />
        ))}
        <div className="atlas-encounter-tray__actions">
          <Button variant="ghost" disabled={saving} onClick={onClear}>{t('encounter.builder.clear')}</Button>
          <Button variant="default" disabled={saving} onClick={onSave}>{t('encounter.builder.save')}</Button>
        </div>
      </div>
    </motion.footer>
  );
}
