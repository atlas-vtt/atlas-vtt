import React from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Hash, Shield, Skull, Swords, Trash2 } from 'lucide-react';
import { t } from '../../../../i18n';
import { PLAYER_AUDIENCES, playerAudience, withPlayerAudience, type PlayerAudience } from '../../../../resources/playerAudience';
import type { ResourceDefinition, ResourceDirection } from '../../../../resources/resourceTypes';
import { audienceHint } from '../../command-palette/PlayerAudienceControl';
import { RadialFan, type FanButton } from '../fan/RadialFan';
import { fanOffsets, type SocketPlace } from './resourceSockets';

interface ResourceFanProps {
  place: SocketPlace;
  resource: ResourceDefinition;
  /** The fields given, or what the function makes of the resource (which may remove fields). */
  onChange: (edit: Partial<ResourceDefinition> | ((resource: ResourceDefinition) => ResourceDefinition)) => void;
  onRemove: () => void;
}

/** How a resource counts, in the order the button steps through them. */
const DIRECTIONS: ReadonlyArray<{ direction: ResourceDirection; label: string; icon: React.ReactNode }> = [
  { direction: 'drains', label: t('resource.fan.drains'), icon: <ArrowDown /> },
  { direction: 'fills', label: t('resource.fan.fills'), icon: <ArrowUp /> },
  { direction: 'static', label: t('resource.fan.static'), icon: <Hash /> },
];

/** What the players' button shows for each audience it steps through. */
const AUDIENCE_ICONS: Readonly<Record<PlayerAudience, React.ReactNode>> = {
  hidden: <EyeOff />,
  party: <Shield />,
  opponents: <Swords />,
  everyone: <Eye />,
};

/**
 * The round buttons that fan out of a selected socket: how the resource counts (drains,
 * fills, or a static value), whether it defeats its token, whose tokens players see it on, and remove. They leave the socket
 * one after the other along an arc on its outer side.
 */
export function ResourceFan({ place, resource, onChange, onRemove }: ResourceFanProps): React.ReactElement {
  const step = DIRECTIONS.findIndex(({ direction }) => direction === resource.direction);
  const counting = DIRECTIONS[step] ?? DIRECTIONS[0]!;
  const next = DIRECTIONS[(step + 1) % DIRECTIONS.length]!.direction;
  const fixed = resource.direction === 'static';
  const defeats = resource.defeatedWhenSpent === true && !fixed;
  const audience = playerAudience(resource);
  const nextAudience = PLAYER_AUDIENCES[(PLAYER_AUDIENCES.indexOf(audience) + 1) % PLAYER_AUDIENCES.length]!;
  const buttons: FanButton[] = [
    {
      label: counting.label,
      icon: counting.icon,
      // A static value cannot defeat its token, but the choice stays for when it counts again (`savedResources` drops it)
      onClick: () => onChange({ direction: next }),
    },
    {
      label: fixed ? t('resource.fan.staticNeverDefeats') : defeats ? t('resource.fan.defeats') : t('resource.fan.doesNotDefeat'),
      icon: <Skull />, pressed: defeats, disabled: fixed,
      onClick: () => onChange({ defeatedWhenSpent: !defeats }),
    },
    {
      // Steps from hidden through the party's tokens and everyone else's to every token
      label: audienceHint(audience),
      icon: AUDIENCE_ICONS[audience], pressed: audience !== 'hidden',
      onClick: () => onChange((current) => withPlayerAudience(current, nextAudience)),
    },
    { label: t('common.remove'), icon: <Trash2 />, danger: true, onClick: onRemove },
  ];
  // On the fan's outer side, so a tooltip never covers the buttons beside it
  const spots = fanOffsets(buttons.length, place.fanSide).map((offset) => ({ ...offset, side: place.fanSide }));
  return <RadialFan buttons={buttons} spots={spots} x={place.fanX} y={place.y} label={resource.name.trim() || undefined} />;
}
