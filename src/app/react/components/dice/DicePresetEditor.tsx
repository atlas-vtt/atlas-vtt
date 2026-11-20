import React, { useId, useRef, useState } from 'react';
import { cn } from '../../../../utils/cn';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import { Check, ChevronDown } from 'lucide-react';
import { setRoll } from '../../../gameSystems/diceSets';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { ADVANTAGE_SIDES } from '../../../tools/diceAdvantage';
import type { DicePreset } from '../../../types/dicePresetTypes';
import { CritRuleField } from '../collection-settings/CritRuleField';
import { ExplodingDiceFields } from '../collection-settings/ExplodingDiceFields';
import { AdvantageRuleField } from '../collection-settings/dice-lab/AdvantageRuleField';
import { DiceTray as LabDiceTray } from '../collection-settings/dice-lab/DiceTray';
import { edgeDiceOf, edgeRuleWith, groupsOfDice } from '../collection-settings/dice-lab/labDice';
import { DiceTrayModifier } from './DiceTrayModifier';
import { MAX_PRESET_NAME } from './diceShelf';
import { TRAY_TOOLTIP_GAP, clampModifier } from './diceTrayPool';
import { usePresetDraft } from './usePresetDraft';
import { t } from '../../../i18n';

interface DicePresetEditorProps {
  preset: DicePreset;
  onSave: (preset: DicePreset) => void;
  onClose: () => void;
}

/**
 * A saved roll's editor, floating above the saved rolls in their look: its name and Done on top, then its dice as
 * the Dice Lab lays them out (a click fans out sides, name, colour, copy and remove; + adds a die; a drag moves
 * one), its bonus, and the Dice Lab's rules (critical, exploding, advantage) folded away. A roll written as a
 * formula the dice cannot show (`4d6kh3`) keeps its formula field instead. Escape steps back through a die's fan
 * first, then closes it; every change is written as the Dice Lab writes a set.
 */
export function DicePresetEditor({ preset, onSave, onClose }: DicePresetEditorProps): React.ReactElement {
  const { draft, edit } = usePresetDraft(preset, onSave);
  // Above the saved rolls: moved back off a side of the view, its height capped to the room above.
  const card = useRef<HTMLElement>(null);
  const keepInView = useKeepInView(card, true, 'top');
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesId = useId();
  const groups = groupsOfDice(draft.dice);
  const edgeDice = edgeDiceOf(draft);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  return (
    <section
      ref={card}
      className={cn('atlas-dice-presets__card atlas-dice-preset-editor', keepInView.capped && 'atlas-keep-in-view--capped')}
      style={keepInView.style}
      aria-label={t('diceRoll.presetEdit', { name: preset.name })}
      // A die's step panel (sides, name, colour) may open past the card, not only over its dice
      data-step-frame=""
      onKeyDown={onKeyDown}
    >
      <div className="atlas-dice-preset-editor__head">
        <input
          className="atlas-dice-presets__field atlas-dice-preset-editor__name"
          value={draft.name}
          maxLength={MAX_PRESET_NAME}
          placeholder={t('diceRoll.presetName')}
          aria-label={t('diceRoll.presetName')}
          aria-invalid={draft.name.trim() === '' ? true : undefined}
          onChange={(event) => edit({ name: event.target.value }, 'typing')}
        />
        <LabelTooltip label={t('diceRoll.rowDone')} sideOffset={TRAY_TOOLTIP_GAP}>
          <button type="button" className="atlas-dice-presets__icon atlas-dice-preset-editor__done" aria-label={t('diceRoll.rowDone')} onClick={onClose}>
            <Check aria-hidden="true" />
          </button>
        </LabelTooltip>
      </div>

      {preset.look ? (
        <>
          <div className="atlas-dice-preset-editor__stage">
            <LabDiceTray
              dice={draft.dice}
              editable
              compact
              setName={draft.name}
              onDice={(dice, pace) => edit({ dice }, pace)}
              edgeDice={edgeDice}
              onEdgeDie={(side, change, pace) => {
                const edge = edgeDice.find((entry) => entry.side === side);
                edit({ [side]: change && edge ? edgeRuleWith(edge.die, change) : undefined }, pace);
              }}
            />
          </div>

          {/* One row: the bonus as the tray's formula bar, and the switch that unfolds the rules under it. */}
          <div className="atlas-dice-preset-editor__row">
            <div className="atlas-dice-tray__entry atlas-dice-preset-editor__bonus">
              <span className="atlas-dice-preset-editor__bonus-label">{t('diceRoll.presetBonus')}</span>
              <DiceTrayModifier
                value={draft.bonus}
                onChange={(bonus) => edit({ bonus: clampModifier(bonus) }, 'now')}
                onStep={(delta) => edit({ bonus: clampModifier(draft.bonus + delta) }, 'now')}
              />
            </div>
            <button
              type="button"
              className="atlas-dice-tray__history-toggle atlas-dice-preset-editor__rules-toggle"
              aria-expanded={rulesOpen}
              aria-controls={rulesId}
              onClick={() => setRulesOpen(!rulesOpen)}
            >
              <span className="atlas-dice-tray__history-title">{t('diceRoll.presetRules')}</span>
              <ChevronDown aria-hidden="true" className="atlas-dice-tray__history-chevron" />
            </button>
          </div>
          <div id={rulesId} className="atlas-dice-tray__history-reveal" data-open={rulesOpen ? '' : undefined} inert={!rulesOpen}>
            <div className="atlas-dice-tray__history atlas-dice-preset-editor__rules">
              <CritRuleField crit={draft.crit} onChange={(crit) => edit({ crit }, 'now')} />
              <ExplodingDiceFields
                dice={{ defaultRoll: groups.length > 0 ? setRoll(groups) : '', crit: draft.crit, ...(draft.explode && { explode: draft.explode }) }}
                onChange={(next) => edit({ explode: next.explode }, next.explode?.dice === draft.explode?.dice ? 'typing' : 'now')}
              />
              {ADVANTAGE_SIDES.map((side) => (
                <AdvantageRuleField key={side} side={side} rule={draft[side]} dice={groups} disabled={false}
                  onChange={(rule, pace) => edit({ [side]: rule }, pace)} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <input
          className="atlas-dice-presets__field atlas-dice-presets__field--formula atlas-dice-preset-editor__formula"
          value={draft.formula}
          aria-label={t('diceRoll.presetFormula')}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => edit({ formula: event.target.value }, 'typing')}
        />
      )}
    </section>
  );
}
