import { matchesMapHotkey } from '../../keyboard/mapHotkeys';
import { SettingsService } from '../../services/SettingsService';
import { isShortcutScopeActive } from '../../utils/activeLeafGuard';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { ExternalLink, FileText, Replace } from 'lucide-react';
import { useAtlasStore } from '../ViewStoreContext';
import { useAtlasUI } from '../root/AtlasUIContext';
import { App, TFile, Component, WorkspaceLeaf } from 'obsidian';
import { getActiveWorkspaceLeaf, suppressActiveLeaf } from '../../utils/embeddedLeafFocus';
import FantasyStatblock from './FantasyStatblock';
import LinkedNotePicker from './LinkedNotePicker';
import { StatblockFeeds } from './dm-screen/StatblockFeeds';
import { Button } from '../../packages/components/primitives/button';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { addTokenHighlight, zoomToTokenWithHighlight } from '../../pixi/utils/tokenHighlight';
import { toTokenVitals } from '../../services/statblockVitalsSync';
import { useMapResources } from '../../resources/useMapResources';
import { useDMScreenStatblocks } from './dm-screen/useDMScreenStatblocks';
import { runInBackground } from '../../utils/backgroundTask';
import { t } from '../../i18n';

interface DMScreenProps {
  isOpen: boolean;
  onClose: () => void;
}

// Separate component for note content to avoid re-render issues
interface NoteContentProps {
  notePath: string;
  app: App;
  onFocus?: () => void;
}

const NoteContent: React.FC<NoteContentProps> = ({ notePath, app, onFocus }) => {
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
        leafRef.current = app.workspace.getLeaf(true);

        if (leafRef.current) {
          leafRef.current.containerEl.setAttribute('data-dm-screen-preview', 'true');
          leafRef.current.tabHeaderEl?.setAttribute('data-dm-screen-preview', 'true');

          leafRef.current.detach();
        }

        // Restore setActiveLeaf and re-activate the original leaf immediately
        // after detach, before any async work.
        restoreActiveLeaf();
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

export default function DMScreen({ isOpen, onClose }: DMScreenProps) {
  const tokens = useAtlasStore((state) => state.objects?.tokens || {});
  const mapPath = useAtlasStore((state) => state.mapPath);
  const mapLoaded = useAtlasStore((state) => state.mapLoaded);
  const isMapLoading = useAtlasStore((state) => state.isMapLoading);
  const linkedNotePath = useAtlasStore((state) => state.dmNotePath);
  const setLinkedNotePath = useAtlasStore((state) => state.setDMNotePath);
  const linkedNoteName = linkedNotePath?.split('/').pop()?.replace(/\.md$/, '');
  const { app, view } = useAtlasUI();
  const updateToken = useAtlasStore((state) => state.updateToken);
  const definitions = useMapResources();
  const { statblocks, loading } = useDMScreenStatblocks(isOpen, app, { viewId: view?.viewId, mapPath, mapLoaded, isMapLoading, tokens });
  const [contentReady, setContentReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const [isNoteFocused, setIsNoteFocused] = useState(false);
  const componentRef = useRef<Component>(new Component());
  const screenRef = useRef<HTMLDivElement>(null);
  // Animated close: play exit animation, then call the real onClose
  const handleClose = useCallback((): void => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, 200); // matches CSS animation duration
  }, [closing, onClose]);

  // Reveal the DM screen once statblocks finish loading (prevents layout shift)
  useEffect(() => {
    if (!isOpen) {
      setContentReady(false);
      return;
    }
    if (!loading) {
      // Use rAF to ensure the browser has painted the final layout before animating in
      const id = window.requestAnimationFrame(() => setContentReady(true));
      return () => window.cancelAnimationFrame(id);
    }
  }, [loading, isOpen]);

  // Handle DM screen close/cleanup
  useEffect(() => {
    if (!isOpen) setIsNoteFocused(false);
  }, [isOpen]);

  // Handle note focus with keyboard event capture (same pattern as NotePreviewWindow)
  useEffect(() => {
    if (!isOpen || !isNoteFocused) return;

    const notesSection = document.querySelector('.atlas-dm-notes-section');
    if (!notesSection) return;

    // Stop all keyboard events from propagating when note is focused
    // This prevents canvas-level hotkeys while editing
    const stopKeyPropagation = (e: KeyboardEvent) => {
      e.stopPropagation();

      // Handle ESC to unfocus
      if (e.type === 'keydown' && e.key === 'Escape') {
        e.preventDefault(); // Prevent default ESC behavior

        // Give CodeMirror time to finish processing before unfocusing
        window.setTimeout(() => {
          setIsNoteFocused(false);

          // Move focus to a safe element instead of just blurring
          const screenElement = screenRef.current;
          if (screenElement) {
            screenElement.focus();
          }
        }, 50);
      }
    };

    notesSection.addEventListener('keydown', stopKeyPropagation as EventListener);
    notesSection.addEventListener('keyup', stopKeyPropagation as EventListener);
    notesSection.addEventListener('keypress', stopKeyPropagation as EventListener);

    return () => {
      notesSection.removeEventListener('keydown', stopKeyPropagation as EventListener);
      notesSection.removeEventListener('keyup', stopKeyPropagation as EventListener);
      notesSection.removeEventListener('keypress', stopKeyPropagation as EventListener);
    };
  }, [isOpen, isNoteFocused]);

  // Handle click events to manage focus
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Ignore clicks on statblocks to prevent unnecessary re-renders
      const clickedStatblock = target.closest('.compact-statblock');
      if (clickedStatblock) {
        return; // Don't change focus state for statblock clicks
      }

      // Check if click is within note content area
      const notesSection = document.querySelector('.atlas-dm-notes-section');
      const noteContent = document.querySelector('.atlas-dm-note-content');

      if (notesSection?.contains(target) || noteContent?.contains(target)) {
        // Clicked inside notes section
        if (!isNoteFocused) {
          setIsNoteFocused(true);
        }
      } else if (screenRef.current?.contains(target)) {
        // Clicked elsewhere in the DM screen
        if (isNoteFocused) {
          setIsNoteFocused(false);
        }
      }
    };

    // Use capture phase to ensure we get the event before other handlers
    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [isOpen, isNoteFocused]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      // Don't handle shortcuts if note is focused (keyboard events are already stopped by stopPropagation)
      if (isNoteFocused) return;

      if (e.defaultPrevented || !isShortcutScopeActive(screenRef.current, view?.viewId)) return;
      if (document.querySelector('.atlas-onboarding-overlay, .atlas-hotkey-help, .modal-container')) return;
      const target = e.target as Element | null;
      if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      if (matchesMapHotkey(e, 'dashboard', SettingsService.forApp(app))) {
        e.preventDefault();
        handleClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleClose, isNoteFocused, app, view]);

  // Component lifecycle management
  useEffect(() => {
    componentRef.current.load();

    return () => {
      componentRef.current.unload();
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="atlas-dm-screen-wrapper" ref={screenRef} tabIndex={-1}>
      <div className={`atlas-dm-screen-backdrop ${closing ? 'is-closing' : ''}`} onClick={handleClose} />

      <div className={`atlas-dm-screen ${closing ? 'is-closing' : contentReady ? 'is-visible' : ''}`}>
        <div className="atlas-dm-screen-content">
          {/* Left side - Statblocks (50% height) */}
          <div className="atlas-dm-statblocks-section">
            {loading ? (
              <div className="atlas-dm-loading">{t('dashboard.loading')}</div>
            ) : (
              <div className="atlas-dm-statblocks-grid">
                {statblocks.size > 0 && (
                  <StatblockFeeds>
                    {Array.from(statblocks.entries(), ([path, statblock]) => (
                      <FantasyStatblock
                        key={path}
                        notePath={path}
                        app={app}
                        tokens={statblock.tokens.map(toTokenVitals)}
                        originContext={statblock.originContext}
                        tokenActions={{
                          definitions,
                          onUpdateToken: (id, updates) => updateToken(id, updates),
                          onHoverToken: (id) => addTokenHighlight(view, id, { highlightDuration: 800 }),
                          onLocateToken: (id) => {
                            const token = tokens[id];
                            if (!token) return;
                            zoomToTokenWithHighlight(view, id, { x: token.x, y: token.y });
                            handleClose();
                          },
                        }}
                      />
                    ))}
                  </StatblockFeeds>
                )}
              </div>
            )}
          </div>

          {/* Right side - note linked to this map */}
          <div className="atlas-dm-notes-section">
            <div className="atlas-linked-note-header">
              <FileText className="atlas-linked-note-header-icon" />
              <div className="atlas-linked-note-header-text">
                <h3>{linkedNoteName ?? t('dashboard.linkNote')}</h3>
                <p>{linkedNotePath ?? t('dashboard.pickNote')}</p>
              </div>
              {linkedNotePath && (
                <div className="atlas-linked-note-actions">
                  <LabelTooltip label={t('dashboard.openNote')}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="atlas-linked-note-action"
                      onClick={() => runInBackground(app.workspace.openLinkText('', linkedNotePath, true), `Opening ${linkedNotePath}`, t('loot.openFailed'))}
                    >
                      <ExternalLink />
                    </Button>
                  </LabelTooltip>
                  <LabelTooltip label={t('dashboard.linkOther')}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="atlas-linked-note-action"
                      onClick={() => setLinkedNotePath(null)}
                    >
                      <Replace />
                    </Button>
                  </LabelTooltip>
                </div>
              )}
            </div>
            <div className="atlas-dm-notes-content">
              {linkedNotePath ? (
                <NoteContent
                  notePath={linkedNotePath}
                  app={app}
                  onFocus={() => setIsNoteFocused(true)}
                />
              ) : (
                <LinkedNotePicker app={app} onSelect={setLinkedNotePath} />
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
