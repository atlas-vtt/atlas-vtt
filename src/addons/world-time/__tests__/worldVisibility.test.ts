import { describe, expect, it } from 'vitest';
import type { NotePin, TokenEntity } from 'src/app/types';
import { fallbackCalendar } from '../calendar/calendarDefinition';
import { spanOf, timeVisibility, viewingSpan } from '../dating/dateRange';
import { effectiveDates } from '../dating/effectiveDates';
import { computeTimeMask, sameTimeMask } from '../dating/timeMask';
import { objectMaskStateOf as maskStateOf } from 'src/app/addons/objectMask';
import { pickBackground, readSceneWorldTime } from '../sceneWorldTime';

const calendar = fallbackCalendar();

function pin(id: string, extra: Partial<NotePin> = {}): NotePin {
  return { id, kind: 'pin', x: 0, y: 0, notePath: '', ...extra } as NotePin;
}

describe('time visibility', () => {
  const at = (date: string): ReturnType<typeof viewingSpan> => viewingSpan(calendar, date);

  it('shows undated objects and everything without a viewing date', () => {
    expect(timeVisibility(null, at('1236'), false)).toBe('visible');
    expect(timeVisibility(spanOf(calendar, { from: '1300' }), null, false)).toBe('visible');
  });

  it('treats year-only ends as whole years', () => {
    const span = spanOf(calendar, { from: '1200', to: '1236' });
    expect(timeVisibility(span, at('1236-13-05'), false)).toBe('visible');
    expect(timeVisibility(span, at('1237-01-01'), false)).toBe('hidden');
    expect(timeVisibility(span, at('1199-13-05'), false)).toBe('hidden');
    expect(timeVisibility(span, at('1199-13-05'), true)).toBe('ghost');
  });

  it('keeps open ends open', () => {
    expect(timeVisibility(spanOf(calendar, { to: '-500' }), at('-3000'), false)).toBe('visible');
    expect(timeVisibility(spanOf(calendar, { from: '-500' }), at('9999'), false)).toBe('visible');
  });

  it('shows an object whose dates run backwards instead of losing it', () => {
    expect(spanOf(calendar, { from: '1300', to: '1200' })).toBeNull();
  });
});

describe('effective dates', () => {
  it('takes each end from the object, else the note, else born/died', () => {
    expect(effectiveDates({ from: '1200' }, { to: '1236', died: '1300' })).toMatchObject({ from: '1200', to: '1236', fromSource: 'object', toSource: 'note' });
    expect(effectiveDates({}, { born: '1190', died: '1236' })).toMatchObject({ from: '1190', to: '1236' });
  });

  it('ignores the note when inheriting is off', () => {
    expect(effectiveDates({ dateInherit: false }, { from: '1200' })).toEqual({ fromSource: 'none', toSource: 'none' });
  });
});

describe('computeTimeMask', () => {
  const token = { id: 'npc', kind: 'character', x: 0, y: 0, imagePath: '', notePath: 'People/Dakoth.md' } as unknown as TokenEntity;
  const objects = {
    pins: { fort: pin('fort', { from: '1000', to: '1236' }), town: pin('town', { notePath: 'Places/Otag.md' }), free: pin('free') },
    tokens: { npc: token },
    texts: {},
    drawings: {},
  };
  const noteDates = (path: string): { from?: string; born?: string; died?: string } | undefined =>
    ({ 'Places/Otag.md': { from: '1240' }, 'People/Dakoth.md': { born: '1190', died: '1236' } } as Record<string, { from?: string }>)[path];

  it('hides objects outside the viewing date, with dates inherited from notes', () => {
    const mask = computeTimeMask({ calendar, objects, viewing: viewingSpan(calendar, '1238'), showGhosted: false, noteDates });
    expect(mask.hidden).toEqual({ fort: true, town: true, npc: true });
    expect(maskStateOf(mask, 'free')).toBe('visible');
  });

  it('ghosts instead of hiding when asked', () => {
    const mask = computeTimeMask({ calendar, objects, viewing: viewingSpan(calendar, '1230'), showGhosted: true, noteDates });
    expect(mask).toEqual({ hidden: {}, ghost: { town: true } });
  });

  it('filters nothing without a viewing date', () => {
    const mask = computeTimeMask({ calendar, objects, viewing: null, showGhosted: false, noteDates });
    expect(sameTimeMask(mask, { hidden: {}, ghost: {} })).toBe(true);
  });
});

describe('scene world time', () => {
  it('reads only valid fields from a map file', () => {
    expect(readSceneWorldTime({
      viewingDate: '1236-4',
      rangeStart: 'soon',
      variants: [{ id: 'a', background: 'maps/old.png', from: -500, to: '1000' }, { id: 'b' }, 'junk'],
    })).toEqual({ viewingDate: '1236-04', variants: [{ id: 'a', background: 'maps/old.png', from: '-500', to: '1000' }] });
    expect(readSceneWorldTime(undefined)).toEqual({});
  });

  it('shows the variant covering the viewing date, the latest-starting one first', () => {
    const variants = [
      { background: 'old.png', to: '1000' },
      { background: 'war.png', from: '900', to: '950' },
      { background: 'undated.png' },
    ];
    expect(pickBackground(calendar, 'base.png', variants, viewingSpan(calendar, '920'))).toBe('war.png');
    expect(pickBackground(calendar, 'base.png', variants, viewingSpan(calendar, '800'))).toBe('old.png');
    expect(pickBackground(calendar, 'base.png', variants, viewingSpan(calendar, '1200'))).toBe('base.png');
    expect(pickBackground(calendar, 'base.png', variants, null)).toBe('base.png');
  });
});
