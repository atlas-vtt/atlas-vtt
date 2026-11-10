import React from 'react';
import type { Trait } from './statblockTypes';
import { runCallback } from './layoutCallbacks';
import { signed, slugify, stringify, toTitleCase, trimLabel } from './statblockUtils';
import { SectionHeading, type BlockProps } from './StatblockBlocks';
import { StatblockMarkdown } from '../../../statblocks/render/shared/StatblockMarkdown';
import { EntryLine } from '../../../statblocks/render/shared/EntryLine';
import { spellGroups } from '../../../statblocks/render/shared/spellGroups';
import { t } from '../../../i18n';

/** `saves` — a list of save/skill pairs. */
export function SavesBlock({ item, monster, app, sourcePath }: BlockProps): React.JSX.Element | null {
  const raw = monster[item.properties?.[0] ?? ''];
  const entries: unknown[] = Array.isArray(raw) ? raw : [];
  if (!entries.length) return null;

  const resolved = entries.map((save) => runCallback(item.callback, { monster, property: save }, save));

  const text = resolved
    .map((save) => {
      if (typeof save === 'string') return save;
      if (save && typeof save === 'object') {
        return Object.entries(save as Record<string, unknown>)
          .map(([key, value]) =>
            typeof value === 'number'
              ? `${toTitleCase(key)} ${signed(value)}`
              : `${toTitleCase(key)} ${stringify(value)}`,
          )
          .join(', ');
      }
      return stringify(save);
    })
    .filter(Boolean)
    .join(', ');

  if (!text.length) return null;

  return (
    <div className="atlas-sb-property" data-prop={slugify(item.properties?.[0] ?? '') || undefined}>
      <span className="atlas-sb-property-name">
        {trimLabel(item.display ?? toTitleCase(item.properties?.[0] ?? ''))}
      </span>
      <StatblockMarkdown text={text} app={app} sourcePath={sourcePath} />
    </div>
  );
}

/** A single trait/feature: bolded name followed by its description. */
function TraitLine({
  trait,
  item,
  monster,
  app,
  sourcePath,
  index,
}: BlockProps & { trait: unknown; index: number }): React.JSX.Element | null {
  // A statblock is the user's own text: an entry may be a word or a pair, which a layout's callback
  // can draw, and a name or a description a number, a list or a map
  const named: Trait = isTrait(trait) ? trait : {};
  const desc = stringify(runCallback<unknown>(item.callback, { monster, property: trait }, named.desc ?? ''), ' ', false);
  const name = stringify(named.name, ' ', false);
  if (!name && !desc) return null;
  const property = item.properties?.[0] ?? '';
  const canEdit = !item.callback && property.length > 0;

  return (
    <EntryLine
      name={name}
      text={desc}
      app={app}
      sourcePath={sourcePath}
      markdown={item.markdown ?? true}
      editPaths={canEdit ? { name: [property, index, 'name'], text: [property, index, 'desc'] } : undefined}
    />
  );
}

function isTrait(entry: unknown): entry is Trait {
  return typeof entry === 'object' && entry !== null && !Array.isArray(entry);
}

/** `traits` — a titled list of features, actions, reactions, etc. */
export function TraitsBlock({ item, monster, app, sourcePath }: BlockProps): React.JSX.Element | null {
  const raw = monster[item.properties?.[0] ?? ''];
  const entries: unknown[] = Array.isArray(raw) ? raw : [];
  if (!entries.length) return null;

  return (
    <div className="atlas-sb-traits">
      <SectionHeading item={item} monster={monster} app={app} />
      {item.subheadingText && <div className="atlas-sb-text">{item.subheadingText}</div>}
      {entries.map((entry, index) => (
        // An empty list item is null
        entry == null ? null : (
          <TraitLine
            key={index}
            trait={entry}
            index={index}
            item={item}
            monster={monster}
            app={app}
            sourcePath={sourcePath}
          />
        )
      ))}
    </div>
  );
}

/** `spells` — spell lists, grouped under their header lines. */
export function SpellsBlock({ item, monster, app, sourcePath }: BlockProps): React.JSX.Element | null {
  const raw = monster[item.properties?.[0] ?? ''];
  const entries = Array.isArray(raw) ? raw : [];
  if (!entries.length) return null;

  const groups = spellGroups(entries, `${stringify(monster.name)} knows the following spells:`, (value) => stringify(value));

  return (
    <div className="atlas-sb-traits">
      {groups.map((group, groupIndex) => (
        <React.Fragment key={group.header}>
          {groupIndex === 0 && (
            <div className="atlas-sb-section-heading">
              {item.heading ?? t('statblock.spellcasting')}
              <div className="atlas-sb-rule" />
            </div>
          )}
          <div className="atlas-sb-trait">
            <StatblockMarkdown text={group.header} app={app} sourcePath={sourcePath} />
          </div>
          <ul className="atlas-sb-spells">
            {group.spells.map((spell, index) => (
              <li key={`${spell.level ?? ''}-${index}`}>
                {spell.level && <span className="atlas-sb-spell-level">{spell.level}: </span>}
                <StatblockMarkdown text={spell.spells} app={app} sourcePath={sourcePath} />
              </li>
            ))}
          </ul>
        </React.Fragment>
      ))}
    </div>
  );
}
