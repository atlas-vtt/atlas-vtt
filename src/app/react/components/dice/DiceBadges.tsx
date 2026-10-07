import React from 'react';
import { cn } from '../../../../utils/cn';
import { dieLabel } from '../../../tools/diceLabels';
import { shownTag, type ShownTag } from '../../../tools/diceTags';
import type { DiceRollResult } from '../../../types/diceTypes';

/** The class names of one place that lists dice: the dice log's entries or the toasts. */
export interface DiceBadgeClasses {
  /** One die, e.g. `d6: 4`; `--max` and `--min` mark its extremes. */
  badge: string;
  /** The dice of one tag, its tag first. */
  group: string;
  /** A tag: its colour's dot and its name. */
  tag: string;
}

interface TagGroup {
  tag: ShownTag | null;
  indices: number[];
}

/** The dice by tag, in the order each tag first shows; untagged dice together, where the first of them shows. */
function tagGroups(rolls: DiceRollResult['rolls']): TagGroup[] {
  const groups = new Map<string, TagGroup>();
  rolls.forEach((roll, index) => {
    const tag = shownTag(roll);
    const key = tag?.key ?? '';
    const group = groups.get(key) ?? { tag, indices: [] };
    group.indices.push(index);
    groups.set(key, group);
  });
  return [...groups.values()];
}

function DieBadge({ result, index, classes }: { result: DiceRollResult; index: number; classes: DiceBadgeClasses }): React.ReactElement {
  const roll = result.rolls[index]!;
  return (
    <span className={cn(classes.badge, roll.value === roll.max && `${classes.badge}--max`, roll.value === 1 && `${classes.badge}--min`)}>
      {dieLabel(result.rolls, index)}
    </span>
  );
}

/**
 * The dice of a roll, one badge each. Tagged dice (a colour and its name, `diceTags.ts`) are grouped
 * under their tag, a dot of the colour and the name in text; a roll without tags lists its dice as
 * it always did. Each badge keeps its die's place in the roll, which an explosion's mark reads.
 */
export function DiceBadges({ result, classes }: { result: DiceRollResult; classes: DiceBadgeClasses }): React.ReactElement {
  const groups = tagGroups(result.rolls);
  if (groups.every((group) => group.tag === null)) {
    return <>{result.rolls.map((_, i) => <DieBadge key={i} result={result} index={i} classes={classes} />)}</>;
  }
  return (
    <>
      {groups.map(({ tag, indices }) => (
        <span key={tag?.key ?? ''} className={classes.group}>
          {tag && (
            <span className={classes.tag}>
              {tag.color && <span className={`${classes.tag}-dot`} style={{ '--atlas-die-tag-colour': tag.color } as React.CSSProperties} aria-hidden="true" />}
              {tag.label}
            </span>
          )}
          {indices.map((i) => <DieBadge key={i} result={result} index={i} classes={classes} />)}
        </span>
      ))}
    </>
  );
}
