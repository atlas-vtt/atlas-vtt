import React, { useCallback, useId, useSyncExternalStore } from 'react';
import { Users } from 'lucide-react';
import { t } from '../../../../i18n';
import { Button } from '../../../../packages/components/primitives/button';
import { ToggleSwitch } from '../../../../packages/components/primitives/Toggle';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import type { Mood, SoundRecord } from '../../../../sound/soundTypes';
import { openedDirector } from '../../../../soundDirector/directorRegistry';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import type { PlayersCopy, PlayersSounds } from '../../../../soundDirector/tableClock';
import { useAtlasUI } from '../../../root/AtlasUIContext';
import { useSoundValue } from './useSound';

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

/** How a sound stands for players, in words. */
function PlayersLine({ copy }: { copy: PlayersCopy }): React.JSX.Element {
  return <span className="atlas-sound-tag atlas-sound-tag--players" data-players={copy.state}>{copyText(copy)}</span>;
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

/** On a sound's card, while a table runs. */
export function PlayersCardLine({ record }: { record: SoundRecord }): React.JSX.Element | null {
  const { app } = useAtlasUI();
  const director = openedDirector(app);
  const subscribe = useCallback((listener: () => void) => director?.subscribe(listener) ?? (() => undefined), [director]);
  const revision = useSyncExternalStore(subscribe, () => director?.snapshot().playersRevision ?? 0);
  const sounds = director?.players.sounds ?? null;
  if (sounds === null || !sounds.sending || revision < 0) return null;
  return <PlayersLine copy={sounds.copyOf(record)} />;
}

function SendSwitch({ sounds }: { sounds: PlayersSounds }): React.JSX.Element {
  const labelId = useId();
  return (
    <div className="atlas-sound-players__send">
      <span id={labelId} className="atlas-sound-players__label">{t('audio.players.send')}</span>
      <ToggleSwitch value={sounds.sending} onChange={() => sounds.setSending(!sounds.sending)} labelledBy={labelId} size="s" />
    </div>
  );
}

/** While a table runs: whether this device sends its sound, and offering a collection's moods before they are pressed. */
export function PlayersRow({ director, collectionId }: { director: SoundDirector; collectionId: string | null }): React.JSX.Element | null {
  useSoundValue(director, (snapshot) => snapshot.playersRevision);
  const { sounds } = director.players;
  if (sounds === null) return null;
  return (
    <div className="atlas-sound-players">
      <SendSwitch sounds={sounds} />
      {sounds.sending && (
        <Button type="button" variant="ghost" disabled={collectionId === null} onClick={() => collectionId !== null && sounds.prepare(collectionId)}>{t('audio.players.prepare')}</Button>
      )}
    </div>
  );
}
