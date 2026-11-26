// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESEND_MS, SETTLE_MS } from '../../../../src/app/online/gmScreen/statblocks/StatblockDrawing.ts';
import { LIST_MS } from '../../../../src/app/online/gmScreen/statblocks/StatblocksScreen.ts';
import { parseGmScreenMessage, type DrawnNode } from '../../../../src/app/online/protocol/index.ts';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { sha256 } from '../../../../src/app/utils/hashing';
import { STATBLOCK_SCENARIOS } from '../../../fixtures/gmScreenStatblockNotes';
import { statblocksRig, TestScene, tokensOf, type StatblocksRig } from './statblocksRig';

const [native, auto] = STATBLOCK_SCENARIOS.filter((scenario) => scenario.id === 'native' || scenario.id === 'auto');
const ART = readFileSync(path.resolve(__dirname, '../../../fixtures/images/rgb8.png'));
const artBytes = (): ArrayBuffer => ART.buffer.slice(ART.byteOffset, ART.byteOffset + ART.byteLength);

/** Long enough for a drawing to settle and be read twice over, and for the list to be read again. */
const quiet = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, RESEND_MS + SETTLE_MS * 2 + LIST_MS));

const textOf = (nodes: readonly DrawnNode[]): string => nodes.map((node) => (typeof node === 'string' ? node : textOf(node.k ?? []))).join('');

let rig: StatblocksRig | null = null;

function start(scene: TestScene): StatblocksRig {
  rig = statblocksRig([native!, auto!], scene, artBytes());
  return rig;
}

afterEach(() => {
  rig?.screen.dispose();
  if (rig) TemplateLibrary.release(rig.harness.app);
  rig?.harness.dispose();
  rig = null;
  document.body.replaceChildren();
});

describe('the Statblocks screen in Atlas', () => {
  it('sends a device the statblocks of the map in front when it opens, and again only when they change', async () => {
    const scene = new TestScene('view-1', { ...tokensOf(native!), ...tokensOf(auto!) });
    const { heard, open } = start(scene);
    open('d1');

    await vi.waitFor(() => expect(heard('d1', 'statblocks').at(-1)?.entries).toHaveLength(2), { timeout: 5000 });
    const [hag, lurker] = heard('d1', 'statblocks').at(-1)!.entries;
    expect(hag).toEqual({ id: hag!.id, name: 'Marsh Hag', portrait: await sha256(new Uint8Array(artBytes())), count: 1, turn: false, fight: false, player: false });
    expect(lurker).toMatchObject({ name: 'Bog Lurker', portrait: null, count: 1 });
    expect(JSON.stringify(heard('d1', 'statblocks'))).not.toContain('Bestiary/');

    const lists = heard('d1', 'statblocks').length;
    // A token moved: the list is the same, and is not sent again.
    scene.setTokens({ ...Object.fromEntries(Object.entries(tokensOf(native!)).map(([id, token]) => [id, { ...token, x: 500 }])), ...tokensOf(auto!) });
    await quiet();
    expect(heard('d1', 'statblocks')).toHaveLength(lists);

    // A second hag came onto the map.
    scene.setTokens({ ...scene.state().objects.tokens, 'hag-2': { ...tokensOf(native!)['hag-1']!, id: 'hag-2' } });
    await vi.waitFor(() => expect(heard('d1', 'statblocks').at(-1)?.entries[0]).toMatchObject({ name: 'Marsh Hag', count: 2 }), { timeout: 5000 });
  });

  it('sends the list of the map brought to the front, and says so when no map is', async () => {
    const { heard, open, front } = start(new TestScene('view-1', tokensOf(native!)));
    open('d1');
    await vi.waitFor(() => expect(heard('d1', 'statblocks').at(-1)?.entries.map((entry) => entry.name)).toEqual(['Marsh Hag']), { timeout: 5000 });

    front(new TestScene('view-2', tokensOf(auto!), 'atlas-vtt/maps/Bog.atlasmap'));
    await vi.waitFor(() => expect(heard('d1', 'statblocks').at(-1)?.entries.map((entry) => entry.name)).toEqual(['Bog Lurker']), { timeout: 5000 });

    front(null);
    await vi.waitFor(() => expect(heard('d1', 'statblocks').at(-1)).toEqual({ t: 'statblocks', map: false, entries: [] }), { timeout: 5000 });
  });

  it('sends the statblock a device opens as the DM screen draws it, again when it changes, and not without a change', async () => {
    const scene = new TestScene('view-1', tokensOf(native!));
    const { heard, open, screen, harness } = start(scene);
    open('d1');
    await vi.waitFor(() => expect(heard('d1', 'statblocks').at(-1)?.entries).toHaveLength(1), { timeout: 5000 });
    const id = heard('d1', 'statblocks').at(-1)!.entries[0]!.id;

    screen.message('d1', { t: 'statblock-view', id });
    await vi.waitFor(() => expect(heard('d1', 'statblock')).toHaveLength(1), { timeout: 5000 });
    const [first] = heard('d1', 'statblock');
    expect(parseGmScreenMessage(JSON.parse(JSON.stringify(first)))).toEqual(first);
    expect(textOf(first!.nodes)).toContain('Marsh Hag');
    expect(textOf(first!.nodes)).toContain('Drowning Curse');
    expect(JSON.stringify(first)).not.toMatch(/Bestiary\/|Art\/|app:\/\/|Marsh Campaign/);
    // The token's art, by the hash it is sent by.
    expect(JSON.stringify(first)).toContain(`"src":"${await sha256(new Uint8Array(artBytes()))}"`);

    // Nothing the statblock shows changed: nothing is sent.
    scene.setTokens(Object.fromEntries(Object.entries(tokensOf(native!)).map(([tokenId, token]) => [tokenId, { ...token, x: 900 }])));
    await quiet();
    expect(heard('d1', 'statblock')).toHaveLength(1);

    // The note was edited while the device shows it.
    harness.edit(native!.path, native!.note.replace('name: Marsh Hag', 'name: Marsh Crone'));
    await vi.waitFor(() => expect(textOf(heard('d1', 'statblock').at(-1)!.nodes)).toContain('Marsh Crone'), { timeout: 5000 });
  });

  it('stops drawing and sending a statblock once its device leaves it, or goes', async () => {
    const { heard, open, screen, harness } = start(new TestScene('view-1', tokensOf(native!)));
    open('d1');
    open('d2');
    await vi.waitFor(() => expect(heard('d2', 'statblocks').at(-1)?.entries).toHaveLength(1), { timeout: 5000 });
    const id = heard('d1', 'statblocks').at(-1)!.entries[0]!.id;
    screen.message('d1', { t: 'statblock-view', id });
    screen.message('d2', { t: 'statblock-view', id });
    await vi.waitFor(() => expect(heard('d2', 'statblock')).toHaveLength(1), { timeout: 5000 });
    expect(document.querySelectorAll('.atlas-gm-screen-drawing')).toHaveLength(1);

    screen.message('d1', { t: 'statblock-view', id: null });
    screen.closed('d2');
    expect(document.querySelectorAll('.atlas-gm-screen-drawing')).toHaveLength(0);
    harness.edit(native!.path, native!.note.replace('name: Marsh Hag', 'name: Marsh Crone'));
    await quiet();
    expect(heard('d1', 'statblock')).toHaveLength(1);
    expect(heard('d2', 'statblock')).toHaveLength(1);
  });

  it('sends a statblock and the list anew over a channel opened again, and a picture only by a hash it gave', async () => {
    const { heard, open, screen } = start(new TestScene('view-1', tokensOf(native!)));
    open('d1');
    await vi.waitFor(() => expect(heard('d1', 'statblocks').at(-1)?.entries).toHaveLength(1), { timeout: 5000 });
    const { id, portrait } = heard('d1', 'statblocks').at(-1)!.entries[0]!;
    screen.message('d1', { t: 'statblock-view', id });
    await vi.waitFor(() => expect(heard('d1', 'statblock')).toHaveLength(1), { timeout: 5000 });

    open('d1');
    expect(heard('d1', 'statblocks')).toHaveLength(2);
    expect(heard('d1', 'statblock')).toHaveLength(2);

    screen.message('d1', { t: 'portrait-ask', hash: portrait! });
    screen.message('d1', { t: 'portrait-ask', hash: 'f'.repeat(64) });
    expect(heard('d1', 'portrait')).toEqual([{ t: 'portrait', hash: portrait, mime: 'image/png', data: ART.toString('base64') }]);
  });

  it('says a statblock is gone where the device asks for one the map in front does not show', async () => {
    const { heard, open, screen } = start(new TestScene('view-1', tokensOf(native!)));
    open('d1');
    // An id of an earlier load of Atlas, asked for before this one has read the map.
    screen.message('d1', { t: 'statblock-view', id: 's99' });

    await vi.waitFor(() => expect(heard('d1', 'statblock-gone')).toEqual([{ t: 'statblock-gone', id: 's99', reason: 'gone' }]), { timeout: 5000 });
    expect(document.querySelectorAll('.atlas-gm-screen-drawing')).toHaveLength(0);
  });
});

