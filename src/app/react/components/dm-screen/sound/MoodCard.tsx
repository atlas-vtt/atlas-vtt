import React from 'react';
import { AlertTriangle, MoreHorizontal } from 'lucide-react';
import { t } from '../../../../i18n';
import type { Mood } from '../../../../sound/soundTypes';
import type { MoodProblem } from '../../../../soundDirector/moodReadiness';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import { IconAction } from './IconAction';

interface MoodCardProps {
  mood: Mood;
  number: number;
  playing: boolean;
  next: boolean;
  dragging: boolean;
  problems: readonly MoodProblem[];
  onPress: (mood: Mood) => void;
  onMenu: (mood: Mood, anchor: HTMLElement) => void;
  onDragStart: (mood: Mood, event: React.PointerEvent<HTMLElement>) => void;
}

function problemText(problem: MoodProblem): string {
  switch (problem.kind) {
    case 'deleted': return t('audio.problem.deleted');
    case 'missing': return t('audio.problem.missing', { name: problem.name });
    case 'converting': return t('audio.problem.converting', { name: problem.name });
    case 'notConverted': return t('audio.problem.notConverted', { name: problem.name });
    case 'refused': return t('audio.problem.refused', { name: problem.name, reason: t(`audio.refused.${problem.reason}`) });
  }
}

/** A mood in its fixed place: one press changes the room. */
export const MoodCard = React.memo(function MoodCard({ mood, number, playing, next, dragging, problems, onPress, onMenu, onDragStart }: MoodCardProps): React.JSX.Element {
  return (
    <div
      className="atlas-sound-mood"
      data-playing={playing || undefined}
      data-dragging={dragging || undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(mood, event.currentTarget);
      }}
    >
      <button
        type="button"
        className="atlas-sound-mood__press"
        data-sound-mood={mood.id}
        aria-pressed={playing}
        onClick={() => onPress(mood)}
        onPointerDown={(event) => onDragStart(mood, event)}
      >
        <span className="atlas-sound-mood__number">{number}</span>
        <span className="atlas-sound-mood__name">{mood.name}</span>
        <span className="atlas-sound-mood__state">
          {playing && <span className="atlas-sound-tag atlas-sound-tag--playing">{t('audio.playingTag')}</span>}
          {next && !playing && <span className="atlas-sound-tag">{t('audio.nextTag')}</span>}
        </span>
      </button>
      {problems.length > 0 && (
        <LabelTooltip label={problems.map(problemText).join('\n')} multiline describe>
          <span className="atlas-sound-tag atlas-sound-tag--problem" data-sound-problem={mood.id}>
            <AlertTriangle aria-hidden="true" />
            {t('audio.notReady', { count: problems.length })}
          </span>
        </LabelTooltip>
      )}
      <IconAction label={t('audio.moodMenu', { name: mood.name })} icon={MoreHorizontal} className="atlas-sound-mood__menu" focusSkip onClick={(event) => onMenu(mood, event.currentTarget)} />
    </div>
  );
});
