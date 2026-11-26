import { afterEach, describe, expect, it, vi } from 'vitest';
import { annotationAuthor, nameAnnotationAuthors } from '../../../src/app/annotations/annotationAuthors';
import { readDrawing } from '../../../src/app/annotations/annotationList';
import type { DrawingAnnotation } from '../../../src/app/annotations/annotationTypes';
import { annotationMenu, type AnnotationMenuStore } from '../../../src/app/pixi/annotations/annotationMenu';

const drawing = (id: string, by?: string): DrawingAnnotation => {
  const read = readDrawing(id, { id, kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: 0, y: 0 }, { x: 9, y: 9 }], color: '#ffffff', width: 3, opacity: 1, ...(by !== undefined && { by }) });
  if (!read) throw new Error('no drawing');
  return read;
};
const store = (): AnnotationMenuStore => ({ updateAnnotations: vi.fn(), orderAnnotations: vi.fn(), groupAnnotations: vi.fn(), ungroupAnnotations: vi.fn(), duplicateMapObjects: vi.fn(), deleteAnnotations: vi.fn() });
const labels = (entries: ReturnType<typeof annotationMenu>): string[] => entries.flatMap((entry) => (entry.type === 'item' ? [entry.label] : []));

describe('who made a drawing, in its menu', () => {
  let forget = (): void => undefined;
  afterEach(() => forget());

  it('is the menu\'s first row, which does nothing, where the player is known', () => {
    forget = nameAnnotationAuthors((id) => (id === 'ana' ? 'Ana' : null));
    const mine = drawing('d1', 'ana');
    const entries = annotationMenu([mine], mine, store(), () => undefined);
    expect(entries[0]).toMatchObject({ type: 'item', label: 'Drawn by Ana', disabled: true });
    // The rows that change the drawing follow, as for any other: the GM changes a player's like their own.
    expect(labels(entries).slice(1, 3)).toEqual(['Hide from players', 'Under tokens']);
  });

  it('is left out for the GM\'s own drawings, for a player nobody knows, and once no table tells the names', () => {
    forget = nameAnnotationAuthors((id) => (id === 'ana' ? 'Ana' : null));
    const own = drawing('d1');
    const strangers = drawing('d2', 'someone-gone');
    expect(labels(annotationMenu([own], own, store(), () => undefined))[0]).toBe('Hide from players');
    expect(labels(annotationMenu([strangers], strangers, store(), () => undefined))[0]).toBe('Hide from players');
    forget();
    expect(annotationAuthor('ana')).toBeNull();
    const anas = drawing('d3', 'ana');
    expect(labels(annotationMenu([anas], anas, store(), () => undefined))[0]).toBe('Hide from players');
  });
});
