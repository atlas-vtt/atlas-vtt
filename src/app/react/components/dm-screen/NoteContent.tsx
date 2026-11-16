import React, { useEffect, useRef } from 'react';
import { App, TFile, Component, WorkspaceLeaf } from 'obsidian';
import { getActiveWorkspaceLeaf, suppressActiveLeaf } from '../../../utils/embeddedLeafFocus';

interface NoteContentProps {
  notePath: string;
  app: App;
  onFocus?: () => void;
}

/** The linked note in a leaf of its own, kept apart so that it never renders with the screen around it. */
export const NoteContent: React.FC<NoteContentProps> = ({ notePath, app, onFocus }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafRef = useRef<WorkspaceLeaf | null>(null);
  const componentRef = useRef<Component | null>(null);
  const cleanupTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current || !notePath) return;

    const loadNoteWithLeaf = async () => {
      const file = app.vault.getAbstractFileByPath(notePath);
      if (!(file instanceof TFile)) return;

      try {
        // Clear previous content
        if (containerRef.current) {
          containerRef.current.empty();
        }

        // Clean up previous leaf
        if (leafRef.current) {
          leafRef.current.detach();
          leafRef.current = null;
        }

        const ws = app.workspace;

        // setActiveLeaf is suppressed during leaf creation + file opening
        // so Obsidian never switches away from the atlas canvas view.
        let restoreActiveLeaf: () => void = () => {};

        // Strategy 1: Try Obsidian's popover helpers
        if (typeof ws.getLeafPopover === 'function' && typeof ws.openPopover === 'function') {
          try {
            const currentActiveLeaf = getActiveWorkspaceLeaf(ws);

            restoreActiveLeaf = suppressActiveLeaf(ws);
            leafRef.current = ws.getLeafPopover() ?? null;

            if (leafRef.current) {
              await leafRef.current.openFile(file, { active: false });

              restoreActiveLeaf();

              if (containerRef.current) {
                containerRef.current.empty();
                (document.activeElement as HTMLElement)?.blur();
                ws.openPopover(leafRef.current, containerRef.current, { focus: false });
              }

              if (currentActiveLeaf) {
                app.workspace.setActiveLeaf(currentActiveLeaf, { focus: false });
              }

              return;
            } else {
              restoreActiveLeaf();
            }
          } catch (err) {
            restoreActiveLeaf();
            console.error('[NoteContent] Popover strategy failed:', err);
          }
        }

        // Strategy 2: Create a hidden leaf; dm-screen.scss hides its tab via data-dm-screen-preview
        const originalActiveLeaf = getActiveWorkspaceLeaf(app.workspace);

        // Suppress setActiveLeaf during leaf creation so Obsidian never
        // switches away from the atlas canvas view (prevents flash).
        restoreActiveLeaf = suppressActiveLeaf(ws);
        try {
          leafRef.current = app.workspace.getLeaf(true);

          if (leafRef.current) {
            leafRef.current.containerEl.setAttribute('data-dm-screen-preview', 'true');
            leafRef.current.tabHeaderEl?.setAttribute('data-dm-screen-preview', 'true');

            leafRef.current.detach();
          }
        } finally {
          // Restore setActiveLeaf immediately after detach, before any async work,
          // and also when the workspace could not make the leaf.
          restoreActiveLeaf();
        }

        if (originalActiveLeaf && originalActiveLeaf !== leafRef.current) {
          app.workspace.setActiveLeaf(originalActiveLeaf, { focus: false });
        }

        if (!leafRef.current) {
          // nothing to do
        } else {
          try {
            await leafRef.current.openFile(file, { active: false });
          } catch (innerErr) {
            console.error('[NoteContent] Error opening file in hidden leaf:', innerErr);
          }

          if (containerRef.current && leafRef.current?.view?.containerEl) {
            containerRef.current.empty();

            // Ensure the view is properly initialized before appending
            const viewContainer = leafRef.current.view.containerEl;
            if (viewContainer) {
              // Remove focus from any active element to prevent CodeMirror errors
              (document.activeElement as HTMLElement)?.blur();

              containerRef.current.appendChild(viewContainer);

              viewContainer.classList.add('atlas-embedded-leaf-view', 'atlas-embedded-leaf-view--fill-editor');
            }
          }
        }
      } catch (err) {
        console.error('[NoteContent] Failed to load note with leaf:', err);
      }
    };

    void loadNoteWithLeaf();

    // Cleanup
    return () => {
      // Clear any pending cleanup timeout
      if (cleanupTimeoutRef.current) {
        window.clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = null;
      }

      // Clean up in the correct order to avoid null reference errors
      if (leafRef.current) {
        try {
          const leaf = leafRef.current;

          // First, deactivate any CodeMirror instances
          if (leaf.view?.containerEl) {
            // Force blur to deactivate CodeMirror
            leaf.view.containerEl.querySelectorAll<HTMLElement>('.cm-editor').forEach((editor) => editor.blur());

            // Remove the view container from DOM
            if (leaf.view.containerEl.parentElement) {
              leaf.view.containerEl.remove();
            }
          }

          // Give CodeMirror time to clean up before detaching
          cleanupTimeoutRef.current = window.setTimeout(() => {
            try {
              if (leaf && leaf.view) {
                leaf.detach();
              }
            } catch {
              // Ignore errors during cleanup
            }
          }, 100);

          leafRef.current = null;
        } catch (err) {
          console.error('[NoteContent] Cleanup error:', err);
        }
      }

      if (componentRef.current) {
        componentRef.current.unload();
        componentRef.current = null;
      }
    };
  }, [notePath, app]);

  return (
    <div
      ref={containerRef}
      className="atlas-dm-note-content"
      style={{
        height: '100%',
        minHeight: '400px',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}
    />
  );
};
