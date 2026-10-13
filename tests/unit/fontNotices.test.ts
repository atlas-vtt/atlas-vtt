// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

interface BundledFont {
  font: string;
  licence: string;
  credit: string;
  source: string;
  authorWithoutCopyright?: string;
}

interface FontNotices {
  BUNDLED_FONTS: readonly BundledFont[];
  LICENCE_REFERENCE: string;
  copyrightClaimProblems: (text: string) => string[];
  fontNoticeProblems: (css: string) => string[];
  fontFaceCountProblems: (css: string) => string[];
  scriptFontProblems: (js: string) => string[];
}

const {
  BUNDLED_FONTS,
  LICENCE_REFERENCE,
  copyrightClaimProblems,
  fontNoticeProblems,
  fontFaceCountProblems,
  scriptFontProblems,
} = createRequire(import.meta.url)('../../scripts/font-notices.js') as FontNotices;

const root = fileURLToPath(new URL('../..', import.meta.url));
const FONT_FILE = /\.(?:ttf|otf|woff2?|eot)$/i;
const MISSING_NOTICE = 'no preserved font licence notice';

/** SHA-256 of each font file as its author published it. */
const FONT_HASHES: Record<string, string> = {
  'src/app/assets/fonts/fantaisie-artistique.ttf': '59339564e6efe55b0403fc14744d0f6a5a31478c87e28dcf67ce27a1494b7f95',
  'src/app/assets/fonts/oxanium.ttf': '2ce01d946e1e1ffc8d7eecfffbda8623bedd63eaf811a20488c4b69af45babb0',
};
/** SHA-256 of the SIL Open Font License 1.1 from "This Font Software is licensed under" to its end. */
const OFL_BODY_HASH = 'fb755fa3280d1d215a20df2e64fe6a0f75f8208439b11671978214aae60d2997';
/** SHA-256 of licence files copied whole from the font's own repository. */
const UPSTREAM_LICENCE_HASHES: Record<string, string> = {
  'src/app/assets/fonts/oxanium-OFL.txt': 'fe17c0f2581d71b4e1ea7e636e7f4877c29223e11bb1dd1a871e8c3f2a86336b',
};

function readText(file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function authorWithoutCopyright(): { font: BundledFont; author: string } {
  for (const font of BUNDLED_FONTS) {
    if (font.authorWithoutCopyright) return { font, author: font.authorWithoutCopyright };
  }
  throw new Error('scripts/font-notices.js names no author without a copyright line');
}

function fontFaces(count: number): string {
  return Array.from({ length: count }, (_, index) => `@font-face{font-family:Sample ${index};src:local(Sample)}`).join('');
}

/** A notice's lines: each credit followed by its source, then the licence and its link. */
function noticeLines(): string[] {
  return [
    ...BUNDLED_FONTS.flatMap(font => [font.credit, `(${font.source}).`]),
    'Each is licensed under the SIL Open Font License.',
    `Licence text: ${LICENCE_REFERENCE}`,
  ];
}

function comment(lines: readonly string[], opener = '/*!'): string {
  return [`${opener} Fonts bundled below, unmodified:`, ...lines.map(line => ` *  ${line}`), ' */'].join('\n');
}

function stylesheet(lines: readonly string[] = noticeLines()): string {
  return `${comment(lines)}\n${fontFaces(BUNDLED_FONTS.length)}`;
}

function inserted(lines: readonly string[], line: string, place: 'before' | 'after', anchor: string): string[] {
  const found = lines.indexOf(anchor);
  if (found === -1) throw new Error(`no line "${anchor}" in the sample notice`);
  const index = place === 'before' ? found : found + 1;
  return [...lines.slice(0, index), line, ...lines.slice(index)];
}

function wrapped(lines: readonly string[], width: number): string[] {
  const result: string[] = [];
  let current = '';
  for (const word of lines.join(' ').split(' ')) {
    if (current && current.length + word.length + 1 > width) {
      result.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  return current ? [...result, current] : result;
}

describe('bundled font notices', () => {
  it('accepts a stylesheet whose preserved notice credits every bundled font with its source and links the licence text, before the fonts', () => {
    expect(fontNoticeProblems(stylesheet())).toEqual([]);
  });

  it('reports a stylesheet without a preserved notice, which the build would strip', () => {
    expect(fontNoticeProblems('')).toEqual([MISSING_NOTICE]);
    expect(fontNoticeProblems(`${comment(noticeLines(), '/*')}\n${fontFaces(BUNDLED_FONTS.length)}`)).toEqual([MISSING_NOTICE]);
  });

  it('names the credit, source or licence link a notice leaves out', () => {
    const parts = [...BUNDLED_FONTS.flatMap(font => [font.credit, font.source]), LICENCE_REFERENCE];
    for (const part of parts) {
      const lines = noticeLines().map(line => line.replace(part, '')).filter(line => line !== '');
      const problems = fontNoticeProblems(stylesheet(lines));
      expect(problems, part).toHaveLength(1);
      expect(problems[0]).toContain(part);
    }
  });

  it('reports a notice that comes after the first @font-face rule', () => {
    const problems = fontNoticeProblems(`${fontFaces(BUNDLED_FONTS.length)}\n${comment(noticeLines())}`);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('@font-face');
  });

  it('accepts a notice wrapped over several lines with comment prefixes', () => {
    const lines = wrapped(noticeLines(), 24);
    expect(lines.length).toBeGreaterThan(noticeLines().length);
    expect(fontNoticeProblems(stylesheet(lines))).toEqual([]);
  });

  it('lists every font file the repository holds, and no other', () => {
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }).split('\0').filter(file => FONT_FILE.test(file));
    expect(files.sort()).toEqual(BUNDLED_FONTS.map(font => font.font).sort());
  });

  it('keeps the bundled fonts unmodified', () => {
    expect(Object.keys(FONT_HASHES).sort()).toEqual(BUNDLED_FONTS.map(font => font.font).sort());
    for (const font of BUNDLED_FONTS) {
      expect(sha256(fs.readFileSync(path.join(root, font.font))), font.font).toBe(FONT_HASHES[font.font]);
    }
  });

  it('keeps each licence text verbatim', () => {
    for (const font of BUNDLED_FONTS) {
      expect(fs.existsSync(path.join(root, font.licence)), font.licence).toBe(true);
      const text = readText(font.licence);
      const upstream = UPSTREAM_LICENCE_HASHES[font.licence];
      if (upstream) {
        expect(sha256(text), font.licence).toBe(upstream);
        continue;
      }
      const [credit, source, blank, ...body] = text.split('\n');
      expect([credit, source, blank], font.licence).toEqual([`${font.credit}.`, `Source: ${font.source}`, '']);
      expect(sha256(body.join('\n')), font.licence).toBe(OFL_BODY_HASH);
    }
    expect(Object.keys(UPSTREAM_LICENCE_HASHES).every(file => BUNDLED_FONTS.some(font => font.licence === file))).toBe(true);
    expect(UPSTREAM_LICENCE_HASHES[authorWithoutCopyright().font.licence]).toBeUndefined();
  });

  it('credits every font in the stylesheet source', () => {
    expect(fontNoticeProblems(readText('styles/main.scss'))).toEqual([]);
  });

  it('credits every font in the third-party notices', () => {
    const notices = readText('THIRD_PARTY_NOTICES.md');
    for (const font of BUNDLED_FONTS) {
      for (const part of [font.credit, font.source, font.licence]) expect(notices, part).toContain(part);
    }
    expect(copyrightClaimProblems(notices)).toEqual([]);
  });

  it('counts a built stylesheet\'s @font-face rules against the list', () => {
    expect(fontFaceCountProblems(fontFaces(BUNDLED_FONTS.length))).toEqual([]);
    expect(fontFaceCountProblems(fontFaces(BUNDLED_FONTS.length + 1))).toHaveLength(1);
    expect(fontFaceCountProblems(fontFaces(BUNDLED_FONTS.length - 1))).toHaveLength(1);
  });

  it('reports a script that inlines a font', () => {
    expect(scriptFontProblems('const image = "data:image/png;base64,AAAA";')).toEqual([]);
    for (const url of ['data:font/ttf;base64,AAAA', 'data:application/font-woff;base64,AAAA']) {
      expect(scriptFontProblems(`const font = "${url}";`), url).toHaveLength(1);
    }
  });

  it('attributes no copyright line to an author who published none', () => {
    const { font, author } = authorWithoutCopyright();
    expect(copyrightClaimProblems(comment(noticeLines()))).toEqual([]);
    const claims = [
      inserted(noticeLines(), `Copyright (c) 1998, ${author}.`, 'after', `(${font.source}).`),
      inserted(noticeLines(), '(1998)', 'after', font.credit),
      inserted(noticeLines(), 'Copyright (c) 1998', 'before', font.credit),
    ];
    for (const lines of claims) {
      const problems = fontNoticeProblems(stylesheet(lines));
      expect(problems, lines.join(' ')).toHaveLength(1);
      expect(problems[0]).toContain(author);
      expect(copyrightClaimProblems(comment(lines))).toEqual(problems);
    }
  });
});
