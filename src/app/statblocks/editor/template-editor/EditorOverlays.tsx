import React from 'react';
import { AnimatePresence } from 'framer-motion';
import type { App } from 'obsidian';
import { InsertMenu } from './InsertMenu';
import { NamePopover } from './naming/NamePopover';
import type { SessionSnapshot } from './sessionTypes';
import { TeSurfaceChrome } from './TeSurfaceChrome';
import { UndoToast } from './UndoToast';
import type { EditorState } from './useEditorState';
import type { KeyboardTarget } from './useTemplateKeyboard';

export interface EditorOverlaysProps {
  app: App | undefined;
  /** The layer over the editor that floating parts are drawn in. */
  layer: HTMLElement | null;
  stage: HTMLElement | null;
  snapshot: SessionSnapshot;
  state: EditorState;
  target: KeyboardTarget;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  /** The selected tile's Options while they are open, with the input they open on. */
  options: { focusKey?: string | undefined } | null;
  onOptions: (focusKey?: string) => void;
  onOptionsClose: () => void;
}

/**
 * What floats over the template editor: the gutter handles, the selected
 * block's toolbar and the block menus, the insert menu, the name a tile just
 * placed asks for, the delete toast,
 * and the polite live region every announcement goes to, inside the view's
 * own document.
 */
export function EditorOverlays({ app, layer, stage, snapshot, state, target, menuOpen, onMenuOpenChange, options, onOptions, onOptionsClose }: EditorOverlaysProps): React.JSX.Element {
  return (
    <>
      {layer && stage && (
        <TeSurfaceChrome
          layer={layer}
          stage={stage}
          snapshot={snapshot}
          state={state}
          target={target}
          menuOpen={menuOpen}
          onMenuOpenChange={onMenuOpenChange}
          options={options}
          onOptions={onOptions}
          onOptionsClose={onOptionsClose}
        />
      )}
      <AnimatePresence>
        {layer && state.insertMenu && (
          <InsertMenu
            key={state.insertMenu.opening}
            layer={layer}
            anchor={state.insertMenu.anchor}
            app={app}
            onInsert={(item) => state.insert(item, state.insertMenu?.place)}
            onClose={state.closeInsert}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {layer && stage && state.naming && (
          <NamePopover key={state.naming.blockId} layer={layer} stage={stage} prompt={state.naming} revision={snapshot.template} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {state.toast && (
          <UndoToast key={state.toast.text} text={state.toast.text} onUndo={() => target.session.undo()} onDismiss={state.dismissToast} />
        )}
      </AnimatePresence>
      <div className="atlas-te-live" role="status" aria-live="polite">{state.said}</div>
    </>
  );
}
