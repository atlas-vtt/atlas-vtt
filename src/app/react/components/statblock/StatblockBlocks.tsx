import React from 'react';
import type { App } from 'obsidian';
import type { StatblockItem, StatblockMonster } from './statblockTypes';
import {
  abilityModifier,
  headingText,
  propertyText,
  slugify,
  stringify,
  trimLabel,
} from './statblockUtils';
import { StatblockMarkdown } from '../../../statblocks/render/shared/StatblockMarkdown';
import { EditableField } from '../../../statblocks/render/shared/EditableField';
import { DiceText } from '../../../statblocks/render/shared/DiceText';
import { hitPointsAttribute, namesHitPoints } from '../../../statblocks/render/shared/hitPoints';
import { statblockImageSrc } from '../../../statblocks/render/shared/statblockImage';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { diceLinkProps } from '../../../services/statblockDiceLinks';
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
  const hitPoints = namesHitPoints(item.properties?.[0], label);

  return (
    <div className="atlas-sb-property" data-prop={hook} {...hitPointsAttribute(hitPoints)}>
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

/**
 * `table` — ability scores and similar grids, with derived modifiers. A text
 * cell's dice roll ("4d6+3"); a number rolls only through its modifier.
 */
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
            <td key={headers[index] ?? index} data-roll-name={headers[index]}>
              <EditableField
                path={[item.properties?.[0] ?? '', index]}
                value={stringify(value)}
                editable={isEditableScalar(value)}
                label={headers[index] ?? t('statblock.valueN', { n: index + 1 })}
              >
                {typeof value === 'string' ? <DiceText text={value} /> : stringify(value)}
              </EditableField>
              {item.calculate && typeof value === 'number' && (
                <span className="atlas-sb-modifier">
                  {' '}
                  (<ModifierRoll modifier={abilityModifier(value, item, monster)} />)
                </span>
              )}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/** A calculated modifier as a roll: the dice tool adds a bare bonus to the collection's default roll. */
function ModifierRoll({ modifier }: { modifier: string }): React.JSX.Element {
  return <span {...diceLinkProps(modifier)}>{modifier}</span>;
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

  const src = hasImage ? statblockImageSrc(app, raw, sourcePath) : '';

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
