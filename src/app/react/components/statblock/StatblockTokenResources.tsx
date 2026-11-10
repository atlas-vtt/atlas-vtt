import React, { useId, useLayoutEffect, useMemo, useRef } from 'react';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { resourceUpdate, withCurrent } from '../../../resources/resourceValues';
import { fsQuantityLook, PLAIN_QUANTITY_LOOK, type QuantityLook } from '../../../resources/quantityLooks';
import { tokenQuantities, type TokenQuantity } from '../../../resources/statblockQuantities';
import type { ResourceDefinition } from '../../../resources/resourceTypes';
import type { StatblockLayout, StatblockMonster } from './statblockTypes';
import type { TokenVitals } from '../../../services/statblockVitalsSync';
import { t } from '../../../i18n';

export interface StatblockTokenActions {
  /** The resources of the map's collection. */
  definitions: readonly ResourceDefinition[];
  onLocateToken: (id: string) => void;
  onHoverToken?: (id: string) => void;
  onUpdateToken: (id: string, updates: ReturnType<typeof resourceUpdate>) => void;
}
/**
 * What the statblock draws of its quantities: a native template's look (`templateQuantityLook`),
 * or a Fantasy Statblocks layout, which is read with `fsQuantityLook`.
 */
type QuantitySource = { look: QuantityLook; layout?: never } | { layout: StatblockLayout; look?: never };

export type StatblockTokenResourcesProps = StatblockTokenActions & QuantitySource & {
  monster: StatblockMonster;
  tokens: TokenVitals[];
};
function ResourceControl({ quantity, onChange }: {
  quantity: TokenQuantity;
  onChange: (value: number) => void;
}): React.JSX.Element {
  const { label, fills, boxes, value: { current, max } } = quantity;
  // Boxes mark what is used up: damage on a quantity that drains, the value itself on one that fills.
  const marked = fills ? current : max - current;
  const labelId = useId();
  return (
    <div className="atlas-sb-token-resource">
      <span id={labelId} className="atlas-sb-token-resource-label">{label}{boxes ? ` (${max})` : ''}</span>
      {boxes ? (
        <div className="atlas-sb-token-pips">
          {Array.from({ length: max }, (_, index) => (
            <LabelTooltip key={index} label={t(fills ? 'statblock.pip' : 'statblock.pipDamage', { label, n: index + 1, max })}>
              <input
                type="checkbox"
                checked={index < marked}
                onChange={(event) => {
                  const nextMarked = event.target.checked ? index + 1 : index;
                  onChange(fills ? nextMarked : max - nextMarked);
                }}
              />
            </LabelTooltip>
          ))}
        </div>
      ) : (
        <div className="atlas-sb-token-gauge-controls">
          <LabelTooltip label={t('statblock.decrease', { label })}>
            <Button variant="ghost" size="icon"
              disabled={current <= 0} onClick={() => onChange(current - 1)}><Minus /></Button>
          </LabelTooltip>
          <div className="atlas-sb-token-gauge" role="meter" aria-labelledby={labelId}
            aria-valuemin={0} aria-valuemax={max} aria-valuenow={current}>
            <span className="atlas-sb-token-gauge-fill" style={{ width: `${max > 0 ? current / max * 100 : 0}%` }} />
            <span className="atlas-sb-token-gauge-value">{current} / {max}</span>
          </div>
          <LabelTooltip label={t('statblock.increase', { label })}>
            <Button variant="ghost" size="icon"
              disabled={current >= max} onClick={() => onChange(current + 1)}><Plus /></Button>
          </LabelTooltip>
        </div>
      )}
    </div>
  );
}

export function StatblockTokenResources({ monster, layout, look, definitions, tokens, onLocateToken, onHoverToken, onUpdateToken }: StatblockTokenResourcesProps): React.JSX.Element {
  const quantityLook = useMemo(() => look ?? (layout ? fsQuantityLook(layout) : PLAIN_QUANTITY_LOOK), [look, layout]);
  const listRef = useRef<HTMLDivElement>(null);
  const entryLabelId = useId();
  const identified = tokens.filter((token): token is TokenVitals & { id: string } => Boolean(token.id));
  const scrollable = identified.length > 3;
  const used = new Set<number>();
  // Reserve real map badges before allocating fallback numbers to legacy/colliding entries.
  const reserved = new Set(identified.map((token) => token.instanceNumber).filter((n): n is number => Number.isInteger(n) && Number(n) > 0));
  const entries = identified.map((token) => {
    let number = token.instanceNumber;
    if (!number || !Number.isInteger(number) || number < 1 || used.has(number)) {
      number = 1;
      while (used.has(number) || reserved.has(number)) number++;
    }
    used.add(number);
    return { token, label: `${token.name || monster.name || t('statblock.creature')} #${number}` };
  });

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (!scrollable) { list.style.removeProperty('max-height'); return; }
    const measure = (): void => {
      const first = list.children[0];
      const third = list.children[2];
      if (!(first instanceof HTMLElement) || !(third instanceof HTMLElement)) return;
      // Layout offsets exclude the DM screen entrance animation’s scale transform.
      const height = third.offsetTop + third.offsetHeight - first.offsetTop;
      if (height > 0) list.style.maxHeight = `${height}px`;
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(list);
    Array.from(list.children).slice(0, 3).forEach((child) => observer?.observe(child));
    return () => observer?.disconnect();
  }, [scrollable, tokens, definitions, monster, quantityLook]);

  return (
    <div ref={listRef} className="atlas-sb-token-list" data-scrollable={scrollable}
      onKeyDown={(event) => event.stopPropagation()}>
      {entries.map(({ token, label }) => (
        <div key={token.id} className="atlas-sb-token-entry" role="group" aria-labelledby={`${entryLabelId}-${token.id}`}>
          <LabelTooltip label={t('statblock.locate', { label })}>
            <Button className="atlas-sb-token-name" variant="ghost" size="sm"
              onMouseEnter={() => onHoverToken?.(token.id)} onFocus={() => onHoverToken?.(token.id)}
              onClick={() => onLocateToken(token.id)}>
              <span id={`${entryLabelId}-${token.id}`}>{label}</span><LocateFixed aria-hidden="true" />
            </Button>
          </LabelTooltip>
          {tokenQuantities(monster, quantityLook, token, definitions).map((quantity) => (
            <ResourceControl key={quantity.key} quantity={quantity}
              onChange={(current) => onUpdateToken(token.id, resourceUpdate(token, quantity.key, withCurrent(quantity.value, current), false))} />
          ))}
        </div>
      ))}
    </div>
  );
}
