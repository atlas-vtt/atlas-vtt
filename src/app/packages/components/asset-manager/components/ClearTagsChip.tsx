import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { EASE_OUT_CONTROL_POINTS } from '../../../../utils/motion';
import { t } from '../../../../i18n';

interface ClearTagsChipProps {
  /** Number of tags filtering the assets; the chip shows only while it is above zero. */
  count: number;
  onClear: () => void;
  /** What the tooltip calls the button; defaults to clearing tag filters. */
  label?: string;
}

const TRANSITION = { duration: 0.15, ease: EASE_OUT_CONTROL_POINTS };
const HIDDEN = { opacity: 0, transform: 'scale(0.85)' };
const SHOWN = { opacity: 1, transform: 'scale(1)' };

/** Shows how many tags (or other filters) filter the assets and clears them all on click. */
export function ClearTagsChip({ count, onClear, label }: ClearTagsChipProps): React.JSX.Element {
  return (
    <AnimatePresence initial={false}>
      {count > 0 && (
        <motion.span
          key="clear-tags"
          className="atlas-tags-clear-wrapper"
          initial={HIDDEN}
          animate={SHOWN}
          exit={HIDDEN}
          transition={TRANSITION}
        >
          <LabelTooltip label={label ?? t('am.clearTags', { count })}>
            <Button
              variant="ghost"
              className="atlas-tags-clear"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
            >
              <span className="atlas-tags-clear-count">{count}</span>
              <X />
            </Button>
          </LabelTooltip>
        </motion.span>
      )}
    </AnimatePresence>
  );
}
