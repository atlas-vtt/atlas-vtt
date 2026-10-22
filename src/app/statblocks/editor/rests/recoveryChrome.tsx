import React from 'react';
import { isContainerBlock, type FieldKey, type MetricBlock, type TemplateBlock } from '../../model/templateTypes';
import type { BlockChrome, BlockDecoration } from '../../render/blockChrome';
import { numberSpotId, type SheetMetric, type SheetMetrics } from '../../../recovery/editor/recoveryMetrics';
import { MetricSpot, RefusedSpot, type SpotProps } from './MetricSpot';

/** What the spots of the card share; each spot adds its own metric. */
export type SpotShared = Omit<SpotProps, 'spotId' | 'label' | 'badge' | 'order' | 'picked' | 'source' | 'tabbable'>;

export interface RecoveryChromeInput {
  metrics: SheetMetrics;
  shared: SpotShared;
  /** The badge of a metric under the selected button's rule, or null. */
  badgeOf: (metric: SheetMetric) => string | null;
  picked: string | null;
  /** Spots offered as what a Spend rule spends. */
  sources: ReadonlySet<string> | null;
  /** The spot the Tab key stops at. */
  tabStop: string | null;
}

/**
 * How the recovery editor dresses the card (the template editor's seam, `BlockChromeContext`): a
 * metric gets a spot laid over it (each number of a Metric its own), a number nothing restores a
 * spot that says so, and every other block a class that dims it while a metric is picked. Nothing
 * changes a block's box.
 */
export function recoveryChrome({ metrics, shared, badgeOf, picked, sources, tabStop }: RecoveryChromeInput): BlockChrome {
  const order = new Map(metrics.metrics.map((metric, index) => [metric.spotId, index]));
  const pickedBlock = picked === null ? null : metrics.bySpot.get(picked)?.blockId ?? null;
  const spotOf = (spotId: string): React.ReactNode => {
    const metric = metrics.bySpot.get(spotId);
    if (metric) {
      return (
        <MetricSpot
          {...shared}
          spotId={spotId}
          label={metric.label}
          badge={badgeOf(metric)}
          order={order.get(spotId) ?? 0}
          picked={picked === spotId}
          source={sources?.has(spotId) ?? false}
          tabbable={tabStop === spotId}
        />
      );
    }
    return metrics.refused.has(spotId) ? <RefusedSpot /> : null;
  };
  const blockClass = (blockId: string): string => {
    if (pickedBlock === blockId) return 'atlas-rc-block atlas-rc-block--picked';
    return metrics.metrics.some((metric) => metric.blockId === blockId) ? 'atlas-rc-block atlas-rc-block--metric' : 'atlas-rc-block';
  };
  return {
    decorate(block: TemplateBlock): BlockDecoration | null {
      // A Metric's numbers carry their own spots (`decorateNumber`)
      if (block.type === 'metric') return { className: blockClass(block.id) };
      const overlay = spotOf(block.id);
      if (overlay) return { className: blockClass(block.id), overlay };
      return isContainerBlock(block) ? null : { className: 'atlas-rc-block' };
    },
    decorateNumber(block: MetricBlock, key: FieldKey): React.ReactNode {
      return spotOf(numberSpotId(block.id, key));
    },
  };
}
