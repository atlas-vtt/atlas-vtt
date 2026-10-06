import React from 'react';
import { motion, useIsPresent } from 'framer-motion';
import { ArrowDown, ArrowUp, Eye, EyeOff, Hash, Skull, Trash2 } from 'lucide-react';
import { cn } from '../../../../../utils/cn';
import { t } from '../../../../i18n';
import { EASE_OUT_CONTROL_POINTS } from '../../../../utils/motion';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import type { ResourceDefinition, ResourceDirection } from '../../../../resources/resourceTypes';
import { fanOffsets, type SocketPlace } from './resourceSockets';

interface ResourceFanProps {
  place: SocketPlace;
  resource: ResourceDefinition;
  onChange: (partial: Partial<ResourceDefinition>) => void;
  onRemove: () => void;
}

/** Delay between two buttons leaving the socket, in seconds. */
const STAGGER_S = 0.028;
const ENTER_S = 0.26;
const EXIT_S = 0.12;

interface FanButton {
  label: string;
  icon: React.ReactNode;
  pressed?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/** How a resource counts, in the order the button steps through them. */
const DIRECTIONS: ReadonlyArray<{ direction: ResourceDirection; label: string; icon: React.ReactNode }> = [
  { direction: 'drains', label: t('resource.fan.drains'), icon: <ArrowDown /> },
  { direction: 'fills', label: t('resource.fan.fills'), icon: <ArrowUp /> },
  { direction: 'static', label: t('resource.fan.static'), icon: <Hash /> },
];

/**
 * The round buttons that fan out of a selected socket: how the resource counts (drains,
 * fills, or a static value), whether it defeats its token, whether players see it, and remove. They leave the socket
 * one after the other along an arc on its outer side.
 */
export function ResourceFan({ place, resource, onChange, onRemove }: ResourceFanProps): React.ReactElement {
  const isPresent = useIsPresent();
  const step = DIRECTIONS.findIndex(({ direction }) => direction === resource.direction);
  const counting = DIRECTIONS[step] ?? DIRECTIONS[0]!;
  const next = DIRECTIONS[(step + 1) % DIRECTIONS.length]!.direction;
  const fixed = resource.direction === 'static';
  const defeats = resource.defeatedWhenSpent === true && !fixed;
  const buttons: FanButton[] = [
    {
      label: counting.label,
      icon: counting.icon,
      // A static value is never spent, so it cannot defeat its token
      onClick: () => onChange(next === 'static' ? { direction: next, defeatedWhenSpent: false } : { direction: next }),
    },
    {
      label: fixed ? t('resource.fan.staticNeverDefeats') : defeats ? t('resource.fan.defeats') : t('resource.fan.doesNotDefeat'),
      icon: <Skull />, pressed: defeats, disabled: fixed,
      onClick: () => onChange({ defeatedWhenSpent: !defeats }),
    },
    {
      label: resource.visibleToPlayers ? t('resource.fan.playersSee') : t('resource.fan.hiddenFromPlayers'),
      icon: resource.visibleToPlayers ? <Eye /> : <EyeOff />, pressed: resource.visibleToPlayers,
      onClick: () => onChange({ visibleToPlayers: !resource.visibleToPlayers }),
    },
    { label: t('common.remove'), icon: <Trash2 />, danger: true, onClick: onRemove },
  ];
  const offsets = fanOffsets(buttons.length, place.fanSide);
  const motionOf = (index: number): React.ComponentProps<typeof motion.div> => ({
    initial: { opacity: 0, x: 0, y: 0, scale: 0.4 },
    animate: { opacity: 1, ...offsets[index]!, scale: 1, transition: { duration: ENTER_S, ease: EASE_OUT_CONTROL_POINTS, delay: index * STAGGER_S } },
    exit: { opacity: 0, x: 0, y: 0, scale: 0.4, transition: { duration: EXIT_S, ease: EASE_OUT_CONTROL_POINTS } },
  });

  return (
    // A fan on its way out must not be found or clicked: the next one is already open
    <div className={cn('atlas-csm-fan', !isPresent && 'atlas-leaving')} style={{ left: place.fanX, top: place.y }} aria-hidden={isPresent ? undefined : true}>
      {buttons.map((button, index) => (
        <motion.div key={index} className="atlas-csm-fan__item" {...motionOf(index)}>
          {/* On the fan's outer side, so a tooltip never covers the buttons beside it */}
          <LabelTooltip label={button.label} side={place.fanSide}>
            <button
              type="button"
              className={cn('atlas-csm-fan__button', button.pressed && 'atlas-pressed', button.danger && 'atlas-danger')}
              aria-pressed={button.pressed}
              disabled={button.disabled}
              onClick={button.onClick}
            >
              {button.icon}
            </button>
          </LabelTooltip>
        </motion.div>
      ))}
    </div>
  );
}
