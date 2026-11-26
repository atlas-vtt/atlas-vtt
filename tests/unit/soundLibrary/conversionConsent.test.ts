// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';
import { registerConversionConsent, type ConsentDialog } from '../../../src/app/plugin/soundConsent';
import { ConversionConsentModal, type ConversionConsentOptions } from '../../../src/app/soundLibrary/ConversionConsentModal';
import { SoundRoots, type OriginalsChoice, type SoundRootState } from '../../../src/app/soundLibrary/SoundRoots';
import type { SharedSoundRoots } from '../../../src/app/soundLibrary/soundRootsStore';
import type { SoundKind } from '../../../src/app/sound/soundTypes';

interface World {
  roots: Map<SoundKind, string>;
  choices: Map<SoundKind, OriginalsChoice>;
  walked: Set<SoundKind>;
  on: boolean;
  canTrash: boolean;
  canWrite: boolean;
  failWrite: Set<SoundKind>;
  closed: number;
  shown: ConversionConsentOptions[];
  listeners: Set<() => void>;
  takeBack: ReturnType<typeof vi.fn>;
  setOriginals: ReturnType<typeof vi.fn>;
}

function world(init: Partial<World> = {}): World {
  return {
    roots: new Map([['music', 'Audio/Music']]), choices: new Map(), walked: new Set(['music']), on: true,
    canTrash: true, canWrite: true, failWrite: new Set(), closed: 0, shown: [], listeners: new Set(), takeBack: vi.fn(), setOriginals: vi.fn(), ...init,
  };
}

function start(w: World): { dialog: ConsentDialog; stop: () => void; fire: () => void } {
  const fire = (): void => w.listeners.forEach((l) => l());
  const listen = (l: () => void): (() => void) => { w.listeners.add(l); return () => w.listeners.delete(l); };
  const library = {
    rootOf: (kind: SoundKind): SoundRootState => w.roots.has(kind) ? { kind, status: 'vault', path: w.roots.get(kind)! } : { kind, status: 'unlinked' },
    locationOf: (kind: SoundKind) => ({ canWrite: async () => { if (w.failWrite.has(kind)) throw new Error('x'); return w.canWrite; }, canTrash: () => w.canTrash }),
    filesOf: () => [1, 2, 3],
    isWalked: (kind: SoundKind) => w.walked.has(kind),
    onChange: listen,
    roots: {
      originalsOf: (kind: SoundKind) => w.choices.get(kind) ?? null,
      setOriginals: (kind: SoundKind, c: OriginalsChoice) => { w.setOriginals(kind, c); w.choices.set(kind, c); fire(); },
      // A root linked where none was: taking it back unlinks it.
      takeBack: (kind: SoundKind) => { w.takeBack(kind); w.roots.delete(kind); fire(); },
      onChange: listen,
    },
  };
  const director = { get isOn() { return w.on; }, subscribe: listen };
  const dialog: ConsentDialog = { open: (o) => { w.shown.push(o); return { close: () => { w.closed += 1; o.onChoose(null); } }; } };
  const stop = registerConversionConsent({ register: () => undefined, app: {} } as unknown as Plugin, library as never, director as never, dialog);
  return { dialog, stop, fire };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('the consent dialog', () => {
  it('asks once for a root without a choice', async () => {
    const w = world();
    const { fire } = start(w);
    await settle();
    fire(); await settle();
    expect(w.shown).toHaveLength(1);
    expect(w.shown[0]).toMatchObject({ folderName: 'Music', fileCount: 3, canTrash: true, canWrite: true });
  });

  it('asks for a 0.13.1 root on start, once its walk ended', async () => {
    const w = world({ walked: new Set() });
    const { fire } = start(w);
    await settle();
    expect(w.shown).toHaveLength(0);
    w.walked.add('music'); fire(); await settle();
    expect(w.shown).toHaveLength(1);
  });

  it('saves a trash choice', async () => {
    const w = world();
    start(w); await settle();
    w.shown[0]!.onChoose('trash');
    expect(w.setOriginals).toHaveBeenCalledWith('music', 'trash');
    await settle();
    expect(w.shown).toHaveLength(1);
  });

  it('saves a keep choice', async () => {
    const w = world();
    start(w); await settle();
    w.shown[0]!.onChoose('keep');
    expect(w.setOriginals).toHaveBeenCalledWith('music', 'keep');
  });

  it('unlinks on cancel and does not ask again', async () => {
    const w = world();
    start(w); await settle();
    w.shown[0]!.onChoose(null);
    expect(w.takeBack).toHaveBeenCalledWith('music');
    await settle();
    expect(w.shown).toHaveLength(1);
  });

  it('asks again for a folder linked again after a cancel, the same one or another', async () => {
    const w = world();
    const { fire } = start(w); await settle();
    w.shown[0]!.onChoose(null);
    expect(w.roots.has('music')).toBe(false);
    w.roots.set('music', 'Audio/Music'); fire(); await settle();
    expect(w.shown).toHaveLength(2);
    w.shown[1]!.onChoose(null); await settle();
    w.roots.set('music', 'Elsewhere/Songs'); fire(); await settle();
    expect(w.shown.map((o) => o.folderName)).toEqual(['Music', 'Music', 'Songs']);
  });

  it('asks one root at a time', async () => {
    const w = world({ roots: new Map([['music', 'A'], ['ambience', 'B']]), walked: new Set(['music', 'ambience']) });
    start(w); await settle();
    expect(w.shown).toHaveLength(1);
    w.shown[0]!.onChoose('keep'); await settle();
    expect(w.shown).toHaveLength(2);
    expect(w.shown[1]!.folderName).toBe('B');
  });

  it('offers only keep where there is no trash', async () => {
    const w = world({ canTrash: false });
    start(w); await settle();
    expect(w.shown[0]).toMatchObject({ canTrash: false, canWrite: true });
  });

  it('reports a folder that cannot be written, which unlinks after OK', async () => {
    const w = world({ canWrite: false });
    start(w); await settle();
    expect(w.shown[0]).toMatchObject({ canWrite: false });
    w.shown[0]!.onChoose(null);
    expect(w.takeBack).toHaveBeenCalledWith('music');
  });

  it('asks nothing while sound is off, then asks when it comes on', async () => {
    const w = world({ on: false });
    const { fire } = start(w); await settle();
    expect(w.shown).toHaveLength(0);
    w.on = true; fire(); await settle();
    expect(w.shown).toHaveLength(1);
  });

  it('asks nothing for a root with a choice', async () => {
    const w = world({ choices: new Map([['music', 'keep']]) });
    start(w); await settle();
    expect(w.shown).toHaveLength(0);
  });
});

describe('the consent dialog under change', () => {
  it('closes an open modal on dispose without unlinking', async () => {
    const w = world();
    const { stop } = start(w); await settle();
    stop();
    expect(w.closed).toBe(1);
    expect(w.takeBack).not.toHaveBeenCalled();
    expect(w.setOriginals).not.toHaveBeenCalled();
  });

  it('leaves a root relinked elsewhere alone when the old modal is cancelled', async () => {
    const w = world();
    const { fire } = start(w); await settle();
    w.roots.set('music', 'Other/Path'); w.walked.clear(); fire(); await settle();
    expect(w.closed).toBe(1);
    expect(w.takeBack).not.toHaveBeenCalled();
    expect(w.roots.get('music')).toBe('Other/Path');
  });

  it('closes without overwriting a choice made elsewhere', async () => {
    const w = world();
    const { fire } = start(w); await settle();
    w.choices.set('music', 'keep'); fire(); await settle();
    expect(w.closed).toBe(1);
    w.shown[0]!.onChoose('trash');
    expect(w.setOriginals).not.toHaveBeenCalled();
    expect(w.choices.get('music')).toBe('keep');
  });

  it('asks the next root after canWrite fails for one', async () => {
    const w = world({ roots: new Map([['music', 'A'], ['ambience', 'B']]), walked: new Set(['music', 'ambience']), failWrite: new Set(['music']) });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    start(w); await settle();
    quiet.mockRestore();
    expect(w.shown.map((o) => o.folderName)).toEqual(['B']);
  });
});

describe('ConversionConsentModal', () => {
  const open = (extra: Partial<ConversionConsentOptions>): { modal: ConversionConsentModal; onChoose: ReturnType<typeof vi.fn> } => {
    const onChoose = vi.fn();
    const modal = new ConversionConsentModal({} as never, { folderName: 'Music', fileCount: 3, canTrash: true, canWrite: true, onChoose, ...extra });
    modal.onOpen();
    return { modal, onChoose };
  };
  const buttons = (m: ConversionConsentModal): string[] => [...m.contentEl.querySelectorAll('button')].map((b) => b.textContent ?? '');

  it('offers trash, keep and cancel', () => {
    const { modal } = open({});
    expect(buttons(modal)).toEqual(['Convert and move originals to the trash', 'Convert and keep originals', 'Cancel']);
  });

  it('offers only keep, with its line, without a trash', () => {
    const { modal } = open({ canTrash: false });
    expect(buttons(modal)).toEqual(['Convert and keep originals', 'Cancel']);
    expect(modal.contentEl.textContent).toContain('no trash');
  });

  it('words an empty folder\'s question for the files added later, never as all 0 sounds', () => {
    const { modal } = open({ fileCount: 0 });
    expect(modal.contentEl.textContent).toContain('Music holds no sounds yet. Atlas converts the sounds you add to it to Opus, in this folder.');
    expect(modal.contentEl.textContent).not.toMatch(/\b0 sounds/);
    expect(buttons(modal)).toEqual(['Convert and move originals to the trash', 'Convert and keep originals', 'Cancel']);
    expect(open({ fileCount: 3 }).modal.contentEl.textContent).toContain('Atlas converts all 3 sounds in Music to Opus');
  });

  it('shows only OK where it cannot write', () => {
    const { modal } = open({ canWrite: false });
    expect(buttons(modal)).toEqual(['OK']);
  });

  it('answers once: a choice, then the close that follows it', () => {
    const { modal, onChoose } = open({});
    modal.contentEl.querySelectorAll('button')[1]!.click();
    modal.onClose();
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('keep');
  });

  it('answers null when closed any other way', () => {
    const { modal, onChoose } = open({});
    modal.onClose();
    expect(onChoose).toHaveBeenCalledWith(null);
  });
});

/** The GM's real roots, their facts in memory, set up by `before` and then with the consent dialog over them. */
async function realRoots(before: (roots: SoundRoots) => Promise<void> = async () => undefined): Promise<{ roots: SoundRoots; shown: ConversionConsentOptions[] }> {
  let shared: SharedSoundRoots = {};
  const local = new Map<SoundKind, string | null>();
  const originals = new Map<SoundKind, OriginalsChoice | null>();
  const roots = new SoundRoots({
    shared: () => shared,
    setShared: (next) => { shared = next; },
    onSharedChange: () => () => undefined,
    local: (kind) => local.get(kind) ?? null,
    setLocal: (kind, path) => local.set(kind, path),
    localOriginals: (kind) => originals.get(kind) ?? null,
    setLocalOriginals: (kind, choice) => originals.set(kind, choice),
    vaultBase: () => '/vault',
    realPath: async (path) => path,
  });
  await before(roots);
  const shown: ConversionConsentOptions[] = [];
  const library = {
    rootOf: (kind: SoundKind) => roots.stateOf(kind),
    locationOf: () => ({ canWrite: async () => true, canTrash: () => true }),
    filesOf: () => [1, 2, 3],
    isWalked: () => true,
    onChange: () => () => undefined,
    roots,
  };
  const director = { isOn: true, subscribe: () => () => undefined };
  registerConversionConsent({ register: () => undefined, app: {} } as unknown as Plugin, library as never, director as never, { open: (o) => { shown.push(o); return { close: () => o.onChoose(null) }; } });
  return { roots, shown };
}

describe('cancelling the question for a folder that took another\'s place', () => {
  it.each([
    ['in the vault', '/vault/Audio/Music', { kind: 'music', status: 'vault', path: 'Audio/Music' }],
    ['on a disk', '/home/gm/Music', { kind: 'music', status: 'external', path: '/home/gm/Music' }],
  ] as const)('brings back the folder linked before, %s, with its choice', async (_where, first, linked) => {
    const { roots, shown } = await realRoots(async (set) => {
      await set.linkChosen('music', first);
      set.setOriginals('music', 'keep');
    });
    await settle();
    expect(shown).toHaveLength(0);

    await roots.linkChosen('music', '/home/gm/outside-music');
    await settle();
    expect(shown.map((o) => o.folderName)).toEqual(['outside-music']);
    shown[0]!.onChoose(null);

    expect(roots.stateOf('music')).toEqual(linked);
    expect(roots.originalsOf('music')).toBe('keep');
    await settle();
    expect(shown).toHaveLength(1);
    // The folder cancelled is asked about again when it is linked again.
    await roots.linkChosen('music', '/home/gm/outside-music');
    await settle();
    expect(shown).toHaveLength(2);
  });

  it('unlinks a folder linked where none was, and one that took the place of a folder still without a choice', async () => {
    const { roots, shown } = await realRoots();
    await roots.linkChosen('music', '/home/gm/A');
    await settle();
    await roots.linkChosen('music', '/home/gm/B');
    await settle();
    for (const question of shown) question.onChoose(null);
    expect(roots.stateOf('music').status).toBe('unlinked');
  });

  it('forgets the folder before once the new one has its choice', async () => {
    const { roots, shown } = await realRoots(async (set) => {
      await set.linkChosen('music', '/home/gm/A');
      set.setOriginals('music', 'trash');
    });
    await roots.linkChosen('music', '/home/gm/B');
    await settle();
    shown[0]!.onChoose('keep');
    roots.takeBack('music');
    expect(roots.stateOf('music').status).toBe('unlinked');
  });
});
