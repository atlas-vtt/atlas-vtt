import { Scalar } from 'yaml';
import { readFrontmatterDoc } from '../../../../src/app/statblocks/notes/yamlDocument';
import { detectRenderStyle } from '../../../../src/app/statblocks/notes/yamlSplice';
import {
  DEFAULT_RENDER_STYLE, renderFlowElement, renderInline, renderItemLines, renderKey, renderPairLines,
} from '../../../../src/app/statblocks/notes/yamlValueText';

describe('renderPairLines and renderItemLines', () => {
  it('writes block collections at column 0 in the given indentation', () => {
    expect(renderPairLines({ key: 'actions' }, [{ name: 'Bite', desc: 'x' }], DEFAULT_RENDER_STYLE))
      .toEqual(['actions:', '  - name: Bite', '    desc: x']);
    expect(renderPairLines({ key: 'actions' }, [{ name: 'Bite' }], { indent: 4, indentSeq: true }))
      .toEqual(['actions:', '    - name: Bite']);
    expect(renderPairLines({ key: 'tags' }, ['a'], { indent: 2, indentSeq: false })).toEqual(['tags:', '- a']);
    expect(renderItemLines({ name: 'Bite', desc: 'x' }, DEFAULT_RENDER_STYLE)).toEqual(['- name: Bite', '  desc: x']);
    expect(renderItemLines(null, DEFAULT_RENDER_STYLE)).toEqual(['-']);
  });

  it('keeps the source of an old key', () => {
    expect(renderPairLines({ source: '"hit points"' }, 7, DEFAULT_RENDER_STYLE)).toEqual(['"hit points": 7']);
    expect(renderPairLines({ source: "'x'" }, null, DEFAULT_RENDER_STYLE)).toEqual(["'x':"]);
    expect(renderPairLines({ source: 'desc' }, 'a\nb', DEFAULT_RENDER_STYLE)).toEqual(['desc: |-', '  a', '  b']);
  });

  it('writes flow collections without padding and never folds long lines', () => {
    expect(renderPairLines({ key: 'stats' }, [18, 8, 15], DEFAULT_RENDER_STYLE, { flow: true })).toEqual(['stats: [18, 8, 15]']);
    const long = 'word '.repeat(40).trim();
    expect(renderPairLines({ key: 'desc' }, long, DEFAULT_RENDER_STYLE)).toEqual([`desc: ${long}`]);
  });
});

describe('renderInline', () => {
  it('returns one-line values and null for block ones', () => {
    expect(renderInline('Goblin', DEFAULT_RENDER_STYLE)).toBe('Goblin');
    expect(renderInline(null, DEFAULT_RENDER_STYLE)).toBe('');
    expect(renderInline([], DEFAULT_RENDER_STYLE)).toBe('[]');
    expect(renderInline({}, DEFAULT_RENDER_STYLE)).toBe('{}');
    expect(renderInline([1, 2], DEFAULT_RENDER_STYLE)).toBeNull();
    expect(renderInline([1, 2], DEFAULT_RENDER_STYLE, { flow: true })).toBe('[1, 2]');
    expect(renderInline('a\nb', DEFAULT_RENDER_STYLE)).toBeNull();
  });

  it('keeps a quoting style that can hold the value', () => {
    expect(renderInline('Small', DEFAULT_RENDER_STYLE, { scalarType: Scalar.QUOTE_SINGLE })).toBe("'Small'");
    expect(renderInline("it's", DEFAULT_RENDER_STYLE, { scalarType: Scalar.QUOTE_SINGLE })).toBe("'it''s'");
    expect(renderInline('a\nb', DEFAULT_RENDER_STYLE, { scalarType: Scalar.QUOTE_SINGLE })).toBeNull();
    expect(renderInline('a\nb', DEFAULT_RENDER_STYLE, { scalarType: Scalar.QUOTE_DOUBLE })).toBe('"a\\nb"');
    expect(renderInline('Small', DEFAULT_RENDER_STYLE, { scalarType: Scalar.PLAIN })).toBe('Small');
  });

  it('quotes YAML 1.1 lookalikes', () => {
    expect(renderInline('yes', DEFAULT_RENDER_STYLE)).toBe('"yes"');
    expect(renderInline('2024-01-01', DEFAULT_RENDER_STYLE)).toBe('"2024-01-01"');
    expect(renderInline(['on', 'off'], DEFAULT_RENDER_STYLE, { flow: true })).toBe('["on", "off"]');
  });
});

describe('renderFlowElement and renderKey', () => {
  it('quotes for the flow context', () => {
    expect(renderFlowElement('a, b')).toBe('"a, b"');
    expect(renderFlowElement('plain')).toBe('plain');
    expect(renderFlowElement({ walk: 30 })).toBe('{walk: 30}');
    expect(renderFlowElement(null)).toBe('null');
  });

  it('quotes keys that need it and refuses keys that need the explicit form', () => {
    expect(renderKey('atlas-template')).toBe('atlas-template');
    expect(renderKey('a: b')).toBe('"a: b"');
    expect(renderKey('1')).toBe('"1"');
    expect(renderKey('on')).toBe('"on"');
    expect(renderKey('k'.repeat(1100))).toBeNull();
  });
});

describe('detectRenderStyle', () => {
  const styleOf = (yaml: string): unknown => {
    const doc = readFrontmatterDoc(yaml);
    if (!doc) throw new Error('unreadable');
    return detectRenderStyle(doc);
  };

  it('reads the indentation of the first block list and map', () => {
    expect(styleOf('a: 1\n')).toEqual(DEFAULT_RENDER_STYLE);
    expect(styleOf('l:\n    - a\n')).toEqual({ indent: 4, indentSeq: true });
    expect(styleOf('l:\n- a\nm:\n    k: 1\n')).toEqual({ indent: 4, indentSeq: false });
    expect(styleOf('m:\n   k: 1\n')).toEqual({ indent: 3, indentSeq: true });
    expect(styleOf('l:\n- a\n')).toEqual({ indent: 2, indentSeq: false });
  });
});
