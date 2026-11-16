// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';
import { registerConversionConsent, type ConsentDialog } from '../../../src/app/plugin/soundConsent';
import { ConversionConsentModal, type ConversionConsentOptions } from '../../../src/app/soundLibrary/ConversionConsentModal';
import type { OriginalsChoice, SoundRootState } from '../../../src/app/soundLibrary/SoundRoots';
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
  unlink: ReturnType<typeof vi.fn>;
  setOriginals: ReturnType<typeof vi.fn>;
}

function world(init: Partial<World> = {}): World {
  return {
    roots: new Map([['music', 'Audio/Music']]), choices: new Map(), walked: new Set(['music']), on: true,
    canTrash: true, canWrite: true, failWrite: new Set(), closed: 0, shown: [], listeners: new Set(), unlink: vi.fn(), setOriginals: vi.fn(), ...init,
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
      unlink: (kind: SoundKind) => { w.unlink(kind); w.roots.delete(kind); fire(); },
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
    expect(w.unlink).toHaveBeenCalledWith('music');
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
    expect(w.unlink).toHaveBeenCalledWith('music');
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
    expect(w.unlink).not.toHaveBeenCalled();
    expect(w.setOriginals).not.toHaveBeenCalled();
  });

  it('leaves a root relinked elsewhere alone when the old modal is cancelled', async () => {
    const w = world();
    const { fire } = start(w); await settle();
    w.roots.set('music', 'Other/Path'); w.walked.clear(); fire(); await settle();
    expect(w.closed).toBe(1);
    expect(w.unlink).not.toHaveBeenCalled();
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
