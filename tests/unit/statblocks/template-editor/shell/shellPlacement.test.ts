import { describe, expect, it } from 'vitest';
import { editorWidthOf } from '../../../../../src/app/statblocks/editor/template-editor/shell/editorWidth';

describe('how wide the template editor stands', () => {
  it('is wide from 900 px, medium from 720 px, and stacked below, as a note view stacks', () => {
    expect(editorWidthOf(1400)).toBe('wide');
    expect(editorWidthOf(900)).toBe('wide');
    expect(editorWidthOf(899)).toBe('medium');
    expect(editorWidthOf(720)).toBe('medium');
    expect(editorWidthOf(719)).toBe('stacked');
    // Not measured yet: as wide as it gets.
    expect(editorWidthOf(0)).toBe('wide');
  });
});
