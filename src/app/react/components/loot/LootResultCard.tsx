import React, { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Eye } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { LootDraw } from '../../../loot/lootRoller';
import { EASE_OUT_CONTROL_POINTS, PANEL_ENTER_FROM, PANEL_ENTER_MS } from '../../../utils/motion';
import { LootItemContent } from './LootItemContent';
import { LootGiveButton } from './LootGiveButton';
import { rarityTone } from '../../../loot/lootRarity';
import { t } from '../../../i18n';

interface LootResultCardProps {
  draw: LootDraw;
  /** Part of the roll just made: it lands with a highlight. */
  fresh: boolean;
  /** Position within the fresh roll, to stagger several items. */
  order: number;
  onOpenSource: (draw: LootDraw) => void;
  onOpenLink: (link: string) => void;
  /** The players see this item in their loot window. */
  shownToPlayers: boolean;
  onShowToPlayers: (draw: LootDraw) => void;
}

const STAGGER_S = 0.06;

function LootResultCardView({ draw, fresh, order, onOpenSource, onOpenLink, shownToPlayers, onShowToPlayers }: LootResultCardProps): React.ReactElement {
  const reduceMotion = useReducedMotion();
  const enter = reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, transform: PANEL_ENTER_FROM };

  return (
    <motion.li
      className={`atlas-loot-card${fresh ? ' atlas-loot-card--fresh' : ''}`}
      data-rarity={draw.tone ?? rarityTone(draw.rarity)}
      initial={fresh ? enter : false}
      animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
      transition={{ duration: PANEL_ENTER_MS / 1000, ease: EASE_OUT_CONTROL_POINTS, delay: fresh ? order * STAGGER_S : 0 }}
    >
      <LootItemContent
        draw={draw}
        onOpenLink={onOpenLink}
        actions={(
          <>
            <LootGiveButton draw={draw} />
            <LabelTooltip label={shownToPlayers ? t('widgets.hideFromPlayers') : t('widgets.showToPlayers')}>
              <Button
                variant="ghost"
                size="icon"
                className={`atlas-loot-card__action atlas-loot-card__show${shownToPlayers ? ' is-shown' : ''}`}
                aria-label={shownToPlayers ? t('widgets.hideFromPlayers') : t('widgets.showToPlayers')}
                aria-pressed={shownToPlayers}
                onClick={() => onShowToPlayers(draw)}
              >
                <Eye />
              </Button>
            </LabelTooltip>
          </>
        )}
      />

      <div className="atlas-loot-card__foot">
        <LabelTooltip label={t('loot.card.openNote', { name: draw.name })}>
          <button
            type="button"
            className="atlas-loot-text-button atlas-loot-card__source"
            onClick={() => onOpenSource(draw)}
          >
            <span>{draw.source.join(' › ')}</span>
            <ArrowUpRight />
          </button>
        </LabelTooltip>
      </div>
    </motion.li>
  );
}

/** One rolled item; renders again only when its own props change, not with every roll or history update. */
export const LootResultCard = memo(LootResultCardView);
