import React from 'react';
import { floorStack, stackOf } from '../../../dungeons/floors/floorStack';
import type { DungeonModel } from '../../../dungeons/model';
import { floorLetter, floorName } from '../../../dungeons/scene/roomKeys';
import { SegmentedControl, type SegmentedOption } from '../primitives/SegmentedControl';
import { t } from '../../../i18n';

interface FloorSwitcherProps {
  /** How many floors the dungeon has; more than one, or nothing is shown. */
  floors: number;
  floor: number;
  onFloor: (floor: number) => void;
  /** The dungeon shown, once there is one: a house's cellar is named so. */
  model?: DungeonModel | null;
}

/** Which floor the preview shows, by its letter (A the entry floor); only for a dungeon of several. */
export function FloorSwitcher({ floors, floor, onFloor, model }: FloorSwitcherProps): React.JSX.Element | null {
  if (floors < 2) return null;
  const stack = model && model.floors.length === floors ? stackOf(model) : floorStack('down', floors);
  const options: SegmentedOption<string>[] = Array.from({ length: floors }, (_, index) => ({
    value: String(index),
    label: floorLetter(index),
    hint: floorName(stack, index),
  }));
  return (
    <SegmentedControl
      className="atlas-dungeon-floor-switcher"
      value={String(floor)}
      options={options}
      onChange={(value) => onFloor(Number(value))}
      ariaLabel={t('dungeon.preview.floor')}
      roving
    />
  );
}
