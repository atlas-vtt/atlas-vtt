import { describe, expect, it, vi } from 'vitest';
import { canCopyItems, copyTextWhenReady } from '../../../src/app/platform/clipboardWrites';

/** A clipboard item as far as the tests read it: what it was made with. */
class FakeItem {
  constructor(readonly items: Record<string, Promise<Blob> | Blob | string>) {}
}

type FakeWindow = Parameters<typeof canCopyItems>[0] & object;

function fakeWindow(parts: { write?: boolean; item?: boolean } = { write: true, item: true }): { win: FakeWindow; write: ReturnType<typeof vi.fn>; writeText: ReturnType<typeof vi.fn> } {
  const write = vi.fn(async (_items: unknown[]): Promise<void> => undefined);
  const writeText = vi.fn(async (_text: string): Promise<void> => undefined);
  const clipboard = { writeText, ...(parts.write && { write }) };
  const win = { navigator: { clipboard }, ...(parts.item && { ClipboardItem: FakeItem }) } as unknown as FakeWindow;
  return { win, write, writeText };
}

describe('whether a window copies pictures', () => {
  it('needs clipboard items and a clipboard that takes them', () => {
    expect(canCopyItems(fakeWindow().win)).toBe(true);
    expect(canCopyItems(fakeWindow({ write: true }).win)).toBe(false);
    expect(canCopyItems(fakeWindow({ item: true }).win)).toBe(false);
    expect(canCopyItems({ navigator: {} } as unknown as FakeWindow)).toBe(false);
  });
});

describe('a text copied while it is still on its way', () => {
  it('is written once it is there in the desktop app, as before', async () => {
    const { win, write, writeText } = fakeWindow();
    let arrive: (text: string) => void = () => undefined;
    const copying = copyTextWhenReady(new Promise<string>((resolve) => { arrive = resolve; }), win, true);

    await Promise.resolve();
    expect(writeText).not.toHaveBeenCalled();
    arrive('[[Crypt]]');
    await copying;

    expect(writeText).toHaveBeenCalledExactlyOnceWith('[[Crypt]]');
    expect(write).not.toHaveBeenCalled();
  });

  it('asks the clipboard at once on a tablet, with an item that waits for the text', async () => {
    const { win, write, writeText } = fakeWindow();
    let arrive: (text: string) => void = () => undefined;
    const copying = copyTextWhenReady(new Promise<string>((resolve) => { arrive = resolve; }), win, false);

    // Before the text is there, and before anything was awaited: within the press.
    expect(write).toHaveBeenCalledOnce();
    const item = (write.mock.calls[0]?.[0] as FakeItem[])[0];
    arrive('[[Crypt]]');
    await copying;

    expect(Object.keys(item?.items ?? {})).toEqual(['text/plain']);
    const blob = await item?.items['text/plain'];
    expect(blob).toBeInstanceOf(Blob);
    expect(await (blob as Blob).text()).toBe('[[Crypt]]');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to writing the text where a tablet\'s clipboard takes no items', async () => {
    const { win, writeText } = fakeWindow({ item: false, write: false });

    await copyTextWhenReady(Promise.resolve('[[Crypt]]'), win, false);

    expect(writeText).toHaveBeenCalledExactlyOnceWith('[[Crypt]]');
  });

  it('rejects where the text never came', async () => {
    const { win } = fakeWindow();

    await expect(copyTextWhenReady(Promise.reject(new Error('no file')), win, true)).rejects.toThrow('no file');
  });
});
