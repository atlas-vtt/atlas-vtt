import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Layers } from 'lucide-react';
import type { FloorsChoice, FloorsRequest } from '../../../../import/uvtt/runUvttGroupImport';
import type { UvttFloor } from '../../../../import/uvtt/importUvttFloors';
import { t } from '../../../../i18n';
import { CloseButton } from '../../primitives/CloseButton';
import { Button } from '../../primitives/button';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../primitives/dialogMotion';
import { LabelTooltip } from '../../primitives/tooltip';
import { useDialogEscape } from '../../primitives/useDialogEscape';

interface UvttFloorsDialogProps {
  request: FloorsRequest;
  /** The GM's answer; null cancels the import. */
  onChoose: (choice: FloorsChoice | null) => void;
}

/** A floor as the dialog edits it: the name typed, and the one suggested for an empty field. */
interface FloorDraft {
  /** Stays with the floor while it moves, so its row keeps focus; file names may repeat. */
  key: number;
  floor: UvttFloor;
  name: string;
  suggested: string;
}

function MoveButton({ label, icon, disabled, onClick }: { label: string; icon: React.ReactNode; disabled: boolean; onClick: () => void }): React.ReactElement {
  return (
    <LabelTooltip side="top" label={label}>
      <button type="button" className="atlas-uvtt-floors__move" disabled={disabled} onClick={onClick}>{icon}</button>
    </LabelTooltip>
  );
}

/**
 * Asks how map files that share a grid are imported: as the floors of one scene, named and
 * stacked here (the top floor listed first, as the level switcher shows them), or each as a
 * scene of its own. Closing it imports nothing.
 */
export function UvttFloorsDialog({ request, onChoose }: UvttFloorsDialogProps): React.ReactElement {
  const windowVariants = useDialogWindowVariants();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [sceneName, setSceneName] = useState(request.sceneName);
  // Bottom first, as levels are stored; listed top first
  const [floors, setFloors] = useState<FloorDraft[]>(() => request.floors.map((floor, key) => ({ key, floor, name: floor.name, suggested: floor.name })));
  const cancel = (): void => onChoose(null);
  useDialogEscape(dialogRef, cancel);

  const rename = (index: number, name: string): void => setFloors((current) => current.map((draft, at) => (at === index ? { ...draft, name } : draft)));
  const move = (index: number, by: 1 | -1): void => setFloors((current) => {
    const target = index + by;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target]!, next[index]!];
    return next;
  });
  const asLevels = (): void => onChoose({
    kind: 'levels',
    sceneName: sceneName.trim() || request.sceneName,
    floors: floors.map((draft) => ({ source: draft.floor.source, name: draft.name.trim() || draft.suggested })),
  });

  const listed = floors.map((draft, index) => ({ draft, index })).reverse();
  return (
    <motion.div
      {...dialogOverlayMotion}
      className="atlas-vtt-root atlas-uvtt-floors-overlay"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) cancel(); }}
    >
      <motion.div
        ref={dialogRef}
        className="atlas-uvtt-floors"
        variants={windowVariants}
        role="dialog"
        aria-modal="true"
        aria-labelledby="atlas-uvtt-floors-title"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="atlas-uvtt-floors__header">
          <h3 id="atlas-uvtt-floors-title"><Layers /> {t('uvttFloors.title', { count: floors.length })}</h3>
          <CloseButton onClick={cancel} />
        </div>
        <div className="atlas-uvtt-floors__body">
          <label className="atlas-uvtt-floors__field">
            <span className="atlas-uvtt-floors__label">{t('uvttFloors.sceneName')}</span>
            <input
              type="text"
              className="atlas-uvtt-floors__input"
              value={sceneName}
              placeholder={request.sceneName}
              onChange={(event) => setSceneName(event.target.value)}
              autoFocus
            />
          </label>
          <div className="atlas-uvtt-floors__field">
            <span className="atlas-uvtt-floors__label" id="atlas-uvtt-floors-levels">{t('uvttFloors.levels')}</span>
            <ol className="atlas-uvtt-floors__list" aria-labelledby="atlas-uvtt-floors-levels">
              {listed.map(({ draft, index }) => {
                const name = draft.name.trim() || draft.suggested;
                return (
                  <li key={draft.key} className="atlas-uvtt-floors__floor">
                    <div className="atlas-uvtt-floors__names">
                      <input
                        type="text"
                        className="atlas-uvtt-floors__input"
                        value={draft.name}
                        placeholder={draft.suggested}
                        aria-label={t('levels.name', { name })}
                        onChange={(event) => rename(index, event.target.value)}
                      />
                      <span className="atlas-uvtt-floors__file">{draft.floor.source.fileName}</span>
                    </div>
                    <MoveButton label={t('levels.moveUp', { name })} icon={<ArrowUp />} disabled={index === floors.length - 1} onClick={() => move(index, 1)} />
                    <MoveButton label={t('levels.moveDown', { name })} icon={<ArrowDown />} disabled={index === 0} onClick={() => move(index, -1)} />
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
        <div className="atlas-uvtt-floors__footer">
          <Button variant="outline" size="sm" onClick={() => onChoose({ kind: 'scenes' })}>{t('uvttFloors.asScenes', { count: floors.length })}</Button>
          <Button variant="default" size="sm" onClick={asLevels}>{t('uvttFloors.asLevels')}</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
