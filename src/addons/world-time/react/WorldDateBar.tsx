import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Infinity as AllTimes, Settings2, SkipForward } from 'lucide-react';
import { ToolButton } from 'src/app/packages/components/primitives/ToolButton';
import { TooltipProvider } from 'src/app/packages/components/primitives/tooltip';
import { useAtlasUI } from 'src/app/react/root/AtlasUIContext';
import { useAtlasStore, useViewStoreHook } from 'src/app/react/ViewStoreContext';
import { dateProblem, fromOrdinal, formatDisplayDate, stepDate, toOrdinal, type StepUnit } from '../calendar/dateMath';
import { formatWorldDate, parseWorldDate, truncateDate } from '../calendar/worldDate';
import { dateAtDay, sliderPrecision } from '../dating/sliderDate';
import { latestDay, sceneDateBounds, sliderRange } from '../sceneDateRange';
import { SceneWorldTimeModal } from '../ui/SceneWorldTimeModal';
import { effectiveViewingDate } from '../WorldTimeController';
import { useWorldTimeSources } from './useWorldTimeSources';

const STEP_UNITS: ReadonlyArray<{ unit: StepUnit; label: string }> = [
  { unit: 'day', label: 'Day' },
  { unit: 'month', label: 'Month' },
  { unit: 'year', label: 'Year' },
  { unit: 'decade', label: 'Decade' },
  { unit: 'century', label: 'Century' },
];

/**
 * The scene's viewing date: a slider over the scene's
 * dates, step buttons, a field to type a date, "latest" and "all times".
 * DM only; the player window mirrors the canvas, so players follow.
 */
export function WorldDateBar({ vertical = false }: { vertical?: boolean }): React.ReactElement | null {
  const { app } = useAtlasUI();
  const store = useViewStoreHook();
  const { calendar, notes, notesRevision, settings } = useWorldTimeSources(app);
  const worldTime = useAtlasStore((state) => state.worldTime);
  const objects = useAtlasStore((state) => state.objects);
  const mapPath = useAtlasStore((state) => state.mapPath);
  const [unit, setUnit] = useState<StepUnit>('year');

  const viewingDate = effectiveViewingDate(worldTime, settings);
  const usesDefault = worldTime.viewingDate === undefined && viewingDate !== null;
  const bounds = useMemo(() => sceneDateBounds({ objects, worldTime }, {
    noteDates: (path) => notes.noteDates(path),
    events: notes.events(),
    parentOf: (path) => notes.parentOf(path),
    mapVariantNotes: mapPath ? notes.mapVariantsFor(mapPath) : [],
  }), [objects, worldTime, notes, notesRevision, mapPath]);
  const range = useMemo(() => sliderRange(calendar, worldTime, bounds, viewingDate), [calendar, worldTime, bounds, viewingDate]);
  const latest = useMemo(() => latestDay(calendar, bounds), [calendar, bounds]);

  const [draft, setDraft] = useState(viewingDate ?? '');
  useEffect(() => setDraft(viewingDate ?? ''), [viewingDate]);
  const draftDate = parseWorldDate(draft);
  const draftProblem = draft.trim() === '' ? null : draftDate ? dateProblem(calendar, draftDate) : 'Use YYYY, YYYY-MM or YYYY-MM-DD';

  if (!settings.showDateBar) return null;
  if (settings.dateBar === 'dated-scenes' && bounds.every((entry) => !entry.from && !entry.to) && !viewingDate) return null;

  const setDate = (date: string | null): void => store.getState().setViewingDate(date);
  const viewing = parseWorldDate(viewingDate);
  const step = (amount: number): void => {
    const base = viewing ?? (latest !== null ? truncateDate(fromOrdinal(calendar, latest), 'year') : { year: 0 });
    setDate(formatWorldDate(stepDate(calendar, base, unit, amount)));
  };
  const commitDraft = (): void => {
    if (draft.trim() === '') setDate(null);
    else if (draftDate && !draftProblem) setDate(formatWorldDate(draftDate));
  };
  const sliderValue = viewing && range ? Math.min(range.end, Math.max(range.start, toOrdinal(calendar, viewing))) : range?.end ?? 0;

  return (
    <TooltipProvider delayDuration={300}>
      <div className={`atlas-vtt-toolbar atlas-world-date-bar${vertical ? ' atlas-world-date-bar--vertical' : ''}`}>
        <span className={`atlas-world-date-bar__label${usesDefault ? ' is-default' : ''}`}>
          {viewing ? formatDisplayDate(calendar, viewing) : 'All times'}
        </span>
        <select
          className="dropdown atlas-world-date-bar__unit"
          aria-label="Step by"
          value={unit}
          onChange={(event) => setUnit(event.target.value as StepUnit)}
        >
          {STEP_UNITS.map(({ unit: value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
        <ToolButton icon={ChevronLeft} label={`Back one ${unit}`} isActive={false} onClick={() => step(-1)} />
        <input
          type="range"
          className="atlas-world-date-bar__slider"
          aria-label="Viewing date"
          aria-orientation={vertical ? 'vertical' : 'horizontal'}
          disabled={!range}
          min={range?.start ?? 0}
          max={range?.end ?? 0}
          value={sliderValue}
          onChange={(event) => {
            if (!range) return;
            setDate(formatWorldDate(dateAtDay(calendar, Number(event.target.value), sliderPrecision(range, calendar.daysPerYear))));
          }}
        />
        <ToolButton icon={ChevronRight} label={`Forward one ${unit}`} isActive={false} onClick={() => step(1)} />
        <input
          type="text"
          className={`atlas-world-date-bar__input${draftProblem ? ' is-invalid' : ''}`}
          aria-label="Type a date"
          placeholder="YYYY-MM-DD"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitDraft();
            if (event.key === 'Escape') setDraft(viewingDate ?? '');
          }}
        />
        <ToolButton
          icon={SkipForward}
          label="Latest date in this scene"
          isActive={false}
          disabled={latest === null}
          onClick={() => { if (latest !== null) setDate(formatWorldDate(fromOrdinal(calendar, latest))); }}
        />
        <ToolButton icon={AllTimes} label="Show all times" isActive={viewingDate === null} onClick={() => setDate(null)} />
        <ToolButton
          icon={Settings2}
          label="Date range and map variants"
          isActive={false}
          onClick={() => new SceneWorldTimeModal(app, store).open()}
        />
      </div>
    </TooltipProvider>
  );
}
