import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { CampaignPlay } from '../../src/app/campaigns/campaignPlay';
import { QuestIndex } from '../../src/app/campaigns/quests/QuestIndex';
import { sha256Hex } from '../../src/app/online/gm/assetServe';
import { parseGmMessage } from '../../src/app/online/protocol/index.ts';
import { StoredQuests } from '../../src/app/online/gm/book/storedQuests';
import { campaignQuestGate } from '../../src/app/plugin/campaignQuestGate';
import { fakeStoring, storedRef } from './online/gm/fakeStoring';
import { memoryCampaigns } from '../mocks/memoryCampaigns';
import { questVault } from '../mocks/questVault';

const CAMPAIGN = 'b9369e02-78e4-4973-9e87-f7bfcef735f5';
const NOTE_PATH = 'atlas-vtt/campaigns/Test Campaign/quests/Test Quest.md';
const IMAGE_PATH = 'Bestiary/5e SRD/Artwork/FA_Tokens_Webp/Adversaries/Goblinoids/Goblin_Psionic_B3_01.webp';

/** A quest note as the campaign page's New quest writes it, with the text a GM typed into it. */
const NOTE = `---
atlas-type: quest
campaign: ${CAMPAIGN}
kind: main
status: open
atlas-id: eb991190f15fd0ceeedfbb3f
---
# This is a test quest I want to try adding to a player

- section 1. you arrive at the goblin hideout
- section 2. there's a cave with wolves that are chained to the wall. they seem starved
- section 3. there a waterfall in the distance and a bridge overhead but it's too dark to see what's on top

![[Goblin_Psionic_B3_01.webp]]
- On the bridge are two goblin visible with a DC14 perrception check
- They will roll down boulders if they players don't notice them early enough`;

/** The first bytes of a WebP of 280 × 280, as far as a header is read. */
function webp(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(30);
  bytes.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  bytes.set([...'WEBPVP8X'].map((c) => c.charCodeAt(0)), 8);
  const view = new DataView(bytes.buffer);
  view.setUint16(24, 279, true);
  view.setUint16(27, 279, true);
  return bytes;
}

const opened: App[] = [];
afterEach(() => {
  for (const app of opened.splice(0)) QuestIndex.release(app);
});

describe('a quest note made from the campaign page', () => {
  it('reaches a player\'s book whole, with the image it embeds by its stored id, as the page reads the book', async () => {
    const image = webp();
    const vault = questVault({ [NOTE_PATH]: NOTE, [IMAGE_PATH]: 'image' });
    opened.push(vault.app);
    vault.app.vault.readBinary = vi.fn((file: TFile) => (file.path === IMAGE_PATH ? Promise.resolve(image.buffer) : Promise.reject(new Error('no such image'))));
    vault.app.metadataCache.getFirstLinkpathDest = vi.fn((linkpath: string) => (linkpath === 'Goblin_Psionic_B3_01.webp' ? vault.app.vault.getFileByPath(IMAGE_PATH) : null));
    const index = QuestIndex.open(vault.app);
    const storage = memoryCampaigns([{ id: CAMPAIGN, name: 'Test Campaign', createdAt: 1 }]);
    const play = CampaignPlay.forApp(vault.app);
    play.play(CAMPAIGN);
    const gate = campaignQuestGate(vault.app, () => play, () => storage, () => index);

    const quests = await gate.quests();
    expect(quests).toEqual([expect.objectContaining({
      id: 'eb991190f15fd0ceeedfbb3f',
      kind: 'main',
      state: 'open',
      title: 'Test Quest',
      place: null,
      xp: 0,
      rewards: [],
      images: [{ target: 'Goblin_Psionic_B3_01.webp', width: null, height: null, image: { hash: await sha256Hex(image), size: image.length, mime: 'image/webp' } }],
    })]);
    expect(quests[0]?.body).toContain('![[Goblin_Psionic_B3_01.webp]]');

    // Stored for players, its image named by its id, sent as JSON to a player without a character and read by the page's parser.
    const stored = await new StoredQuests(fakeStoring(undefined, (path) => (path === IMAGE_PATH ? image : undefined)), (hash) => gate.asset(hash)).of(quests);
    expect(stored[0]?.images?.[0]?.image).toEqual(await storedRef(image, 'image/webp'));
    const book = { character: null, worldMap: null, items: [], notes: [], pins: [], quests: stored, purse: [] };
    const read = parseGmMessage(JSON.parse(JSON.stringify({ t: 'book', book })));
    expect(read?.t === 'book' ? read.book.quests : null).toEqual(JSON.parse(JSON.stringify(stored)));
  });
});
