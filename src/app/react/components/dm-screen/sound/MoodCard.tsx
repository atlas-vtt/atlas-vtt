import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, CornerDownLeft, FileX, Hourglass, Link2, MoreHorizontal, Swords, type LucideIcon } from 'lucide-react';
import { t } from '../../../../i18n';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import type { Mood } from '../../../../sound/soundTypes';
import type { MoodProblem } from '../../../../soundDirector/moodReadiness';
import type { PlayersCopy } from '../../../../soundDirector/tableClock';
import { moodCrestPath, moodIcon, moodTone } from '../../../../soundLibrary/moodLook';
import { WIDGET_ICON_VIEW_BOX } from '../../../../types/widgetIcons';
import { prefersReducedMotion } from '../../../../utils/motion';
import { IconAction } from './IconAction';
import { MoodPlayersTag } from './PlayersRow';
import { MoodBars } from './MoodBars';
import { CutTooltip } from './CutTooltip';

interface MoodCardProps {
  mood: Mood;
  /** Its place in the row; only the first ten have a key. */
  number: number;
  playing: boolean;
  /** What a playing tile says it does: Playing, Stopped, Paused, Music paused. */
  stateWord: string;
  /** Held (stopped, music paused): its bars stand still. */
  still: boolean;
  next: boolean;
  dragging: boolean;
  /** The first track of its list. */
  musicName: string | null;
  problems: readonly MoodProblem[];
  /** Linked to the open scene: as its mood, and as its mood in a fight. */
  linked: boolean;
  linkedInFight: boolean;
  /** The thumbnail of a scene that links it, shown behind it; null where none does. */
  sceneImage: string | null;
  /** How the mood stands for players at a table online; null without one. */
  players: PlayersCopy | null;
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
    case 'refused': return t('audio.problem.refused', { name: problem.name, reason: t(`audio.refused.${problem.reason}`), next: t(`audio.refusedNext.${problem.reason}`) });
  }
}

function keyOf(number: number): string | null {
  if (number < 10) return String(number);
  return number === 10 ? '0' : null;
}

function musicLine(mood: Mood, musicName: string | null): string {
  if (mood.music === 'keep') return t('audio.mood.musicKeep');
  if (mood.music !== 'none' && mood.music.tracks.length > 0) return musicName ?? t('audio.music');
  return mood.layers.length > 0 ? t('audio.ambienceOnly') : t('audio.mood.noSounds');
}

/** The crossfade under way, along the tile's foot. A page that opens on a mood already playing shows none. */
function FadeBar({ playing, seconds }: { playing: boolean; seconds: number }): React.JSX.Element {
  const bar = useRef<HTMLSpanElement>(null);
  const was = useRef(playing);
  useEffect(() => {
    const element = bar.current;
    const started = playing && !was.current;
    was.current = playing;
    if (!element || !started || seconds <= 0 || prefersReducedMotion(element)) return;
    element.animate(
      [{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1, offset: 0.98 }, { transform: 'scaleX(1)', opacity: 0 }],
      { duration: seconds * 1000, easing: 'linear' },
    );
  }, [playing, seconds]);
  return <span className="atlas-sound-mood__fade" ref={bar} />;
}

function problemSummary(problems: readonly MoodProblem[]): string {
  const missing = problems.filter((problem) => problem.kind === 'missing').length;
  if (missing > 0) return t('audio.fileNotFound', { count: missing });
  const stillComing = problems.every((problem) => problem.kind === 'converting' || problem.kind === 'notConverted');
  return t(stillComing ? 'audio.stillConverting' : 'audio.notReady', { count: problems.length });
}

function problemIcon(problems: readonly MoodProblem[]): LucideIcon {
  if (problems.some((problem) => problem.kind === 'missing')) return FileX;
  return problems.every((problem) => problem.kind === 'converting' || problem.kind === 'notConverted') ? Hourglass : AlertTriangle;
}

/**
 * What keeps the mood from sounding whole, said on the tile; a missing file has its mark, not its colour alone.
 * `compact` beside the tile's own state word: its mark and count, the words in its name and tooltip, so neither is cut.
 */
function ProblemLine({ moodId, problems, compact }: { moodId: string; problems: readonly MoodProblem[]; compact: boolean }): React.JSX.Element {
  const missing = problems.some((problem) => problem.kind === 'missing');
  const Icon = problemIcon(problems);
  const summary = problemSummary(problems);
  return (
    <LabelTooltip label={problems.map(problemText).join('\n')} side="bottom" multiline describe>
      <span className="atlas-sound-mood__state atlas-sound-mood__state--problem" data-sound-problem={moodId} data-compact={compact || undefined}>
        {(missing || compact) && <Icon aria-hidden="true" />}
        {compact ? <><span aria-hidden="true">{problems.length}</span><span className="atlas-sound-sr">{summary}</span></> : summary}
      </span>
    </LabelTooltip>
  );
}

function LinkMark({ icon: Icon, label }: { icon: LucideIcon; label: string }): React.JSX.Element {
  return (
    <LabelTooltip label={label}>
      <span className="atlas-sound-mood__link" role="img" aria-label={label}><Icon aria-hidden="true" /></span>
    </LabelTooltip>
  );
}

/** Not painted yet; shown, with its transitions; shown at once, without them, for the first frame. */
type Backdrop = 'loading' | 'fading' | 'at-once';

/**
 * A linked scene's thumbnail behind the tile, shown once it can be painted, so it fades in rather than
 * popping. One already painted when the tile comes (the DM screen opening again) is there at once.
 */
function SceneBackdrop({ src }: { src: string }): React.JSX.Element {
  const image = useRef<HTMLImageElement>(null);
  const [shown, setShown] = useState<Backdrop>('loading');
  // The page opens still: a thumbnail that arrives as the tile first comes shows at once; one changed later fades.
  const firstSrc = useRef(src);
  useLayoutEffect(() => {
    const element = image.current;
    setShown(element?.complete === true && element.naturalWidth > 0 ? 'at-once' : 'loading');
  }, [src]);
  useEffect(() => {
    const view = image.current?.ownerDocument.defaultView;
    if (shown !== 'at-once' || !view) return undefined;
    // Once shown without a transition, hover may move it again.
    const frame = view.requestAnimationFrame(() => setShown('fading'));
    return () => view.cancelAnimationFrame(frame);
  }, [shown]);
  return (
    <img
      ref={image}
      className="atlas-sound-mood__scene"
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-shown={shown !== 'loading' || undefined}
      data-at-once={shown === 'at-once' || undefined}
      onLoad={() => setShown((was) => (was !== 'loading' ? was : src === firstSrc.current ? 'at-once' : 'fading'))}
    />
  );
}

/** A mood in its fixed place: one press changes the room. */

export const MoodCard = React.memo(function MoodCard({ mood, number, playing, stateWord, still, next, dragging, musicName, problems, linked, linkedInFight, sceneImage, players, onPress, onMenu, onDragStart }: MoodCardProps): React.JSX.Element {
  const tone = moodTone(mood);
  const key = keyOf(number);
  const hasList = mood.music !== 'none' && mood.music !== 'keep' && mood.music.tracks.length > 0;
  return (
    <div
      className="atlas-sound-mood"
      data-playing={playing || undefined}
      data-dragging={dragging || undefined}
      style={{ '--atlas-sound-tone-light': tone.light, '--atlas-sound-tone-dark': tone.dark } as React.CSSProperties}
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
        {...(key !== null && { 'aria-keyshortcuts': key })}
        onClick={() => onPress(mood)}
        onPointerDown={(event) => onDragStart(mood, event)}
      >
        {sceneImage !== null && <SceneBackdrop src={sceneImage} />}
        <svg className="atlas-sound-mood__crest" viewBox={WIDGET_ICON_VIEW_BOX} aria-hidden="true"><path d={moodCrestPath(moodIcon(mood))} /></svg>
        {/* The spaces are for the button's name, read from its words: "Goblin Ambush Shieldwall 1 ambience Playing". */}
        <CutTooltip><span className="atlas-sound-mood__name">{mood.name}</span></CutTooltip>{' '}
        <span className="atlas-sound-mood__what">
          <span>{musicLine(mood, musicName)}</span>{' '}
          {hasList && mood.layers.length > 0 && <span className="atlas-sound-mood__layers">{t('audio.ambienceCount', { count: mood.layers.length })}</span>}
        </span>{' '}
        <span className="atlas-sound-mood__foot">
          {key !== null && <span className="atlas-sound-cap" aria-hidden="true">{key}</span>}
          {playing && <MoodBars still={still} />}
          {playing && <span className="atlas-sound-mood__state atlas-sound-mood__state--main">{stateWord}</span>}{' '}
          {next && !playing && <span className="atlas-sound-cap" aria-hidden="true"><CornerDownLeft /></span>}
          {next && !playing && problems.length === 0 && <span className="atlas-sound-mood__state">{t('audio.nextTag')}</span>}{' '}
          {problems.length > 0 && <ProblemLine moodId={mood.id} problems={problems} compact={playing || next} />}{' '}
          {linked && <LinkMark icon={Link2} label={t('audio.mood.linkedScene')} />}{' '}
          {linkedInFight && <LinkMark icon={Swords} label={t('audio.mood.linkedCombat')} />}
          {/* Only what is not ready yet is news: six tiles saying Ready said nothing, over art that hid it. */}
          {players !== null && players.state !== 'ready' && <MoodPlayersTag copy={players} />}
        </span>
        <FadeBar playing={playing} seconds={mood.fadeSeconds} />
      </button>
      <IconAction label={t('audio.moodMenu', { name: mood.name })} icon={MoreHorizontal} className="atlas-sound-mood__menu" focusSkip onClick={(event) => onMenu(mood, event.currentTarget)} />
    </div>
  );
});
