import React, { useEffect, useState } from 'react';
import type { DiceSet } from '../../../../types/diceSetTypes';
import type { DiceSets } from '../../../hooks/useDiceSets';
import { t } from '../../../../i18n';
import { DiceSetList } from './DiceSetList';
import { LabWorkspace } from './LabWorkspace';
import type { NewSetStart } from './useLabSet';

interface DiceLabProps {
  diceSets: DiceSets;
  /** The set shown first: the one in use where the lab opens. */
  initialId?: string | undefined;
}

/** What the lab has open: a set of the library, or a new set (`id` null) not made yet. */
interface Opened {
  /** Changes whenever another set is opened: the workspace starts anew. */
  session: number;
  id: string | null;
  start: NewSetStart;
}

const NO_START: NewSetStart = { name: '', crit: 'natural' };

/**
 * The dice lab: the vault's dice sets in a sidebar, the open set's options
 * under them, and its dice on a tray beside them. Sets are made, duplicated
 * and deleted in the sidebar; built-in sets are duplicated to be changed. The
 * library is the vault's, so the lab shows every set whichever collection or
 * template it was opened from.
 */
export function DiceLab({ diceSets, initialId }: DiceLabProps): React.ReactElement {
  const { service, sets } = diceSets;
  const [opened, setOpened] = useState<Opened>(() => ({
    session: 0,
    id: sets.find((set) => set.id === initialId)?.id ?? sets[0]?.id ?? null,
    start: NO_START,
  }));
  const set = opened.id === null ? null : sets.find((entry) => entry.id === opened.id) ?? null;

  const select = (id: string | null, start: NewSetStart = NO_START): void => {
    setOpened((now) => ({ session: now.session + 1, id, start }));
  };

  // The open set was deleted (on another device, or by a sync): the lab opens the first one.
  const gone = opened.id !== null && set === null;
  useEffect(() => {
    if (gone) select(sets[0]?.id ?? null);
  }, [gone, sets]);

  const create = (): void => {
    if (service) select(null, { name: service.freeName(t('diceLab.newSetName')), crit: 'natural' });
  };
  const duplicate = (source: DiceSet): void => {
    const copy = service?.duplicate(source.id, (name) => t('diceLab.copyName', { name }));
    if (copy) select(copy.id);
  };
  const remove = (target: DiceSet): void => {
    service?.delete(target.id);
    if (target.id === opened.id) select(sets.find((entry) => entry.id !== target.id)?.id ?? null);
  };

  return (
    <div className="atlas-dice-lab">
      <DiceSetList
        sets={sets}
        selectedId={opened.id}
        newSetName={opened.id === null ? opened.start.name : null}
        canEdit={service !== null}
        onSelect={(id) => { if (id !== opened.id) select(id); }}
        onCreate={create}
        onDuplicate={duplicate}
        onDelete={remove}
      />
      {!gone && (
        <LabWorkspace
          key={opened.session}
          service={service}
          set={set}
          start={opened.start}
          // Made from its first die: the same workspace goes on with it
          onCreated={(created) => setOpened((now) => ({ ...now, id: created.id }))}
          onDuplicate={duplicate}
        />
      )}
    </div>
  );
}
