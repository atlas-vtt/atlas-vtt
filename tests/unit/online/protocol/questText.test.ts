import { describe, expect, it } from 'vitest';
import {
  MAX_ASSET_BYTES, MAX_EMBED_TARGET, MAX_QUEST_IMAGES, parseAsset, parseBookQuest, parseTextAsset, questEmbeds, readQuestText, TEXT_MIME_TYPE, type BookQuest,
} from '../../../../src/app/online/protocol/index.ts';

const HASH = 'b'.repeat(64);
const TEXT = { hash: HASH, size: 50_000, mime: TEXT_MIME_TYPE };
const IMAGE = { target: 'Maps/cellar.png', width: 300, height: null, image: { hash: 'c'.repeat(64), size: 900, mime: 'image/png' } };
const QUEST: BookQuest = { id: 'fedcba9876543210fedcba98', kind: 'side', state: 'open', title: 'The cellar', body: 'Go down.', place: null, xp: 0, rewards: [] };

describe('a quest\'s whole text and images as the page reads them', () => {
  it('reads a text reference only of Markdown, and an image reference never of it', () => {
    expect(parseTextAsset(TEXT)).toEqual(TEXT);
    expect(parseAsset(TEXT)).toBeNull();
    for (const bad of [
      { ...TEXT, mime: 'image/png' }, { ...TEXT, mime: 'text/html' }, { ...TEXT, mime: 'text/plain' }, { ...TEXT, hash: 'B'.repeat(64) }, { ...TEXT, hash: 'b'.repeat(63) },
      { ...TEXT, size: -1 }, { ...TEXT, size: 1.5 }, { ...TEXT, size: MAX_ASSET_BYTES + 1 }, { hash: HASH, size: 1 }, null, 'text', [TEXT],
    ]) expect(parseTextAsset(bad), JSON.stringify(bad)).toBeNull();
  });

  it('takes a quest with its whole text and images, and one without them as an older GM sends it', () => {
    const full = { ...QUEST, text: TEXT, images: [IMAGE, { ...IMAGE, target: 'cellar.png', width: 300, height: 200 }] };
    expect(parseBookQuest(JSON.parse(JSON.stringify(full)))).toEqual(full);
    expect(parseBookQuest(QUEST)).toEqual(QUEST);
    expect(parseBookQuest({ ...QUEST, images: [] })).toEqual(QUEST);
    expect(parseBookQuest({ ...QUEST, images: [{ target: 'a.png', image: IMAGE.image }] })?.images).toEqual([{ target: 'a.png', width: null, height: null, image: IMAGE.image }]);
  });

  it('refuses a quest whose whole text or images are malformed', () => {
    for (const bad of [
      { text: { ...TEXT, mime: 'image/png' } }, { text: null }, { images: {} }, { images: Array.from({ length: MAX_QUEST_IMAGES + 1 }, () => IMAGE) },
      { images: [{ ...IMAGE, image: TEXT }] }, { images: [{ ...IMAGE, target: '' }] }, { images: [{ ...IMAGE, target: ' a.png' }] },
      { images: [{ ...IMAGE, target: 'x'.repeat(MAX_EMBED_TARGET + 1) }] }, { images: [{ ...IMAGE, width: 0 }] }, { images: [{ ...IMAGE, height: 2.5 }] },
    ]) expect(parseBookQuest({ ...QUEST, ...bad }), JSON.stringify(bad).slice(0, 80)).toBeNull();
  });

  it('finds the image embeds of a text in order, with their targets as written and the sizes they ask for', () => {
    const text = [
      'See ![[cellar.png|300]] and ![[Maps/well.webp|300x200]].',
      '![A door|120](<Maps/the door.png>) ![](relative/path.jpg "Title") ![](https://example.com/x.png)',
      '![[Other note]] ![[cellar.png|a caption]] [[Not an embed.png]] ![[]]',
    ].join('\n');
    expect(questEmbeds(text)).toEqual([
      { target: 'cellar.png', width: 300, height: null },
      { target: 'Maps/well.webp', width: 300, height: 200 },
      { target: 'Maps/the door.png', width: 120, height: null },
      { target: 'relative/path.jpg', width: null, height: null },
      { target: 'https://example.com/x.png', width: null, height: null },
      { target: 'Other note', width: null, height: null },
      { target: 'cellar.png', width: null, height: null },
    ]);
  });

  it('reads a whole text from its bytes as UTF-8, cleaned as a book\'s text, and nothing else', () => {
    const text = `Über den Fluss 🐸 ${'Wörter '.repeat(10_000)}`;
    expect(readQuestText(new TextEncoder().encode(`${text}\u0007\n\n\n\nEnd`))).toBe(`${text.trimEnd()}\n\nEnd`);
    expect(readQuestText(new Uint8Array([0xff, 0xfe, 0x41]))).toBeNull();
  });
});
