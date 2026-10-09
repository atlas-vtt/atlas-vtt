import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { App } from 'obsidian';
import type { StatblockItem, StatblockLayout, StatblockMonster } from './statblockTypes';
import { runCallback } from './layoutCallbacks';
import { isVisible, slugify, stringify } from './statblockUtils';
import { boundedStatblock } from '../../../creatures/statblockValues';
import { linkDiceIn } from '../../../services/statblockDiceLinks';
import { StatblockEditContext, type StatblockEditApi } from './statblockEditContext';
import {
  HeadingBlock,
  ImageBlock,
  PropertyBlock,
  SavesBlock,
  SectionHeading,
  SpellsBlock,
  SubheadingBlock,
  TableBlock,
  TextBlock,
  TraitsBlock,
} from './StatblockBlocks';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import './statblock.scss';

export interface StatblockPortrait {
  src: string;
  ringColor?: string | undefined;
  showRing?: boolean | undefined;
}

export interface StatblockRendererProps {
  monster: StatblockMonster;
  layout: StatblockLayout;
  /** Resolves nested `layout` blocks by id/name. */
  resolveLayout?: ((id: string) => StatblockLayout | null) | undefined;
  app?: App | undefined;
  sourcePath?: string | undefined;
  /** Enables click-to-edit on values backed by note frontmatter. */
  edit?: StatblockEditApi | undefined;
  /** When set, the statblock's image can be clicked to assign a token. */
  onAssignToken?: (() => void) | undefined;
  /** The token this statblock is shown for, pinned to the top right. */
  portrait?: StatblockPortrait | undefined;
  /** The DM screen supplies editable per-token resources in place of imported trackers. */
  footer?: React.ReactNode;
  replaceVitals?: boolean | undefined;
}

interface BlockViewProps extends Omit<StatblockRendererProps, 'layout'> {
  item: StatblockItem;
}

/** `javascript` — layout-supplied code that builds its own DOM. */
function JavaScriptBlock({ item, monster, replaceVitals }: BlockViewProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.replaceChildren();
    let removedVitals = false;
    const node = runCallback<Node | null>(item.code, { monster }, null);
    if (node instanceof Node) {
      el.append(node);
      if (replaceVitals) {
        // Remove only the known Daggerheart resource DOM, retaining other JS content.
        el.querySelectorAll('.adversary-block').forEach((block) => {
          if (block.querySelector('.adversary-name') && block.querySelector('input.stat-value')) {
            const parent = block.parentElement;
            block.remove();
            if (parent?.classList.contains('stat-block') && !parent.childElementCount && !parent.textContent?.trim()) parent.remove();
            removedVitals = true;
          }
        });
      }
      // The layout's script built these nodes and this effect builds them anew: React never owns them.
      linkDiceIn(el);
    }
    el.hidden = removedVitals && !el.textContent?.trim() && !el.querySelector('input, img, canvas, svg, progress, meter');

    return () => el.replaceChildren();
  }, [item.code, monster, replaceVitals]);

  return <div ref={ref} className="atlas-sb-javascript" />;
}

/** `collapse` — a details/summary section. */
function CollapseBlock(props: BlockViewProps): React.JSX.Element {
  const { item, monster } = props;
  const [open, setOpen] = useState(item.open ?? false);

  return (
    <details
      className="atlas-sb-collapse"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{item.heading ?? ''}</summary>
      {(item.nested ?? []).map((nested) => (
        <StatblockBlockView key={nested.id} {...props} item={nested} />
      ))}
      {item.hasRule && <div className="atlas-sb-rule" />}
      <span hidden>{stringify(monster.name)}</span>
    </details>
  );
}

/** `ifelse` — renders the first branch whose condition passes. */
function IfElseBlock(props: BlockViewProps): React.JSX.Element | null {
  const { item, monster } = props;
  const conditions = item.conditions ?? [];

  const branch = conditions.find((condition, index) => {
    if (index === conditions.length - 1 && !condition.condition?.length) return true;
    return runCallback<boolean>(condition.condition, { monster, plugin: null }, false) === true;
  });

  if (!branch) return null;

  return (
    <>
      {branch.nested.map((nested) => (
        <StatblockBlockView key={nested.id} {...props} item={nested} />
      ))}
    </>
  );
}

/** Dispatches a single layout block to its Atlas equivalent. */
export function StatblockBlockView(props: BlockViewProps): React.JSX.Element | null {
  const { item, monster, app, sourcePath, resolveLayout, onAssignToken } = props;

  if (!isVisible(item, monster)) return null;

  const blockProps = { item, monster, app, sourcePath, onAssignToken };
  // Layout hooks travel as data attributes rather than classes so Fantasy
  // Statblocks' own stylesheet (which targets `.property-container`, layout
  // `cls` values and the like) can never leak into this DOM.
  const wrap = (children: React.ReactNode): React.JSX.Element => (
    <div className="atlas-sb-item" data-type={item.type} data-cls={item.cls || undefined}>
      {children}
    </div>
  );
  const nestedViews = (item.nested ?? []).map((nested) => (
    <StatblockBlockView key={nested.id} {...props} item={nested} />
  ));
  const rule = item.hasRule ? <div className="atlas-sb-rule" /> : null;

  switch (item.type) {
    case 'heading':
      return wrap(<HeadingBlock {...blockProps} />);
    case 'subheading':
      return wrap(<SubheadingBlock {...blockProps} />);
    case 'property':
      return wrap(<PropertyBlock {...blockProps} />);
    case 'text':
      return wrap(<TextBlock {...blockProps} />);
    case 'saves':
      return wrap(<SavesBlock {...blockProps} />);
    case 'table':
      return wrap(<TableBlock {...blockProps} />);
    case 'image':
      return wrap(<ImageBlock {...blockProps} />);
    case 'traits':
      return wrap(<TraitsBlock {...blockProps} />);
    case 'spells':
      return wrap(<SpellsBlock {...blockProps} />);
    case 'javascript':
      return wrap(<JavaScriptBlock {...props} />);
    case 'collapse':
      return wrap(<CollapseBlock {...props} />);
    case 'ifelse':
      return <IfElseBlock {...props} />;

    case 'group':
      return wrap(
        <>
          {item.heading && <SectionHeading {...blockProps} />}
          {nestedViews}
          {rule}
        </>,
      );

    case 'inline':
      return wrap(
        <>
          {item.heading && <SectionHeading {...blockProps} />}
          <div className="atlas-sb-inline">
            {nestedViews.map((view) => (
              <div key={view.key} className="atlas-sb-inline-item">
                {view}
              </div>
            ))}
          </div>
          {rule}
        </>,
      );

    case 'layout': {
      const nestedLayout = item.layout ? resolveLayout?.(item.layout) : null;
      if (!nestedLayout?.blocks?.length) return null;
      return wrap(
        <>
          {nestedLayout.blocks.map((nested) => (
            <StatblockBlockView key={nested.id} {...props} item={nested} />
          ))}
        </>,
      );
    }

    // `action` blocks are Fantasy Statblocks' own UI affordances (save/export);
    // Atlas surfaces those elsewhere, so they render nothing here.
    case 'action':
      return null;

    default:
      return null;
  }
}

/**
 * Renders a Fantasy Statblocks creature using Atlas' own components, following
 * the layout the creature is assigned in Fantasy Statblocks.
 */
export function StatblockRenderer({
  monster: statblock,
  layout,
  resolveLayout,
  app,
  sourcePath,
  edit,
  onAssignToken,
  portrait,
  footer,
  replaceVitals,
}: StatblockRendererProps): React.JSX.Element {
  const blocks = useMemo(() => layout.blocks ?? [], [layout]);
  // Whatever route a statblock came by, its blocks read a copy within the limits.
  const monster = useMemo(() => boundedStatblock(statblock), [statblock]);
  const editApi = useMemo(
    (): StatblockEditApi => edit ?? { editable: false, commit: () => undefined },
    [edit],
  );

  return (
    <StatblockEditContext.Provider value={editApi}>
      <div
        className={`atlas-statblock ${editApi.editable ? 'is-editable' : ''}`}
        data-layout={slugify(layout.name ?? '')}
      >
        <div className="atlas-statblock-body">
          {portrait && (
            <TokenPortrait className="atlas-sb-portrait" src={portrait.src} alt="" ringColor={portrait.ringColor} showRing={portrait.showRing} />
          )}
          {blocks.map((item) => (
            <StatblockBlockView
              key={item.id}
              item={item}
              monster={monster}
              app={app}
              sourcePath={sourcePath}
              resolveLayout={resolveLayout}
              onAssignToken={onAssignToken}
              replaceVitals={replaceVitals}
            />
          ))}
          {footer}
        </div>
      </div>
    </StatblockEditContext.Provider>
  );
}

export default StatblockRenderer;
