import React, { useCallback, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { cn } from '../../../../utils/cn';
import { BlockChromeContext } from '../../render/blockChrome';
import { StatblockSheet } from '../../render/StatblockSheet';
import { sampleRecord } from '../../model/sampleValues';
import type { FieldKey, StatblockTemplate } from '../../model/templateTypes';
import type { ConditionMetric, SheetMetrics } from '../../../recovery/editor/recoveryMetrics';
import { metricKey, numberFields } from '../../../recovery/editor/recoveryMetrics';
import { ruleFor } from '../../../recovery/editor/recoveryEdits';
import { scopeKey, scopeName, type RuleScope } from '../../../recovery/editor/recoveryScope';
import { ruleBadge } from '../../../recovery/editor/ruleBadge';
import type { RecoveryButton, RecoveryRuleKind, RecoveryTarget } from '../../../recovery/recoveryTypes';
import type { ResourceDefinition } from '../../../resources/resourceTypes';
import { resourceOfField } from '../../../resources/trackedResources';
import { ConditionChips } from './ConditionChips';
import { recoveryChrome, type SpotShared } from './recoveryChrome';
import { RuleCardLayer } from './RuleCardLayer';
import { RULE_GAP, type Box } from './rulePlacement';
import type { RuleEditing } from './useRuleEditing';
import { useBoxIn, type Spots } from './useSpots';

interface RecoveryStageProps {
  template: StatblockTemplate;
  name: string;
  metrics: SheetMetrics;
  chips: readonly ConditionMetric[];
  resources: readonly ResourceDefinition[];
  button: RecoveryButton | null;
  /** What of the button the spots edit: its own rules, or one action's. */
  scope: RuleScope;
  buttons: readonly RecoveryButton[];
  editing: RuleEditing;
  spots: Spots;
  /** Picks a spot by id: a click, or Enter on it. */
  onPick: (spotId: string, fromKeyboard: boolean) => void;
  onSpotKey: (spotId: string, event: React.KeyboardEvent) => void;
  /** The spot the Tab key stops at, which also opens the tabs that hold it. */
  active: string | null;
  onActive: (spotId: string) => void;
  /** The card's kinds and Remove, which the editor follows with focus. */
  onKind: (kind: RecoveryRuleKind) => void;
  onPickSource: () => void;
  onRemove: () => void;
}

/** A metric's own key, field or id: its name where neither the card nor the chips name it. */
function targetName(target: RecoveryTarget): string {
  switch (target.kind) {
    case 'resource': case 'counters': return target.field;
    case 'condition': return target.id;
  }
}

/** The colour a metric is shown in: its resource's or its condition's; a Counters block has none. */
function targetColor(target: RecoveryTarget, resourceOf: (key: FieldKey) => ResourceDefinition | undefined, chips: readonly ConditionMetric[]): string | undefined {
  switch (target.kind) {
    case 'resource': return resourceOf(target.field)?.color;
    case 'condition': {
      const key = metricKey(target);
      return chips.find((chip) => metricKey(chip.target) === key)?.color;
    }
    case 'counters': return undefined;
  }
}

/** The stage's border, above and below its padding box (atlas-inset-surface). */
const STAGE_BORDERS = 2;

/**
 * The template drawn as a statblock with sample values, its metrics dressed as spots through the
 * renderer's chrome, the collection's valued conditions under it, and the rule card of the
 * picked metric hanging from its row.
 */
export function RecoveryStage(props: RecoveryStageProps): React.ReactElement {
  const { template, name, metrics, chips, resources, button, scope, buttons, editing, spots, onPick, onSpotKey, active, onActive, onKind, onPickSource, onRemove } = props;
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const fields = useMemo(() => sampleRecord(template), [template]);
  const picked = editing.picked;
  const metricBox = useBoxIn(stage, picked ? spots.element(picked.spotId) : null);
  const frame: Box | null = stage ? { left: 0, top: 0, right: stage.clientWidth, bottom: stage.clientHeight } : null;
  // A card taller than the room under its row makes the stage taller while it is open
  const [cardReach, setCardReach] = useState<{ spotId: string; bottom: number } | null>(null);
  const pickedSpot = picked?.spotId ?? null;
  const onReach = useCallback((bottom: number | null): void => {
    // A card that leaves takes back only its own reach
    setCardReach((was) => {
      if (bottom === null) return was?.spotId === pickedSpot ? null : was;
      return was?.spotId === pickedSpot && was.bottom === bottom ? was : { spotId: pickedSpot ?? '', bottom };
    });
  }, [pickedSpot]);

  const nameOf = (target: RecoveryTarget): string => {
    const key = metricKey(target);
    return metrics.metrics.find((metric) => metricKey(metric.target) === key)?.label
      ?? chips.find((chip) => metricKey(chip.target) === key)?.label
      ?? targetName(target);
  };
  const badgeOf = (target: RecoveryTarget): string | null => {
    const rule = button ? ruleFor(button, target, scope) : undefined;
    return rule ? ruleBadge(rule, nameOf) : null;
  };
  const sources = editing.spending && picked
    ? new Set(metrics.metrics.filter((metric) => metricKey(metric.target) !== metricKey(picked.target)).map((metric) => metric.spotId))
    : null;
  const shared: SpotShared = { badgeOf: button ? `${button.id}:${scopeKey(scope)}` : '', register: spots.register, onPick, onKeyDown: onSpotKey, onFocus: onActive };
  const chrome = button
    ? recoveryChrome({ metrics, shared, badgeOf: (metric) => badgeOf(metric.target), picked: picked?.spotId ?? null, sources, tabStop: active })
    : null;
  const pickedLabel = picked ? nameOf(picked.target) : '';
  const color = picked ? targetColor(picked.target, resourceOfField(template, resources), chips) : undefined;
  const canSpend = picked !== null && metrics.metrics.some((metric) => metricKey(metric.target) !== metricKey(picked.target));
  const reveal = active === null ? null : metrics.bySpot.get(active)?.blockId ?? null;

  return (
    <div
      ref={setStage}
      className={cn('atlas-rc-stage', button && 'atlas-rc-stage--picking', picked && 'atlas-focused', editing.spending && 'atlas-spending')}
      // A press on the card beside the picked metric puts it down
      onPointerDown={() => { if (picked) editing.closeAll(); }}
      style={cardReach === null ? undefined : { minHeight: cardReach.bottom + RULE_GAP + STAGE_BORDERS }}
    >
      <div className="atlas-rc-sheet">
        <BlockChromeContext.Provider value={chrome}>
          <StatblockSheet template={template} name={name} fields={fields} variant="full" rollBonuses="preview" reveal={reveal} />
        </BlockChromeContext.Provider>
      </div>
      {chips.length > 0 && (
        <ConditionChips chips={chips} shared={shared} badgeOf={(chip) => badgeOf(chip.target)} picked={picked?.spotId ?? null}
          tabStop={active} order={metrics.metrics.length} pickable={button !== null} />
      )}
      <AnimatePresence>
        {editing.cardOpen && picked && metricBox && frame && button && (
          <RuleCardLayer key={picked.spotId} metricBox={metricBox} frame={frame} onReach={onReach} card={{
            rule: editing.rule,
            metric: pickedLabel,
            color,
            owner: scopeName(button, scope),
            buttons,
            fields: numberFields(template),
            nameOf,
            canSpend,
            focusKind: editing.fromKeyboard,
            onKind,
            onChange: editing.changeRule,
            onPickSource,
            onRemove,
          }} />
        )}
      </AnimatePresence>
    </div>
  );
}
