import React, { useEffect, useRef, useState } from 'react';
import { cn } from 'src/utils/cn';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import { DiceTool } from '../../../tools/DiceTool';
import { DiceTray } from './DiceTray';
import { DicePresetsPanel } from './DicePresetsPanel';
import { useSavedRolls } from './useSavedRolls';
import { DicePresetEditor } from './DicePresetEditor';
import { Tutorial } from '../../../onboarding/Tutorial';
import { savedRollsSteps } from '../../../onboarding/savedRollsTour';
import { t } from '../../../i18n';
import { statusMessage } from './diceTrayStatus';
import type { TrayAdvantage } from './diceTrayStatus';
import { advantageSidesFor, ruledSides } from '../../../tools/diceAdvantage';
import { setRollText } from '../../../gameSystems/diceSets';
import { canRunMapHotkeys } from '../../../keyboard/mapHotkeys';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useShareRolls } from '../../hooks/useShareRolls';
import { useAtlasStore } from '../../ViewStoreContext';

export interface DiceDropdownMenuProps {
  diceTool: DiceTool;
  isOpen: boolean;
  onToggle: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

/** What advantage the collection's dice set offers the tray; undefined where it has no rule. */
function trayAdvantage(diceTool: DiceTool): TrayAdvantage | undefined {
  const rules = diceTool.rollingDice();
  const sides = ruledSides(rules);
  return sides.length > 0
    ? { sides, applies: (formula) => advantageSidesFor(formula, rules).length > 0, dice: setRollText(rules.dice) }
    : undefined;
}

/** This device remembers whether the tray's roll history stands open (a preference of the hand, not of the vault). */
const HISTORY_OPEN_KEY = 'atlas-vtt-dice-tray-history-open';
/** And whether the saved rolls stand open beside the tray. */
const PRESETS_OPEN_KEY = 'atlas-vtt-dice-tray-presets-open';

export function DiceDropdownMenu({ diceTool, isOpen, onToggle, triggerRef }: DiceDropdownMenuProps): React.ReactElement | null {
  const trayRef = useRef<HTMLDivElement>(null);
  const { app, view } = useAtlasUI();
  // The dice log's rolls (the same list the log shows and keeps with the scene), newest first.
  const history = useAtlasStore((state) => state.diceLog) ?? [];
  const [historyOpen, setHistoryOpen] = useState<boolean>(() => app?.loadLocalStorage?.(HISTORY_OPEN_KEY) === true);
  const viewId = (view as { viewId?: string } | null | undefined)?.viewId;
  const keepInView = useKeepInView(trayRef, isOpen, 'top');
  const shareRolls = useShareRolls();
  // Read as the tray opens: it unmounts when closed, so a set changed meanwhile is read anew.
  const advantage = isOpen ? trayAdvantage(diceTool) : undefined;
  const saved = useSavedRolls(diceTool);
  const { shelf, change } = saved;
  const [presetsOpen, setPresetsOpen] = useState<boolean>(() => app?.loadLocalStorage?.(PRESETS_OPEN_KEY) === true);
  const togglePresets = (): void => {
    setPresetsOpen(!presetsOpen);
    app?.saveLocalStorage?.(PRESETS_OPEN_KEY, !presetsOpen);
  };
  // What the tray holds, for the panel's form; read anew as the tray opens.
  const [trayFormula, setTrayFormula] = useState(diceTool.tray.formula);
  useEffect(() => {
    if (isOpen) setTrayFormula(diceTool.tray.formula);
  }, [isOpen, diceTool]);
  const problemOf = (formula: string): string | null => {
    const error = diceTool.checkRoll(formula);
    return error ? statusMessage({ kind: 'invalid', formula, code: error.code, byAdvantage: false }) : null;
  };

  // ── Click-outside ────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent): void => {
      const target = event.target as HTMLElement;
      if (triggerRef?.current?.contains(target)) return;
      // The tray, and the saved rolls' tour over it, which explains the tray and must not close it.
      // A menu a choice of the saved roll's editor opened lies in the document, outside the tray, and is the tray's too.
      if (target.closest('.atlas-dice-tray, .atlas-onboarding-overlay, .atlas-ctx-menu')) return;
      onToggle();
    };

    // The document the tray is in, and its window's timer.
    const doc = trayRef.current?.ownerDocument ?? document;
    const win = doc.defaultView ?? window;
    const timer = win.setTimeout(() => {
      doc.addEventListener('pointerdown', handleClickOutside);
    }, 0);

    return () => {
      win.clearTimeout(timer);
      doc.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [isOpen, onToggle, triggerRef]);

  // Hangs from its toolbar button inside the map view, like the other toolbar
  // dropdowns: it stays in the view's stacking order, so the DM dashboard and
  // the asset manager cover it. Closed, the tray unmounts; the dice tool keeps what it held.
  if (!isOpen) return null;
  return (
    <div
      ref={trayRef}
      className={cn('atlas-dice-tray', keepInView.capped && 'atlas-keep-in-view--capped')}
      style={keepInView.style}
    >
      {presetsOpen && change && (
        <>
          <DicePresetsPanel
            shelf={shelf}
            onChange={change}
            trayFormula={trayFormula}
            problemOf={problemOf}
            onRoll={(preset) => saved.roll(preset)}
            onEdit={saved.setEditing}
            sets={saved.sets}
            editingId={saved.editing?.id ?? null}
          >
            {saved.editing && (
              <DicePresetEditor key={saved.editing.id} preset={saved.editing} onSave={saved.save} onClose={() => saved.setEditing(null)} />
            )}
          </DicePresetsPanel>
          <Tutorial id="savedRolls" root={trayRef.current} label={t('tour.savedRolls.label')} steps={savedRollsSteps()} />
        </>
      )}
      <div className="atlas-dice-panel">
        <DiceTray
          memory={diceTool.tray}
          onRemember={(memory) => diceTool.rememberTray(memory)}
          check={(formula, side) => diceTool.checkRoll(formula, side ? { advantage: side } : undefined)}
          onRoll={({ formula, advantage: side }) => diceTool.rollDice(formula, undefined, undefined, side ? { advantage: side } : undefined) !== null}
          history={history}
          onRepeat={(entry) => diceTool.rollDice(entry.formula, entry.source, undefined, entry.advantage ? { advantage: entry.advantage } : undefined) !== null}
          historyOpen={historyOpen}
          onHistoryOpen={(open) => {
            setHistoryOpen(open);
            app?.saveLocalStorage?.(HISTORY_OPEN_KEY, open);
          }}
          onClose={onToggle}
          mapKeys={(event) => canRunMapHotkeys(event, viewId)}
          advantage={advantage}
          shelf={shelf}
          onShelfChange={change ?? undefined}
          onFormula={setTrayFormula}
          presetsPanel={change ? { open: presetsOpen, onToggle: togglePresets } : undefined}
          onRollPreset={(preset, side) => saved.roll(preset, side)}
          {...(shareRolls && { shareRolls })}
        />
      </div>
    </div>
  );
}
