import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { CampaignPlay } from '../../src/app/campaigns/campaignPlay';
import { QuestIndex } from '../../src/app/campaigns/quests/QuestIndex';
import { sha256Hex } from '../../src/app/online/gm/assetServe';
import { ASSET_CAPS, MAX_QUEST_BODY, readQuestText, TEXT_MIME_TYPE } from '../../src/app/online/protocol/index.ts';
import type { HandedQuest } from '../../src/app/online/gm/book/questGate';
import { campaignQuestGate } from '../../src/app/plugin/campaignQuestGate';
import { memoryCampaigns } from '../mocks/memoryCampaigns';
import { questVault, type QuestVault } from '../mocks/questVault';

const note = (campaign: string, body: string): string => `---\natlas-type: quest\ncampaign: ${campaign}\n---\n${body}\n`;

/** The first bytes of a PNG of this size, as far as a header is read; `seed` makes another image of it. */
function png(width: number, height: number, seed = 0): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(40);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  bytes[39] = seed;
  return bytes;
}

const opened: App[] = [];
afterEach(() => {
  for (const app of opened.splice(0)) QuestIndex.release(app);
});

/** A vault with these notes and images, two campaigns, Blood Olms played, and the gate players' books ask. */
function setUp(files: Record<string, string>, images: Record<string, Uint8Array<ArrayBuffer>> = {}): { vault: QuestVault; images: Map<string, Uint8Array<ArrayBuffer>>; gate: ReturnType<typeof campaignQuestGate> } {
  const binaries = new Map(Object.entries(images));
  const vault = questVault({ ...files, ...Object.fromEntries([...binaries.keys()].map((path) => [path, 'image'])) });
  opened.push(vault.app);
  const read = vault.app.vault.readBinary.bind(vault.app.vault);
  vault.app.vault.readBinary = vi.fn((file: TFile) => {
    const bytes = binaries.get(file.path);
    return bytes === undefined ? read(file) : Promise.resolve(bytes.buffer);
  });
  // Obsidian's link resolution hands out the vault's own file, with its time and size.
  const resolve = vault.app.metadataCache.getFirstLinkpathDest.bind(vault.app.metadataCache);
  vault.app.metadataCache.getFirstLinkpathDest = vi.fn((linkpath: string, from: string) => {
    const found = resolve(linkpath, from);
    return found === null ? null : vault.app.vault.getFileByPath(found.path);
  });
  const index = QuestIndex.open(vault.app);
  const storage = memoryCampaigns([{ id: 'c-1', name: 'Blood Olms', createdAt: 1 }, { id: 'c-2', name: 'Witherwild', createdAt: 2 }]);
  const play = CampaignPlay.forApp(vault.app);
  play.play('c-1');
  return { vault, images: binaries, gate: campaignQuestGate(vault.app, () => play, () => storage, () => index) };
}

const byTitle = (quests: readonly HandedQuest[], title: string): HandedQuest | undefined => quests.find((quest) => quest.title === title);

describe('a quest\'s whole text', () => {
  it('is handed on whole by hash, however long, in any script, while its opening stays within the book\'s limit and ends at a word', async () => {
    const long = `Read this. %%The GM's secret.%%\n\n${'word '.repeat(10_000)}\n\nThe end.`;
    const script = `${'Über dem Fluss: Frösche 🐸 und Kröten. '.repeat(1_300)}Ende.`;
    const { gate } = setUp({ 'Q/Long.md': note('Blood Olms', long), 'Q/Script.md': note('Blood Olms', script), 'Q/Short.md': note('Blood Olms', 'Go down.') });
    const quests = await gate.quests();
    for (const [title, expected] of [['Long', `Read this.\n\n${'word '.repeat(10_000).trimEnd()}\n\nThe end.`], ['Script', script]] as const) {
      const quest = byTitle(quests, title);
      expect([...(quest?.body ?? '')].length).toBeLessThanOrEqual(MAX_QUEST_BODY);
      expect(expected.startsWith(quest?.body ?? 'none')).toBe(true);
      expect(/\S$/.test(quest?.body ?? '') && /\s/.test(expected.charAt(quest?.body.length ?? 0))).toBe(true);
      expect(quest?.text?.mime).toBe(TEXT_MIME_TYPE);
      const asset = gate.asset(quest?.text?.hash ?? '');
      if (asset === undefined || !('bytes' in asset)) throw new Error('no text served');
      expect(asset.bytes.length).toBe(quest?.text?.size);
      expect(await sha256Hex(asset.bytes)).toBe(quest?.text?.hash);
      expect(readQuestText(asset.bytes)).toBe(expected.trimEnd());
    }
    expect(expectLength(byTitle(quests, 'Long'))).toBeGreaterThan(50_000);
    expect(byTitle(quests, 'Long')?.body).not.toContain('secret');
    // A short text is its own opening: nothing more to fetch.
    expect(byTitle(quests, 'Short')).toEqual(expect.objectContaining({ body: 'Go down.' }));
    expect(byTitle(quests, 'Short')).not.toHaveProperty('text');
    // Handed on by hash: the table's books store the text and name it by its id.
    expect(byTitle(quests, 'Long')?.text).not.toHaveProperty('id');
  });

  it('is hashed again only when the note\'s text changes, and is sent as its opening alone past the largest asset', async () => {
    const { vault, gate } = setUp({ 'Q/Long.md': note('Blood Olms', 'word '.repeat(1_000)) });
    const first = (await gate.quests())[0];
    const digest = vi.spyOn(crypto.subtle, 'digest');
    vault.write('Q/Long.md', note('Blood Olms', 'word '.repeat(1_000)).replace('campaign: Blood Olms', 'campaign: Blood Olms\nstatus: active'));
    const second = (await gate.quests())[0];
    expect(second?.state).toBe('active');
    expect(second?.text).toEqual(first?.text);
    expect(digest).not.toHaveBeenCalled();
    digest.mockRestore();

    vault.write('Q/Long.md', note('Blood Olms', 'é'.repeat(ASSET_CAPS.text / 2 + 1)));
    const huge = (await gate.quests())[0];
    expect(huge).not.toHaveProperty('text');
    expect([...(huge?.body ?? '')].length).toBe(MAX_QUEST_BODY);
  });
});

const expectLength = (quest: HandedQuest | undefined): number => quest?.text?.size ?? 0;

describe('the images a quest\'s text embeds', () => {
  it('are the vault images its embeds name, by hash, with their size; never a remote image, another note or a file that is no image', async () => {
    const text = '![[cellar.png|300]] ![The well|200x100](<Art/the well.webp>) ![](https://example.com/x.png) ![[Other note]] ![[Rules.pdf]] ![[fake.png]] ![[missing.png]] [[cellar.png]]';
    const webp = new Uint8Array([...new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8L'), 0, 0, 0, 0, 0x2f, 0x3f, 0, 0, 0, 0, 0, 0, 0, 0]);
    const { gate } = setUp(
      { 'Q/Cellar.md': note('Blood Olms', text), 'Q/Other note.md': 'Text.', 'Q/Rules.pdf': 'pdf', 'W/Elsewhere.md': note('Witherwild', '![[secret.png]]') },
      { 'Q/cellar.png': png(64, 32), 'Art/the well.webp': webp, 'Q/fake.png': new TextEncoder().encode('not an image').slice(), 'W/secret.png': png(8, 8, 9) },
    );
    const quest = (await gate.quests())[0];
    const [cellar, well] = await Promise.all([sha256Hex(png(64, 32)), sha256Hex(webp)]);
    expect(quest?.images).toEqual([
      { target: 'cellar.png', width: 300, height: null, image: { hash: cellar, size: 40, mime: 'image/png' } },
      { target: 'Art/the well.webp', width: 200, height: 100, image: { hash: well, size: webp.length, mime: 'image/webp' } },
    ]);
    expect(gate.asset(cellar)).toEqual({ path: 'Q/cellar.png' });
    expect(gate.asset(await sha256Hex(png(8, 8, 9)))).toBeUndefined();
  });

  it('follow an image that is renamed, written anew or deleted, and say so', async () => {
    const { vault, images, gate } = setUp({ 'Q/Cellar.md': note('Blood Olms', 'Down: ![[cellar.png|300]]') }, { 'Q/cellar.png': png(64, 32) });
    const changed = vi.fn();
    const stop = gate.onChange(changed);
    const first = await gate.quests();
    const hash = first[0]?.images?.[0]?.image.hash ?? '';

    const told = (): number => changed.mock.calls.length;
    images.set('Art/cellar.png', png(64, 32));
    await vault.move('Q/cellar.png', 'Art/cellar.png');
    const afterMove = told();
    expect(afterMove).toBeGreaterThan(0);
    const moved = await gate.quests();
    // The same image under another path: the book is the same, its file is the one served.
    expect(moved).toBe(first);
    expect(gate.asset(hash)).toEqual({ path: 'Art/cellar.png' });

    images.set('Art/cellar.png', png(64, 32, 7));
    vault.write('Art/cellar.png', 'image');
    vault.emit('modify', vault.app.vault.getFileByPath('Art/cellar.png'));
    const afterWrite = told();
    expect(afterWrite).toBeGreaterThan(afterMove);
    const written = await gate.quests();
    expect(written[0]?.images?.[0]?.image.hash).toBe(await sha256Hex(png(64, 32, 7)));
    expect(gate.asset(hash)).toBeUndefined();

    vault.remove('Art/cellar.png');
    expect(told()).toBeGreaterThan(afterWrite);
    expect((await gate.quests())[0]).not.toHaveProperty('images');
    stop();
  });
});
