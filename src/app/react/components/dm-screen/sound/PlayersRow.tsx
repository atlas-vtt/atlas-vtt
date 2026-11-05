import React from 'react';
import { Users } from 'lucide-react';
import { t } from '../../../../i18n';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import type { Mood } from '../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import type { PlayersCopy } from '../../../../soundDirector/tableClock';

function copyText(copy: PlayersCopy): string {
  if (copy.state === 'ready') return t('audio.players.ready');
  return copy.state === 'uploading' ? t('audio.players.uploadingPercent', { percent: Math.round(copy.share * 100) }) : t('audio.players.nowhere');
}

/** The least far of a mood's sounds, which is how far the mood is; null where no table runs, or it names none. */
export function moodForPlayers(mood: Pick<Mood, 'music' | 'layers'>, director: SoundDirector): PlayersCopy | null {
  const { sounds } = director.players;
  if (sounds === null || !sounds.sending) return null;
  const copies = director.shelf.recordsOf(mood).map((record) => sounds.copyOf(record));
  if (copies.length === 0) return null;
  if (copies.some((copy) => copy.state === 'nowhere')) return { state: 'nowhere' };
  const uploading = copies.flatMap((copy) => (copy.state === 'uploading' ? [copy.share] : []));
  return uploading.length > 0 ? { state: 'uploading', share: Math.min(...uploading) } : { state: 'ready' };
}

function shortText(copy: PlayersCopy): string {
  if (copy.state === 'ready') return t('audio.players.shortReady');
  return copy.state === 'uploading' ? t('audio.players.shortPercent', { percent: Math.round(copy.share * 100) }) : t('audio.players.shortNowhere');
}

/** How a mood stands for players, small in the corner of its card; the whole sentence under the pointer. */
export function MoodPlayersTag({ copy }: { copy: PlayersCopy }): React.JSX.Element {
  return (
    <LabelTooltip label={copyText(copy)} describe>
      <span className="atlas-sound-tag atlas-sound-tag--players atlas-sound-mood__players" data-players={copy.state}>
        <Users aria-hidden="true" />
        {shortText(copy)}
      </span>
    </LabelTooltip>
  );
}
