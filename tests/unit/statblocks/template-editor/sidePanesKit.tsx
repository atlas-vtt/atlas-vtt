import React, { useState, useSyncExternalStore } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { vi } from 'vitest';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { SurfaceMenuProvider } from '../../../../src/app/statblocks/editor/interaction/SurfaceMenuProvider';
import { TemplateEditorContext, type TemplateEditorContextValue } from '../../../../src/app/statblocks/editor/template-editor/editorContext';
import type { BlockSelection } from '../../../../src/app/statblocks/editor/template-editor/selection';
import { TemplateEditor, type TemplateEditorHost } from '../../../../src/app/statblocks/editor/template-editor/TemplateEditor';
import { FakeSession, sampleTemplate } from './editorKit';

const host: TemplateEditorHost = { save: vi.fn(async () => null), close: vi.fn() };

export interface Mounted {
  session: FakeSession;
  /** A block's frame in the canvas. */
  frame: (id: string) => HTMLElement;
}

/** The template editor with its real dock, toolbar and Options; `menus` renders the surface's menu provider, as the view does. */
export function mountEditor(session = new FakeSession(sampleTemplate()), options: { menus?: boolean } = {}): Mounted {
  const editor = (
    <div className="atlas-vtt-plugin">
      <TemplateEditor
        session={session}
        host={host}
        collectionId={null}
      />
    </div>
  );
  // Menus open through the surface's own provider, as in the view (StatblockEditorRoot).
  render(<TooltipProvider>{options.menus ? <SurfaceMenuProvider ownerId="test">{editor}</SurfaceMenuProvider> : editor}</TooltipProvider>);
  const frame = (id: string): HTMLElement => {
    const element = document.querySelector<HTMLElement>(`.atlas-te-stage [data-block-id="${id}"]`);
    if (!element) throw new Error(`no frame ${id}`);
    return element;
  };
  return { session, frame };
}

/** The selected tile's Options, opened with Shift+Enter if they are closed; the newest, where one before is still fading out. */
export function tileOptions(): HTMLElement {
  const shown = (): HTMLElement | undefined => [...document.querySelectorAll<HTMLElement>('.atlas-te-options:not([data-closing])')].at(-1);
  if (!shown()) {
    const root = document.querySelector<HTMLElement>('.atlas-te');
    if (!root) throw new Error('no editor');
    act(() => { fireEvent.keyDown(root, { key: 'Enter', shiftKey: true }); });
  }
  const options = shown();
  if (!options) throw new Error('no options');
  return options;
}

export interface ContextOptions {
  collectionKeys?: ReadonlyMap<string, number>;
  selection?: BlockSelection;
}

/** Renders a part inside an editor context of its own: a session's live snapshot and the given collection keys. */
export function renderInEditor(session: FakeSession, ui: React.ReactElement, options: ContextOptions = {}): { selected: () => BlockSelection } {
  const seen = { selection: options.selection ?? [] as BlockSelection };
  function Host(): React.JSX.Element {
    const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
    const [selection, setSelection] = useState<BlockSelection>(options.selection ?? []);
    seen.selection = selection;
    const value: TemplateEditorContextValue = {
      app: undefined,
      session,
      snapshot,
      selection,
      select: (next) => setSelection(next),
      insert: vi.fn(),
      editLabel: vi.fn(),
      announce: vi.fn(),
      collectionId: null,
      collectionKeys: options.collectionKeys ?? new Map(),
      openOptions: vi.fn(),
    };
    return (
      <TooltipProvider>
        <div className="atlas-vtt-plugin">
          <TemplateEditorContext.Provider value={value}>{ui}</TemplateEditorContext.Provider>
        </div>
      </TooltipProvider>
    );
  }
  render(<Host />);
  return { selected: () => seen.selection };
}

/** Types into an input as one typing session: each value in turn, then leaves it. */
export function typeAndLeave(input: HTMLElement, ...values: string[]): void {
  for (const value of values) fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

export const key = (target: Element, name: string, init: KeyboardEventInit = {}): void => {
  fireEvent.keyDown(target, { key: name, ...init });
};
