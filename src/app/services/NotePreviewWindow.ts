import { App, WorkspaceLeaf, TFile, ItemView, MarkdownRenderer, MarkdownView, Component, setIcon } from 'obsidian';
import { getActiveWorkspaceLeaf, suppressActiveLeaf } from '../utils/embeddedLeafFocus';
import { runInBackground } from '../utils/backgroundTask';
import type { NotePreviewUIManager, PreviewAnchorRef } from './NotePreviewUIManager';
import type { NoteViewState, PinnedNotePreview } from '../stores/pinnedNotePreviewSlice';
import { PreviewWindowPlacement } from './previewWindowLayout';
import { NOTE_PREVIEW_LAYER_CLASS } from './uiLayers';
import { applyNoteScroll, readNoteViewState, toOpenViewState } from './noteViewState';
import { t } from '../i18n';
import { findEditorHeading, findRenderedHeading, headingLine } from './noteHeadings';
import { alignHeading, holdHeadingInView } from './headingScroll';

// Styles imported via styles/main.scss → note-preview-window.scss

const HEADING_FLASH_DURATION_MS = 1500;
/** Hides an embedded note view until it has been scrolled to its heading. */
const PENDING_SCROLL_CLASS = 'atlas-embedded-leaf-view--pending-scroll';
/** Scrolling and typing are saved with the map once they pause this long. */
const STATE_SAVE_DELAY_MS = 500;

export class NotePreviewWindow {
  private app: App;
  public notePath: string;
  private originalNotePath: string; // Store the original path with header
  private headerToScrollTo: string | null = null;
  public element: HTMLElement | null = null;
  private titleElement: HTMLElement | null = null;
  private parentComponent: Component;
  private isPinned: boolean = false;
  private pinButton: HTMLButtonElement | null = null;
  public originatingPin: PreviewAnchorRef | null = null;
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private dragStartLeft: number = 0;
  private dragStartTop: number = 0;
  private leaf: WorkspaceLeaf | null = null;
  public static openWindows: Map<string, NotePreviewWindow> = new Map();
  private manager: NotePreviewUIManager;
  /** True when Obsidian's popover helpers own the leaf's DOM placement. */
  private usesPopover = false;
  private wrapperEl: HTMLDivElement | null = null;
  private preferredActiveLeaf: WorkspaceLeaf | null = null;
  private mountRootEl: HTMLElement | null = null;
  private placement: PreviewWindowPlacement | null = null;
  /** How a reopened note was left, kept until its view is mounted and has taken it over. */
  private savedViewState: NoteViewState | null = null;
  private stateSaveTimer: number | null = null;

  // Resize properties
  private isResizing: boolean = false;
  private resizeStartX: number = 0;
  private resizeStartY: number = 0;
  private resizeStartWidth: number = 0;
  private resizeStartHeight: number = 0;
  private resizeStartLeft: number = 0;
  private resizeStartTop: number = 0;
  private currentResizeHandle: string | null = null;

  constructor(
    app: App,
    notePath: string,
    originatingPin: PreviewAnchorRef,
    manager: NotePreviewUIManager,
    initialPos?: { x: number, y: number },
    preferredActiveLeaf?: WorkspaceLeaf | null,
    /** Reopens a preview pinned earlier, where it was left. */
    pinned?: PinnedNotePreview,
  ) {
    this.app = app;
    this.originalNotePath = notePath; // Store the original path
    
    // Extract header from notePath if present
    const hashIndex = notePath.indexOf('#');
    if (hashIndex !== -1) {
      this.notePath = notePath.substring(0, hashIndex);
      this.headerToScrollTo = notePath.substring(hashIndex + 1);
    } else {
      this.notePath = notePath;
      this.headerToScrollTo = null;
    }
    
    this.originatingPin = originatingPin;
    this.manager = manager;
    this.preferredActiveLeaf = preferredActiveLeaf ?? null;
    this.parentComponent = new Component();
    
    // Check if we already have a window for this pin
    const windowKey = this.originatingPin ? `${this.originalNotePath}::${this.originatingPin.id}` : this.originalNotePath;
    const existingWindow = NotePreviewWindow.openWindows.get(windowKey);
    if (existingWindow) {
      console.warn('[NotePreviewWindow] Window already exists for key:', windowKey, 'Cleaning up old window');
      existingWindow._forceHide();
    }
    
    this.savedViewState = pinned?.view ?? null;
    this.render();
    if (this.element && pinned) {
      this.placement?.restore(pinned);
      this.isPinned = true;
      this.updatePinButtonState();
    } else if (this.element && initialPos) {
      this.setPosition(initialPos.x, initialPos.y);
    }
    
    // Register this window before opening the leaf to prevent race conditions
    NotePreviewWindow.openWindows.set(windowKey, this);
    
    this.openNoteInLeaf().catch(err => {
      console.error('[NotePreviewWindow] Error opening note in leaf:', err);
      this._forceHide();
    });
    
    this.parentComponent.load();
  }

  private render() {
    // Wrap in .atlas-vtt-plugin so SCSS scoped under that selector applies
    this.mountRootEl = this.resolveMountRoot();
    this.wrapperEl = resolvePreviewLayer(this.mountRootEl).createDiv({ cls: 'atlas-vtt-plugin atlas-vtt-root' });
    this.element = this.wrapperEl.createDiv({ cls: 'atlas-note-preview-window' });
    this.element.setAttribute('tabindex', '-1'); // Make the main window programmatically focusable
    const placement = new PreviewWindowPlacement(this.element, this.mountRootEl);
    this.placement = placement;
    this.parentComponent.register(() => placement.destroy());

    const header = this.element.createDiv({ cls: 'atlas-note-preview-header' });
    header.addEventListener('mousedown', this.onDragStart.bind(this));
    this.titleElement = header.createSpan({ cls: 'atlas-note-preview-title', text: t('preview.loading') });
    const controlsDiv = header.createDiv({ cls: 'atlas-note-preview-controls' });
    // Pin Button
    this.pinButton = controlsDiv.createEl('button', { cls: 'atlas-note-preview-pin-btn' });
    setIcon(this.pinButton, 'pin');
    this.pinButton.setAttribute('aria-label', t('preview.pin'));
    this.pinButton.onclick = () => this.togglePin();
    
    // Open File Button
    const openFileBtn = controlsDiv.createEl('button', { cls: 'atlas-note-preview-open-btn' });
    setIcon(openFileBtn, 'file-text');
    openFileBtn.setAttribute('aria-label', t('preview.openFile'));
    openFileBtn.onclick = () => this.openFile();
    
    // Close Button
    const closeBtn = controlsDiv.createEl('button', { cls: 'atlas-note-preview-close-btn' });
    setIcon(closeBtn, 'x');
    closeBtn.setAttribute('aria-label', t('preview.close'));
    closeBtn.onclick = () => this.close();

    // Content area for the leaf
    const contentArea = this.element.createDiv({ cls: 'atlas-note-preview-content' });
    contentArea.id = 'atlas-note-preview-leaf-container';

    // Scrolling, typing and clicking change where the note is left
    const saveStateSoon = (): void => this.scheduleStateSave();
    contentArea.addEventListener('scroll', saveStateSoon, { capture: true, passive: true });
    contentArea.addEventListener('keyup', saveStateSoon);
    contentArea.addEventListener('mouseup', saveStateSoon);
    // Leaving the window (to switch scenes, for example) saves right away
    this.element.addEventListener('mouseleave', () => this.saveStateNow());

    // When content area is clicked, manage focus intelligently.
    contentArea.addEventListener('mousedown', (e) => {
        const target = e.target as HTMLElement;
        
        // Auto-pin when clicking into the content area (but not on buttons)
        if (!this.isPinned && !target.closest('button')) {
            this.setPinned(true);
        }
        
        if (this.element) {
            const isTargetDirectlyFocusable = target.matches(
                'input, textarea, [contenteditable="true"], button, select, a[href]'
            );
            const isTargetInsideCodeMirror = target.closest('.cm-editor');

            // If the click isn't on something that naturally handles its own focus (like an input or CM editor),
            // and the main preview window isn't already focused, focus the main preview window.
            if (!isTargetDirectlyFocusable && !isTargetInsideCodeMirror && document.activeElement !== this.element) {
                this.element.focus({ preventScroll: true });
            }
        }
        // Do NOT stop mousedown propagation here to allow text selection, button clicks etc.
    });

    // Prevent *all* key events from escaping the preview window so that
    // canvas-level hotkeys are never triggered while editing or interacting
    // with the preview. We only call stopPropagation (not preventDefault)
    // so that the underlying editor (CodeMirror etc.) still receives the event.
    const stopKeyPropagation = (e: KeyboardEvent) => {
        e.stopPropagation();
        
        // Auto-pin when user starts typing (but not for modifier keys, arrows, etc.)
        if (!this.isPinned && e.type === 'keydown') {
            const isTypingKey = e.key.length === 1 || // Single character keys
                               e.key === 'Enter' || 
                               e.key === 'Backspace' || 
                               e.key === 'Delete' ||
                               e.key === 'Tab';
            
            const isModifierHeld = e.metaKey || e.ctrlKey || e.altKey;
            
            if (isTypingKey && !isModifierHeld) {
                this.setPinned(true);
            }
        }
    };

    this.element.addEventListener('keydown', stopKeyPropagation);
    this.element.addEventListener('keyup', stopKeyPropagation);
    this.element.addEventListener('keypress', stopKeyPropagation);

    this.createResizeHandles();

  }

  private resolveMountRoot(): HTMLElement {
    const preferredLeafContainer = this.preferredActiveLeaf?.view?.containerEl;
    const preferredLeafRoot =
      preferredLeafContainer?.closest('.workspace-leaf') as HTMLElement | null ??
      preferredLeafContainer ??
      null;

    return preferredLeafRoot ?? document.body;
  }

  private createResizeHandles() {
    if (!this.element) return;
    const handleTypes = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
    handleTypes.forEach(type => {
      const handle = this.element!.createDiv({ cls: `atlas-note-preview-resize-handle atlas-note-preview-resize-handle-${type}` });
      handle.addEventListener('mousedown', (e) => this.onResizeStart(e, type));
    });
  }

  private async openNoteInLeaf() {
    const file = this.app.vault.getAbstractFileByPath(this.notePath);
    if (!(file instanceof TFile)) {
      if (this.titleElement) this.titleElement.setText(t('preview.notFound'));
      console.error(`[NotePreviewWindow] File not found: ${this.notePath}`);
      return;
    }

    if (this.titleElement) {
      const displayTitle = this.headerToScrollTo 
        ? `${file.basename} > ${this.headerToScrollTo}`
        : file.basename || t('preview.loading');
      this.titleElement.setText(displayTitle);
    }
    
    const ws = this.app.workspace;
    const contentContainer = this.element?.querySelector('#atlas-note-preview-leaf-container') as HTMLElement | null;
    if (!contentContainer) {
      console.error("[NotePreviewWindow] Content container not found in rendered element.");
      return;
    }

    /* ------------------------------------------------------------
     * Strategy 1  Preferred → use Obsidian's pop-over helpers
     * ------------------------------------------------------------
     * Obsidian ≥ v1.5 exposes two unpublished helpers that give us
     * a detached WorkspaceLeaf and a utility to render that leaf
     * inside an arbitrary host element (typically an element with
     * position:fixed so it behaves like a tooltip/pop-over).
     * If both helpers are present we use them and bail out early;
     * otherwise we fall back to the manual DOM re-parenting logic
     * implemented below (Strategy 2).
     */

    // Temporarily suppress setActiveLeaf during leaf creation + file opening
    // so Obsidian never switches away from the atlas canvas view. Without this,
    // getLeaf(true) / getLeafPopover() + openFile() briefly activate the new
    // leaf, causing a visible flash of the note view behind the canvas.
    let restoreActiveLeaf: () => void = () => {};

    if (typeof ws.getLeafPopover === 'function' && typeof ws.openPopover === 'function') {
      try {
        const currentActiveLeaf = this.preferredActiveLeaf ?? getActiveWorkspaceLeaf(this.app.workspace);

        restoreActiveLeaf = suppressActiveLeaf(ws);
        this.leaf = ws.getLeafPopover() ?? null;

        if (this.leaf) {
          await this.leaf.openFile(file, toOpenViewState(this.savedViewState));

          // Restore before openPopover so it can set up properly
          restoreActiveLeaf();

          contentContainer.empty();
          ws.openPopover(this.leaf, contentContainer, { focus: false });
          this.positionMountedNote();

          // Mark that we used the pop-over pathway so _forceHide()
          // doesn't try to manually yank the containerEl later on.
          this.usesPopover = true;

          // Ensure the original leaf stays active
          if (currentActiveLeaf) {
            this.app.workspace.setActiveLeaf(currentActiveLeaf, { focus: false });
          }

          // Intercept link clicks to prevent navigation away from map view
          this.interceptLinkClicks(contentContainer);

          return; // ‑► Done, no further work required
        } else {
          restoreActiveLeaf();
        }
      } catch (err) {
        restoreActiveLeaf();
        console.error('[NotePreviewWindow] openPopover strategy failed – falling back.', err);
      }
    }

    // Strategy 2: Create a hidden leaf for full functionality
    const originalActiveLeaf = this.preferredActiveLeaf ?? getActiveWorkspaceLeaf(this.app.workspace);

    // Suppress active-leaf switching during leaf creation + file loading
    restoreActiveLeaf = suppressActiveLeaf(ws);
    try {
      // Create the leaf
      this.leaf = this.app.workspace.getLeaf(true);

      if (this.leaf) {
        this.leaf.containerEl?.setAttribute('data-atlas-preview', 'true');
        this.leaf.tabHeaderEl?.setAttribute('data-atlas-preview', 'true');

        // Move the leaf out of the main split to prevent it from affecting the view
        this.leaf.detach();
      }

      if (!this.leaf) {
        restoreActiveLeaf();
        if (originalActiveLeaf) {
          this.app.workspace.setActiveLeaf(originalActiveLeaf, { focus: false });
        }
      } else {
        try {
          await this.leaf.openFile(file, toOpenViewState(this.savedViewState));

          // Restore setActiveLeaf now that async workspace ops are done
          restoreActiveLeaf();
          if (originalActiveLeaf) {
            this.app.workspace.setActiveLeaf(originalActiveLeaf, { focus: false });
          }

          // Check if leaf still exists after opening file
          if (!this.leaf || !this.leaf.view) {
            console.error("[NotePreviewWindow] Leaf or view disappeared after opening file");
            this.leaf = null;
            return;
          }

          // Now, append the leaf's view to our container
          if (contentContainer && this.leaf.view) {
            contentContainer.empty();
            contentContainer.classList.add('atlas-note-preview-content--scrollable');
            contentContainer.appendChild(this.leaf.view.containerEl);
            this.leaf.view.containerEl.classList.add('atlas-embedded-leaf-view');
            this.positionMountedNote();

            // Intercept link clicks to prevent navigation away from map view
            this.interceptLinkClicks(contentContainer);
          } else {
            console.error("[NotePreviewWindow] Content container not found for manual append.");
            // Still detach if we couldn't append the view
            if (this.leaf) {
              this.leaf.detach();
              this.leaf = null;
            }
          }
        } catch (error) {
          restoreActiveLeaf();
          if (originalActiveLeaf) {
            this.app.workspace.setActiveLeaf(originalActiveLeaf, { focus: false });
          }
          console.error("[NotePreviewWindow] Error opening file in leaf:", error);
          if (this.leaf) {
            this.leaf.detach();
            this.leaf = null;
          }
        }
      }
    } finally {
      // Whatever throws above (the workspace may have no tab group to make a leaf in), the
      // workspace must get setActiveLeaf back: a release is counted once however often it runs.
      restoreActiveLeaf();
    }

    if (!this.leaf && contentContainer) {
      await this.renderMarkdownPreview(file, contentContainer);
    }
  }

  /**
   * Once the note has rendered: a reopened note returns to the scroll it was
   * left at, a new one scrolls to the heading its link points to.
   */
  private positionMountedNote(): void {
    const saved = this.savedViewState;
    if (!saved && !this.headerToScrollTo) return;
    window.requestAnimationFrame(() => {
      this.waitForViewReady().then(() => {
        const view = this.leaf?.view;
        if (!view) return;
        if (saved) {
          applyNoteScroll(view, saved);
          this.savedViewState = null;
        } else if (this.headerToScrollTo) {
          this.scrollToHeader(this.headerToScrollTo);
        }
      }).catch(err => {
        console.error('[NotePreviewWindow] Error waiting for view ready:', err);
      });
    });
  }

  private async renderMarkdownPreview(file: TFile, contentContainer: HTMLElement): Promise<void> {
    contentContainer.empty();
    contentContainer.classList.add('atlas-note-preview-content--scrollable');

    await MarkdownRenderer.render(
      this.app,
      await this.app.vault.read(file),
      contentContainer,
      this.notePath,
      this.parentComponent,
    );

    if (this.headerToScrollTo) {
      window.requestAnimationFrame(() => {
        this.scrollRenderedMarkdownToHeader(contentContainer, this.headerToScrollTo!);
      });
    }

    this.interceptLinkClicks(contentContainer);
  }

  private scrollRenderedMarkdownToHeader(container: HTMLElement, headerText: string): void {
    const targetElement = findRenderedHeading(container, headerText);
    if (!targetElement) {
      console.warn('[NotePreviewWindow] Header not found in rendered markdown:', headerText);
      return;
    }

    alignHeading(targetElement, container);
    this.flashHeading(targetElement);
  }

  private flashHeading(element: HTMLElement): void {
    element.classList.add('atlas-highlighted-header');
    window.setTimeout(() => element.classList.remove('atlas-highlighted-header'), HEADING_FLASH_DURATION_MS);
  }

  private interceptLinkClicks(container: HTMLElement) {
    // Track processed links to avoid infinite loops
    const processedLinks = new WeakSet<HTMLElement>();
    
    const processLink = (link: HTMLElement) => {
      // Skip if already processed
      if (processedLinks.has(link)) return;
      processedLinks.add(link);
      
      // Add our custom click handler
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const href = link.getAttribute('href');
        if (href) {
          // Open the link in the main workspace, not in the preview
          // This preserves the map view context
          const newLeaf = e.metaKey || e.ctrlKey;
          runInBackground(this.app.workspace.openLinkText(href, '', newLeaf), `Opening link ${href}`, t('preview.openLinkFailed'));
        }
      });
    };
    
    // Use a MutationObserver to catch dynamically loaded content
    const observer = new MutationObserver((mutations) => {
      // Process only added nodes to avoid infinite loops
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            // Check if the added node is a link
            if (element.matches && element.matches('a.internal-link')) {
              processLink(element);
            }
            // Check for links within the added node
            const links = element.querySelectorAll?.('a.internal-link');
            links?.forEach(link => processLink(link as HTMLElement));
          }
        });
      });
    });
    
    // Start observing
    observer.observe(container, {
      childList: true,
      subtree: true
    });
    
    // Initial scan for links
    const links = container.querySelectorAll('a.internal-link');
    links.forEach((link) => processLink(link as HTMLElement));
    
    // Clean up observer when window is destroyed
    this.parentComponent.register(() => observer.disconnect());
  }

  /** Opens the preview next to the pointer, given in window coordinates. */
  setPosition(x: number, y: number): void {
    this.placement?.placeNearPointer(x, y);
  }

  private onDragStart(e: MouseEvent) {
    if ((e.target as HTMLElement)?.closest('button')) return;
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragStartLeft = this.element?.offsetLeft ?? 0;
    this.dragStartTop = this.element?.offsetTop ?? 0;
    this.element?.classList.add('is-dragging');
    document.addEventListener('mousemove', this.onDragMove);
    document.addEventListener('mouseup', this.onDragEnd);
  }
  private onDragMove = (e: MouseEvent) => {
    if (!this.isDragging || !this.element) return;
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;
    this.element.style.left = `${this.dragStartLeft + dx}px`;
    this.element.style.top = `${this.dragStartTop + dy}px`;
  }
  private onDragEnd = () => {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.element?.classList.remove('is-dragging');
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragEnd);
    this.placement?.recordMove();
    this.saveStateNow();
  }

  // Placeholder for resize methods
  private onResizeStart(e: MouseEvent, handleType: string) {
    e.stopPropagation(); // Prevent triggering drag-to-move
    if (!this.element) return;

    this.isResizing = true;
    this.currentResizeHandle = handleType;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;
    this.resizeStartWidth = this.element.offsetWidth;
    this.resizeStartHeight = this.element.offsetHeight;
    this.resizeStartLeft = this.element.offsetLeft;
    this.resizeStartTop = this.element.offsetTop;

    // Prevent text selection during resize
    document.body.classList.add('atlas-no-select');
    // Cursor is set by individual handle's CSS

    document.addEventListener('mousemove', this.onResizeMove);
    document.addEventListener('mouseup', this.onResizeEnd);
  }

  private onResizeMove = (e: MouseEvent) => {
    // To be implemented
    if (!this.isResizing || !this.element || !this.currentResizeHandle) return;

    const dx = e.clientX - this.resizeStartX;
    const dy = e.clientY - this.resizeStartY;

    let newWidth = this.resizeStartWidth;
    let newHeight = this.resizeStartHeight;
    let newLeft = this.resizeStartLeft;
    let newTop = this.resizeStartTop;

    // Adjust dimensions and positions based on the handle being dragged
    if (this.currentResizeHandle.includes('e')) {
      newWidth = this.resizeStartWidth + dx;
    }
    if (this.currentResizeHandle.includes('w')) {
      newWidth = this.resizeStartWidth - dx;
      newLeft = this.resizeStartLeft + dx;
    }
    if (this.currentResizeHandle.includes('s')) {
      newHeight = this.resizeStartHeight + dy;
    }
    if (this.currentResizeHandle.includes('n')) {
      newHeight = this.resizeStartHeight - dy;
      newTop = this.resizeStartTop + dy;
    }

    // Get min/max dimensions
    const computedStyle = getComputedStyle(this.element);
    const minWidth = parseInt(computedStyle.minWidth, 10) || 150;
    const maxWidth = parseInt(computedStyle.maxWidth, 10) || window.innerWidth;
    // Use a reasonable minHeight, could also be from CSS if defined for the element directly
    const minHeight = parseInt(computedStyle.minHeight, 10) || 100; 
    const maxHeight = parseInt(computedStyle.maxHeight, 10) || window.innerHeight;

    // Store pre-clamp dimensions to check if clamping occurred
    const originalNewWidth = newWidth;
    const originalNewHeight = newHeight;

    // Clamp dimensions
    newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
    newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

    // Adjust position if dimensions were clamped on the 'moving' side
    if (newWidth !== originalNewWidth) {
      if (this.currentResizeHandle.includes('w')) {
        newLeft = this.resizeStartLeft + (this.resizeStartWidth - newWidth);
      }
    }
    if (newHeight !== originalNewHeight) {
      if (this.currentResizeHandle.includes('n')) {
        newTop = this.resizeStartTop + (this.resizeStartHeight - newHeight);
      }
    }
    
    this.element.style.width = `${newWidth}px`;
    this.element.style.height = `${newHeight}px`;
    this.element.style.left = `${newLeft}px`;
    this.element.style.top = `${newTop}px`;
  }

  private onResizeEnd = () => {
    // To be implemented
    if (!this.isResizing) return;
    this.isResizing = false;

    document.body.classList.remove('atlas-no-select');

    document.removeEventListener('mousemove', this.onResizeMove);
    document.removeEventListener('mouseup', this.onResizeEnd);
    this.placement?.recordCurrent();
    this.saveStateNow();
  }

  private togglePin() {
    this.setPinned(!this.isPinned);
  }

  private setPinned(pinned: boolean): void {
    this.isPinned = pinned;
    if (pinned) this.placement?.recordCurrent();
    else this.placement?.clear();
    this.updatePinButtonState();
    this.manager.handlePreviewStateChanged(this);
  }

  private scheduleStateSave(): void {
    if (!this.isPinned) return;
    this.cancelStateSave();
    this.stateSaveTimer = window.setTimeout(() => this.saveStateNow(), STATE_SAVE_DELAY_MS);
  }

  /** Saves a pinned preview's layout and note state with the map. */
  public saveStateNow(): void {
    this.cancelStateSave();
    if (this.isPinned) this.manager.handlePreviewStateChanged(this);
  }

  private cancelStateSave(): void {
    if (this.stateSaveTimer === null) return;
    window.clearTimeout(this.stateSaveTimer);
    this.stateSaveTimer = null;
  }

  /** The saved state until a reopened note has taken it over, then the live one. */
  private getNoteViewState(): NoteViewState | null {
    if (this.savedViewState) return this.savedViewState;
    const view = this.leaf?.view;
    return view ? readNoteViewState(view) : null;
  }

  /** What the map saves for this preview, or null while it is not pinned. */
  public toPinnedNotePreview(): PinnedNotePreview | null {
    const layout = this.placement?.getLayout();
    if (!this.isPinned || !layout || !this.originatingPin) return null;
    const view = this.getNoteViewState();
    return {
      anchorId: this.originatingPin.id,
      notePath: this.originalNotePath,
      ...layout,
      ...(view ? { view } : {}),
    };
  }
  
  private updatePinButtonState() {
    if (this.pinButton) {
      // Clear the button first
      this.pinButton.empty();
      
      // Set the appropriate icon
      setIcon(this.pinButton, this.isPinned ? 'pin-off' : 'pin');
      
      // Update label and class
      this.pinButton.setAttribute('aria-label', this.isPinned ? t('preview.unpin') : t('preview.pin'));
      
      // Toggle the pinned class
      if (this.isPinned) {
        this.pinButton.classList.add('is-pinned');
        // Also add the lucide classes that might be expected
        const svgIcon = this.pinButton.querySelector('svg');
        if (svgIcon) {
          svgIcon.classList.add('svg-icon', 'lucide-pin-off');
        }
      } else {
        this.pinButton.classList.remove('is-pinned');
        const svgIcon = this.pinButton.querySelector('svg');
        if (svgIcon) {
          svgIcon.classList.add('svg-icon', 'lucide-pin');
        }
      }
    }
  }
  hide(force?: boolean): void {
    if (!force && this.isPinned) return;
    this._forceHide();
  }

  /** Closed by the user: unlike `hide`, the map forgets the preview too. */
  private close(): void {
    if (this.element) this.manager.handlePreviewDismissed(this);
    this._forceHide();
  }
  private _forceHide() {
    this.cancelStateSave();
    if (this.element) {
      document.removeEventListener('mousemove', this.onDragMove);
      document.removeEventListener('mouseup', this.onDragEnd);
      // Remove resize listeners if any
      document.removeEventListener('mousemove', this.onResizeMove);
      document.removeEventListener('mouseup', this.onResizeEnd);
      // Remove the wrapper (which contains the element) from the DOM
      if (this.wrapperEl) {
        this.wrapperEl.remove();
        this.wrapperEl = null;
      } else {
        this.element.remove();
      }
      this.manager.handlePreviewClosed(this);
      this.element = null;
      // Use the same key format when removing (with original path including header)
      const windowKey = this.originatingPin ? `${this.originalNotePath}::${this.originatingPin.id}` : this.originalNotePath;
      NotePreviewWindow.openWindows.delete(windowKey);
      this.parentComponent.unload();
    }
    if (this.leaf) {
      try {
        if (!this.usesPopover && this.leaf.view && this.leaf.view.containerEl && this.leaf.view.containerEl.parentElement) {
          this.leaf.view.containerEl.remove();
        }
        this.leaf.detach();
      } catch (err) {
        console.warn('[NotePreviewWindow] Error detaching leaf:', err);
      }
      this.leaf = null;
    }
    this.usesPopover = false;
  }
  static closePreview(notePath: string, forceClosePinned: boolean = false) {
    // Look for any windows with this note path
    for (const [, windowInstance] of NotePreviewWindow.openWindows.entries()) {
      if (windowInstance.notePath === notePath) {
        if (forceClosePinned) {
          windowInstance._forceHide();
        } else {
          windowInstance.hide();
        }
      }
    }
  }
  static closeAllPreviews() {
    NotePreviewWindow.openWindows.forEach((instance) => {
      instance.hide();
    });
  }
  public getIsPinned(): boolean {
    return this.isPinned;
  }
  
  /**
   * Open the file in the main workspace
   */
  private async openFile(): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(this.notePath);
    if (!(file instanceof TFile)) {
      console.error(`[NotePreviewWindow] Cannot open file: ${this.notePath}`);
      return;
    }
    
    // Check if this is an atlas map file
    if (file.extension === 'atlasmap') {
      // Open map in Atlas VTT view
      const leaves = this.app.workspace.getLeavesOfType('atlas-vtt');
      const existingLeaf = leaves[0];
      if (existingLeaf) {
        await existingLeaf.setViewState({
          type: 'atlas-vtt',
          state: { file: file.path }
        });
        this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
      } else {
        const newLeaf = this.app.workspace.getLeaf(true);
        await newLeaf.setViewState({
          type: 'atlas-vtt',
          state: { file: file.path }
        });
        this.app.workspace.setActiveLeaf(newLeaf, { focus: true });
      }
      this.close();
    } else {
      // Open the file normally
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
      
      // If we have a header to scroll to, handle it
      if (this.headerToScrollTo) {
        // Use openLinkText which handles headers properly
        runInBackground(this.app.workspace.openLinkText(this.originalNotePath, '', false), `Opening ${this.originalNotePath}`, t('loot.openFailed'));
      }
      this.close(); // Close the preview after opening the file
    }
  }
  

  
  private async waitForViewReady(): Promise<void> {
    if (!this.leaf?.view) {
      console.warn('[NotePreviewWindow] No leaf view in waitForViewReady');
      return;
    }
    
    // Wait for the view to have content
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max
      
      const checkReady = () => {
        attempts++;
        
        if (!this.leaf?.view) {
          console.warn('[NotePreviewWindow] Leaf view disappeared during wait');
          resolve();
          return;
        }
        
        // Check if the view has rendered content
        const view = this.leaf.view;
        const contentLength1 = view instanceof ItemView ? view.contentEl.textContent?.length || 0 : 0;
        const contentLength2 = view.containerEl?.querySelector('.markdown-preview-view')?.textContent?.length || 0;
        const contentLength3 = view.containerEl?.querySelector('.cm-content')?.textContent?.length || 0;
        
        const hasContent = contentLength1 > 0 || contentLength2 > 0 || contentLength3 > 0;
        
        if (hasContent || attempts >= maxAttempts) {
          resolve();
        } else {
          window.setTimeout(checkReady, 100);
        }
      };
      
      checkReady();
    });
  }
  
  /**
   * Scrolls the note to its heading. The editor and reading view only draw the
   * lines near the screen, so the view first scrolls to the heading's line
   * from the metadata cache, then aligns the drawn heading until it holds still.
   */
  private scrollToHeader(headerText: string): void {
    const view = this.leaf?.view;
    if (!(view instanceof MarkdownView) || !view.file) return;
    const line = headingLine(this.app, view.file, headerText);
    if (line === null) {
      console.warn('[NotePreviewWindow] Heading not found in note:', headerText);
      return;
    }

    const viewContent = view.containerEl;
    // Only the shown mode counts: the view keeps the other one in the DOM, hidden.
    const findHeading = view.getMode() === 'preview'
      ? (): HTMLElement | null => findRenderedHeading(view.previewMode.containerEl, headerText)
      : (): HTMLElement | null => findEditorHeading(viewContent, line);
    viewContent.classList.add(PENDING_SCROLL_CLASS);
    const stop = holdHeadingInView(
      { container: viewContent, findHeading, scrollToLine: () => view.currentMode.applyScroll(line) },
      (heading) => {
        viewContent.classList.remove(PENDING_SCROLL_CLASS);
        if (heading) this.flashHeading(heading);
      },
    );
    this.parentComponent.register(stop);
  }
}

/**
 * The layer of the map's UI that holds its previews (`UIOverlay`): above the
 * toolbar, scene tabs and widgets, below overlays such as the DM screen.
 */
function resolvePreviewLayer(mountRoot: HTMLElement): HTMLElement {
  return mountRoot.querySelector<HTMLElement>(`.${NOTE_PREVIEW_LAYER_CLASS}`) ?? mountRoot;
}
