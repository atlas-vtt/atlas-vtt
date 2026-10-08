import React from 'react';
import type { App } from 'obsidian';
import type { StatblockItem, StatblockMonster, Trait } from './statblockTypes';
import { runCallback } from './layoutCallbacks';
import {
  abilityModifier,
  headingText,
  propertyText,
  signed,
  slugify,
  stringify,
  toTitleCase,
  trimLabel,
} from './statblockUtils';
import { StatblockMarkdown } from './StatblockText';
import { EditableValue } from './EditableValue';
import { useStatblockEdit } from './statblockEditContext';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { isHitPointsKey } from '../../../resources/resourceFields';
import { t } from '../../../i18n';

/** Values that map cleanly onto a single editable frontmatter entry. */
function isEditableScalar(value: unknown): boolean {
  return value == null || typeof value === 'string' || typeof value === 'number';
}

export interface BlockProps {
  item: StatblockItem;
  monster: StatblockMonster;
  app?: App | undefined;
  sourcePath?: string | undefined;
  /** When set, the statblock's image can be clicked to assign a token. */
  onAssignToken?: (() => void) | undefined;
}

/** Heading above a group, traits list or text block. */
export function SectionHeading({ item, monster }: BlockProps): React.JSX.Element | null {
  const text = headingText(item, monster);
  if (!text) return null;

  return (
    <div className="atlas-sb-section-heading">
      {text}
      {item.hasRule !== false && <div className="atlas-sb-rule" />}
    </div>
  );
}

/** `heading` — the creature name and any other headline properties. */
export function HeadingBlock({ item, monster, app, sourcePath }: BlockProps): React.JSX.Element {
  const level = Math.min(Math.max(item.size ?? 1, 1), 6);

  return (
    <div className="atlas-sb-heading-row">
      {(item.properties ?? [])
        .filter((property) => property in monster)
        .map((property) =>
          React.createElement(
            `h${level}`,
            { key: property, className: 'atlas-sb-heading', 'data-prop': slugify(property) },
            <EditableField
              path={[property]}
              value={stringify(monster[property])}
              editable={isEditableScalar(monster[property])}
              label={property}
            >
              <StatblockMarkdown
                text={stringify(monster[property])}
                app={app}
                sourcePath={sourcePath}
              />
            </EditableField>,
          ),
        )}
    </div>
  );
}

/** `subheading` — the italic type/alignment line under the name. */
export function SubheadingBlock({
  item,
  monster,
  app,
  sourcePath,
}: BlockProps): React.JSX.Element | null {
  const parts = (item.properties ?? [])
    .filter((property) => property in monster)
    .map((property) => stringify(monster[property], ', ', false));

  if (!parts.length) return null;

  return (
    <div className="atlas-sb-subheading">
      <StatblockMarkdown
        text={parts.join(item.separator ?? ' ')}
        app={app}
        sourcePath={sourcePath}
      />
    </div>
  );
}

/** `property` — a labelled single-line value such as "Armor Class 15". */
export function PropertyBlock({
  item,
  monster,
  app,
  sourcePath,
}: BlockProps): React.JSX.Element | null {
  const text = propertyText(item, monster);
  if (item.conditioned && !text.length) return null;

  const label = trimLabel(item.display ?? item.properties?.[0] ?? '');
  const hook = item.doNotAddClass ? undefined : slugify(item.properties?.[0] ?? '') || undefined;
  const hitPoints = isHitPointsKey(item.properties?.[0] ?? '') || isHitPointsKey(label);

  return (
    <div className="atlas-sb-property" data-prop={hook} data-hit-points={hitPoints ? '' : undefined}>
      <span className="atlas-sb-property-name">{label}</span>
      <EditableField
        path={[item.properties?.[0] ?? '']}
        value={text}
        editable={!item.callback && isEditableScalar(monster[item.properties?.[0] ?? ''])}
        label={label}
      >
        <StatblockMarkdown
          text={text}
          app={app}
          sourcePath={sourcePath}
          markdown={item.markdown ?? true}
        />
      </EditableField>
    </div>
  );
}

/**
 * Wraps a value in an inline editor when the surrounding statblock is editable
 * and the underlying frontmatter value is a simple scalar.
 */
function EditableField({
  path,
  value,
  editable,
  label,
  multiline,
  children,
}: {
  path: Array<string | number>;
  value: string;
  editable: boolean;
  label?: string | undefined;
  multiline?: boolean | undefined;
  children: React.ReactNode;
}): React.JSX.Element {
  const edit = useStatblockEdit();

  if (!edit.editable || !editable || !path.length || path[0] === '') {
    return <>{children}</>;
  }

  return (
    <EditableValue
      value={value}
      multiline={multiline}
      ariaLabel={label}
      onCommit={(next) => edit.commit(path, next)}
    >
      {children}
    </EditableValue>
  );
}

/** `text` — free text, either literal or read from a property. */
export function TextBlock({ item, monster, app, sourcePath }: BlockProps): React.JSX.Element | null {
  let text = item.text?.length ? item.text : stringify(monster[item.properties?.[0] ?? '']);
  if (!item.conditioned && !text.length) {
    text = item.fallback ?? '-';
  }
  if (item.conditioned && !text.length) return null;

  return (
    <>
      {item.heading && <SectionHeading item={item} monster={monster} app={app} />}
      <div className="atlas-sb-text">
        <EditableField
          path={[item.properties?.[0] ?? '']}
          value={text}
          editable={!item.text?.length && isEditableScalar(monster[item.properties?.[0] ?? ''])}
          label={item.properties?.[0]}
          multiline
        >
          <StatblockMarkdown
            text={text}
            app={app}
            sourcePath={sourcePath}
            markdown={item.markdown ?? true}
          />
        </EditableField>
      </div>
    </>
  );
}

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

/** `table` — ability scores and similar grids, with derived modifiers. */
export function TableBlock({ item, monster }: BlockProps): React.JSX.Element | null {
  const raw = monster[item.properties?.[0] ?? ''];
  const values = Array.isArray(raw) ? raw : [];
  if (!values.length) return null;

  const headers = item.headers ?? [];

  return (
    <table className="atlas-sb-table">
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {values.map((value, index) => (
            <td key={headers[index] ?? index}>
              <EditableField
                path={[item.properties?.[0] ?? '', index]}
                value={stringify(value)}
                editable={isEditableScalar(value)}
                label={headers[index] ?? t('statblock.valueN', { n: index + 1 })}
              >
                {stringify(value)}
              </EditableField>
              {item.calculate && typeof value === 'number' && (
                <span className="atlas-sb-modifier">
                  {' '}
                  ({abilityModifier(value, item, monster)})
                </span>
              )}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/** An image address without its percent escapes; one that holds a stray `%` is no escaped address and reads as it stands. */
function decoded(address: string): string {
  try {
    return decodeURIComponent(address);
  } catch {
    return address;
  }
}

/** `image` — creature artwork, and the click target for assigning a token. */
export function ImageBlock({
  item,
  monster,
  app,
  sourcePath,
  onAssignToken,
}: BlockProps): React.JSX.Element | null {
  const raw = item.properties?.map((property) => monster[property]).find((value) => typeof value === 'string');
  const hasImage = typeof raw === 'string' && raw.length > 0;

  let src = '';
  if (hasImage) {
    src = decoded(raw).replace(/(^\[\[|\]\]$)/g, '').split('|')[0] ?? '';
    if (!/^https?:/.test(src) && app) {
      const file = app.metadataCache.getFirstLinkpathDest(src, sourcePath ?? '');
      src = file ? app.vault.getResourcePath(file) : '';
    }
  }

  // With no image and no way to add one, there is nothing to render.
  if (!src && !onAssignToken) return null;

  if (!onAssignToken) {
    return (
      <div className="atlas-sb-image">
        <img src={src} alt={stringify(monster.name)} />
      </div>
    );
  }

  return (
    <div className="atlas-sb-image">
      <LabelTooltip label={src ? t('statblock.changeToken') : t('statblock.assignTokenHint')}>
        <button
          type="button"
          className="atlas-sb-image-button"
          onClick={onAssignToken}
        >
          {src ? (
            <img src={src} alt={stringify(monster.name)} />
          ) : (
            <span className="atlas-sb-image-placeholder">{t('statblock.assignToken')}</span>
          )}
        </button>
      </LabelTooltip>
    </div>
  );
}

/** A single trait/feature: bolded name followed by its description. */
export function TraitLine({
  trait,
  item,
  monster,
  app,
  sourcePath,
  index,
}: BlockProps & { trait: unknown; index?: number }): React.JSX.Element | null {
  // A statblock is the user's own text: an entry may be a word or a pair, which a layout's callback
  // can draw, and a name or a description a number, a list or a map
  const named: Trait = isTrait(trait) ? trait : {};
  const desc = stringify(runCallback<unknown>(item.callback, { monster, property: trait }, named.desc ?? ''), ' ', false);
  const name = stringify(named.name, ' ', false);
  if (!name && !desc) return null;

  const property = item.properties?.[0] ?? '';
  const canEdit = !item.callback && index != null && property.length > 0;

  return (
    <div className="atlas-sb-trait" data-hit-points={isHitPointsKey(name) ? '' : undefined}>
      {name && (
        <span className="atlas-sb-trait-name">
          <EditableField
            path={[property, index as number, 'name']}
            value={name}
            editable={canEdit}
            label={t('statblock.traitName')}
          >
            {name}
          </EditableField>
        </span>
      )}
      <EditableField
        path={[property, index as number, 'desc']}
        value={desc}
        editable={canEdit}
        label={t('statblock.traitDescription')}
        multiline
      >
        <StatblockMarkdown
          text={desc}
          app={app}
          sourcePath={sourcePath}
          markdown={item.markdown ?? true}
        />
      </EditableField>
    </div>
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

  const ensureColon = (header: string): string =>
    /[^a-zA-Z0-9]$/.test(header) ? header : `${header}:`;

  const blocks: Array<{ header: string; spells: Array<{ level?: string; spells: string }> }> = [];

  for (const entry of entries) {
    const isHeader =
      typeof entry === 'string' && (entry.trim().endsWith(':') || !entry.includes(':'));

    if (isHeader) {
      blocks.push({ header: ensureColon(entry), spells: [] });
      continue;
    }

    // A statblock is the user's own text: an empty list item is null, and anything else that names no level is no spell line
    const [level, spells] = typeof entry === 'string' ? [undefined, entry] : Object.entries((entry ?? {}) as object)[0] ?? [];
    if (spells === undefined) continue;
    const spell = { level, spells: stringify(spells) };

    if (!blocks.length) {
      blocks.push({
        header: `${stringify(monster.name)} knows the following spells:`,
        spells: [],
      });
    }
    blocks[blocks.length - 1]!.spells.push(spell as { level?: string; spells: string });
  }

  return (
    <div className="atlas-sb-traits">
      {blocks.map((block, blockIndex) => (
        <React.Fragment key={block.header}>
          {blockIndex === 0 && (
            <div className="atlas-sb-section-heading">
              {item.heading ?? t('statblock.spellcasting')}
              <div className="atlas-sb-rule" />
            </div>
          )}
          <div className="atlas-sb-trait">
            <StatblockMarkdown text={block.header} app={app} sourcePath={sourcePath} />
          </div>
          <ul className="atlas-sb-spells">
            {block.spells.map((spell, index) => (
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
