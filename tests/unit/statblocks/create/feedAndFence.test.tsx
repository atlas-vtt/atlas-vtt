// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile, type App } from 'obsidian';
import type { ContextMenuEntry } from '../../../../src/app/react/components/context-menu/AtlasContextMenu';

const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
}));
vi.mock('../../../../src/app/react/hooks/useMapCollectionId', () => ({ useMapCollectionId: () => 'marsh' }));
vi.mock('../../../../src/app/statblocks/render/LinkedStatblock', () => ({
  LinkedStatblock: ({ path }: { path: string }) => <div data-testid="statblock">{path}</div>,
}));
vi.mock('../../../../src/app/statblocks/editor/openStatblockEditor', () => ({ openStatblockEditor: vi.fn(async () => undefined) }));

import { StatblockFeedMenu } from '../../../../src/app/statblocks/editor/create/StatblockFeedMenu';
import { FenceStatblock } from '../../../../src/app/statblocks/render/FenceStatblock';
import { openStatblockEditor } from '../../../../src/app/statblocks/editor/openStatblockEditor';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { noteHarness, type NoteHarness } from '../notes/noteHarness';

const NATIVE = 'Bestiary/Marsh Warden.md';
const NATIVE_TEXT = '---\nstatblock: true\natlas-template: builtin:generic-creature\nname: Marsh Warden\n---\n```atlas-statblock\n```\n';
const FANTASY = 'Bestiary/Goblin.md';

let harness: NoteHarness;
const app = (): App => harness.app as unknown as App;

beforeEach(() => {
  harness = noteHarness({ [NATIVE]: NATIVE_TEXT, [FANTASY]: '---\nstatblock: true\nname: Goblin\n---\n' });
  Object.assign(harness.app.workspace, { openLinkText: vi.fn(async () => undefined) });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(openStatblockEditor).mockClear();
  opened.entries = [];
});

function feed(path: string): { onOpened: ReturnType<typeof vi.fn>; container: HTMLElement } {
  const onOpened = vi.fn();
  const { container } = render(
    <StatblockFeedMenu app={app()} path={path} onOpened={onOpened}>
      <div data-testid="feed">{path}</div>
    </StatblockFeedMenu>,
  );
  return { onOpened, container };
}

function chooseEdit(): void {
  fireEvent.contextMenu(screen.getByTestId('feed'));
  const [edit] = opened.entries;
  expect(edit).toMatchObject({ type: 'item', label: 'Edit statblock' });
  if (edit?.type === 'item') void edit.onClick();
}

describe('the DM screen\'s statblock menu', () => {
  it('is absent while the switch is off: the feed is drawn as before, with no element of its own', () => {
    const { container } = feed(NATIVE);
    expect(container.firstElementChild).toBe(screen.getByTestId('feed'));
    fireEvent.contextMenu(screen.getByTestId('feed'));
    expect(opened.entries).toEqual([]);
  });

  it('opens a native statblock\'s note with the map\'s collection, and closes the DM screen', () => {
    withStatblockEditor(app());
    const { onOpened } = feed(NATIVE);
    chooseEdit();
    expect(openStatblockEditor).toHaveBeenCalledWith(app(), { notePath: NATIVE, collectionId: 'marsh', from: 'map' });
    expect(onOpened).toHaveBeenCalled();
  });

  it('opens a Fantasy Statblocks statblock\'s note as before (M6)', () => {
    withStatblockEditor(app());
    const { onOpened } = feed(FANTASY);
    chooseEdit();
    expect(harness.app.workspace.openLinkText).toHaveBeenCalledWith('', FANTASY, true);
    expect(openStatblockEditor).not.toHaveBeenCalled();
    expect(onOpened).toHaveBeenCalled();
  });
});

describe('the note fence\'s Edit statblock (D14)', () => {
  const editButton = (): HTMLElement | null => screen.queryByRole('button', { name: 'Edit statblock' });

  it('shows on a native statblock while the switch is on, and opens the editor for the note', () => {
    withStatblockEditor(app());
    const onEdit = vi.fn();
    render(<FenceStatblock app={app()} path={NATIVE} onEdit={onEdit} />);
    expect(screen.getByTestId('statblock').textContent).toBe(NATIVE);
    fireEvent.click(editButton()!);
    expect(onEdit).toHaveBeenCalledWith(NATIVE);
  });

  it('is absent while the switch is off, on other statblocks, and without an editor to open', () => {
    const { unmount } = render(<FenceStatblock app={app()} path={NATIVE} onEdit={vi.fn()} />);
    expect(editButton()).toBeNull();
    unmount();

    withStatblockEditor(app());
    render(<FenceStatblock app={app()} path={FANTASY} onEdit={vi.fn()} />);
    render(<FenceStatblock app={app()} path={NATIVE} />);
    expect(editButton()).toBeNull();
  });

  it('follows the note when it stops being a native statblock', () => {
    withStatblockEditor(app());
    render(<FenceStatblock app={app()} path={NATIVE} onEdit={vi.fn()} />);
    expect(editButton()).not.toBeNull();

    harness.files.set(NATIVE, '---\nname: Marsh Warden\n---\n');
    act(() => harness.cacheEvents.trigger('changed', new TFile(NATIVE)));
    expect(editButton()).toBeNull();
  });
});
