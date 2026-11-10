import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';
import { TemplateEditorView } from '../../../../src/app/statblocks/editor/TemplateEditorView';
import { TEMPLATE_EDITOR_VIEW_TYPE } from '../../../../src/app/statblocks/editor/templateEditorState';
import { removeHostedDialogs } from '../../../../src/app/statblocks/editor/hostedDialog';
import { TemplateSession } from '../../../../src/app/statblocks/library/TemplateSession';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { FakeLeaf, fakeWorkspace, type FakeWorkspace } from '../editor/workspaceKit';
import { offered } from './editorKit';
import { closeSessionVault, sessionVault, type SessionVault } from '../library/sessionVault';

/**
 * Template editor views over a session vault, as Obsidian holds them: each in
 * a leaf of its own, opened on a state, closed after the test. Tests that use
 * it mock `AssetService` themselves (the editor reads the collections).
 */
export interface EditorViews {
  readonly vault: SessionVault;
  readonly workspace: FakeWorkspace;
  open: (state: Record<string, unknown>) => Promise<{ view: TemplateEditorView; leaf: FakeLeaf }>;
  /** Closes a view, as its tab closing does. */
  close: (view: TemplateEditorView) => Promise<void>;
  /** Changes the template as the views hold it, through a handle let go at once. */
  edit: (id: string, change: (template: StatblockTemplate) => StatblockTemplate) => void;
  /** Files written so far: changes of existing files and files made. */
  writes: () => number;
  read: (path: string) => StatblockTemplate;
}

export function editorViews(): { setUp: () => Promise<void>; tearDown: () => Promise<void>; views: EditorViews } {
  let vault: SessionVault | null = null;
  let workspace: FakeWorkspace | null = null;
  const open: TemplateEditorView[] = [];
  const need = <T>(value: T | null): T => {
    if (value === null) throw new Error('editorViews: set up first');
    return value;
  };
  const views: EditorViews = {
    get vault() { return need(vault); },
    get workspace() { return need(workspace); },
    open: async (state) => {
      const app = need(vault).app;
      const leaf = new FakeLeaf({ type: TEMPLATE_EDITOR_VIEW_TYPE }, app);
      const view = new TemplateEditorView(leaf as unknown as WorkspaceLeaf);
      open.push(view);
      document.body.appendChild(view.contentEl);
      await act(async () => { await view.onOpen(); });
      await act(async () => { await view.setState(state, { history: false }); });
      return { view, leaf };
    },
    close: async (view) => {
      open.splice(open.indexOf(view), 1);
      await act(async () => { await view.onClose(); });
    },
    edit: (id, change) => {
      const handle = TemplateSession.open(need(vault).app, id);
      if (!handle) throw new Error(`No template ${id}`);
      act(() => handle.apply(change));
      handle.release();
    },
    writes: () => {
      const { process, create } = need(vault).app.vault;
      return vi.mocked(process).mock.calls.length + vi.mocked(create).mock.calls.length;
    },
    read: (path) => JSON.parse(need(vault).files.get(path) ?? 'null') as StatblockTemplate,
  };
  return {
    views,
    setUp: async () => {
      vault = sessionVault();
      withStatblockEditor(vault.app);
      workspace = fakeWorkspace([], null);
      // The session vault's workspace events stay; leaves come from the fake workspace.
      const { on: _on, offref: _offref, ...leaves } = workspace.workspace;
      Object.assign(vault.app.workspace, leaves);
      await vault.settled();
    },
    tearDown: async () => {
      for (const view of open.splice(0)) await act(async () => { await view.onClose(); });
      removeHostedDialogs();
      cleanup();
      if (vault) await closeSessionVault(vault);
      vault = null;
      workspace = null;
    },
  };
}

export const saveButton = (): HTMLButtonElement => screen.getByRole('button', { name: 'Save' });
export const saveOffered = (): boolean => offered(saveButton());
export const nameInput = (): HTMLInputElement => screen.getByRole('textbox', { name: 'Name' });
export const typeName = (name: string): void => { fireEvent.change(nameInput(), { target: { value: name } }); };
