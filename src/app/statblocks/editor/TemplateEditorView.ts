import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FileView, Scope, type Modifier, type TFile, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import { experimentalFeatureOn } from '../../experimental/experimentalFeatures';
import { SettingsService } from '../../services/SettingsService';
import { TemplateLibrary } from '../library/TemplateLibrary';
import { TemplateSession } from '../library/TemplateSession';
import { TEMPLATE_EXTENSION } from '../library/templateFiles';
import type { TemplateId } from '../model/templateTypes';
import { StatblockEditorRoot } from './StatblockEditorRoot';
import { openTemplateEditor } from './openTemplateEditor';
import { askToSaveClosed } from './template-editor/save/askToSaveClosed';
import type { SaveRequest } from './template-editor/save/saveChoice';
import { saveTemplate } from './template-editor/save/saveTemplate';
import type { TemplateEditorProblem } from './template-editor/TemplateEditorSurface';
import type { TemplateEditorHost } from './template-editor/TemplateEditor';
import type { KeyHandler } from './template-editor/useTemplateKeyboard';
import {
  TEMPLATE_EDITOR_VIEW_TYPE, readTemplateEditorEphemeral, readTemplateEditorState, type TemplateEditorEphemeral,
} from './templateEditorState';
import { t } from '../../i18n';

/**
 * Keys Obsidian or the browser would take before any listener of the editor
 * (Mod+G opens the graph, Mod+S saves the note): the view's scope asks the
 * editor first while its tab is active, and lets every key it does not use
 * through (spike S4).
 */
const SCOPED_KEYS: ReadonlyArray<readonly [Modifier[], string]> = [
  [['Mod'], 'z'], [['Mod', 'Shift'], 'z'], [['Mod'], 'y'], [['Mod'], 'd'], [['Mod'], 'g'], [['Mod', 'Shift'], 'g'],
  [['Mod', 'Alt'], 'r'], [['Mod'], 'c'], [['Mod'], 'v'], [['Mod'], 's'],
];

/**
 * The template editor (§4.6): a `FileView` for `.atlastemplate` files, so the
 * file explorer, rename and the file menu work as for any file; built-ins and
 * templates never saved open in it by id. Restoring its state reads, never
 * writes. One `TemplateSession` per template, shared with every other view of
 * it; nothing is written until Save. A view that closes holding the only
 * hold on unsaved changes hands it to the question whether to save them.
 */
export class TemplateEditorView extends FileView {
  allowNoFile = true;
  private builtInId: TemplateId | null = null;
  private draftId: TemplateId | null = null;
  private collectionId: string | null = null;
  private fromNote: string | null = null;
  private ephemeral: TemplateEditorEphemeral = {};
  private selectRequests = 0;
  private session: TemplateSession | null = null;
  private problem: TemplateEditorProblem | null = { kind: 'loading' };
  private root: Root | null = null;
  private keyHandler: KeyHandler | null = null;
  private stopLibrary: (() => void) | null = null;
  private stopSettings: (() => void) | null = null;
  private readonly host: TemplateEditorHost;
  private readonly registerKeys = (handler: KeyHandler | null): void => {
    this.keyHandler = handler;
  };

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.scope = new Scope(this.app.scope);
    for (const [modifiers, key] of SCOPED_KEYS) {
      this.scope.register(modifiers, key, (event) => !(this.keyHandler?.(event, true) ?? false));
    }
    this.host = {
      save: (request) => this.save(request),
      // Deleted: what was not saved goes with it, so closing asks nothing.
      close: () => {
        this.session?.discard();
        this.leaf.detach();
      },
    };
  }

  getViewType(): string {
    return TEMPLATE_EDITOR_VIEW_TYPE;
  }

  getDisplayText(): string {
    const id = this.builtInId;
    return this.session?.getSnapshot().name ?? this.file?.basename ?? (id ? TemplateLibrary.forApp(this.app).get(id)?.name : null) ?? t('statblockEditor.templateTitle');
  }

  getIcon(): string {
    return 'layout-template';
  }

  canAcceptExtension(extension: string): boolean {
    return extension === TEMPLATE_EXTENSION;
  }

  getState(): Record<string, unknown> {
    const own = { collectionId: this.collectionId, fromNote: this.fromNote };
    if (this.builtInId) return { templateId: this.builtInId, ...own };
    if (this.draftId) return { draftId: this.draftId, ...own };
    return { ...super.getState(), ...own };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const next = readTemplateEditorState(state);
    this.builtInId = next.templateId;
    this.draftId = next.templateId ? null : next.draftId;
    this.collectionId = next.collectionId;
    this.fromNote = next.fromNote;
    await super.setState(state, result);
    this.resolve();
  }

  /** `openTemplateEditor` asks once: a block to select. Never restored. */
  setEphemeralState(state: unknown): void {
    super.setEphemeralState(state);
    const next = readTemplateEditorEphemeral(state);
    if (next.select) {
      this.selectRequests += 1;
      this.ephemeral = next;
    }
    this.render();
  }

  async onLoadFile(file: TFile): Promise<void> {
    this.builtInId = null;
    this.draftId = null;
    await super.onLoadFile(file);
    this.resolve();
  }

  async onUnloadFile(file: TFile): Promise<void> {
    this.letGo();
    await super.onUnloadFile(file);
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('atlas-vtt-plugin', 'atlas-template-editor-view');
    this.root = createRoot(this.contentEl);
    // The library reads files after the layout is ready; a restored editor waits for its file.
    this.stopLibrary = TemplateLibrary.forApp(this.app).subscribe(() => this.resolve());
    // The experimental switch is read from Atlas' settings, which a view restored at startup meets before they are loaded.
    this.stopSettings = SettingsService.forApp(this.app)?.onChange(() => this.resolve()) ?? null;
    this.resolve();
  }

  async onClose(): Promise<void> {
    this.stopLibrary?.();
    this.stopLibrary = null;
    this.stopSettings?.();
    this.stopSettings = null;
    this.letGo();
    const root = this.root;
    this.root = null;
    root?.unmount();
  }

  /** The template the view shows: its built-in, its unsaved template, else its file's; the session follows it. */
  private resolve(): void {
    if (!experimentalFeatureOn(this.app, 'statblockEditor')) {
      this.letGo();
      this.problem = { kind: 'off' };
      this.render();
      return;
    }
    const library = TemplateLibrary.forApp(this.app);
    let id: TemplateId | null = this.builtInId ?? this.draftId;
    let problem: TemplateEditorProblem | null = null;
    if (!id && this.file) {
      const read = library.fileAt(this.file.path);
      const duplicate = read ? library.duplicateOf(read.path) : null;
      // A file deleted under an open session stays with the session, which offers to recreate it.
      if (!read && this.session) id = this.session.getSnapshot().id;
      else if (!read) problem = library.isLoading() ? { kind: 'loading' } : { kind: 'unreadable', problems: [] };
      else if (duplicate) problem = { kind: 'duplicate', of: duplicate };
      else if (!read.entry) problem = { kind: 'unreadable', problems: read.problems };
      else id = read.entry.template.id;
    }
    if (id !== (this.session?.getSnapshot().id ?? null)) {
      this.letGo();
      this.session = id ? TemplateSession.open(this.app, id) : null;
    }
    // A template never saved lives only as long as a session holds it: after a restart it is gone.
    if (!this.session && this.draftId) problem = { kind: 'gone' };
    this.problem = this.session ? null : problem ?? { kind: 'loading' };
    this.render();
  }

  /**
   * Saves as the dialog asked. A new template opens here in place of the one
   * edited, which keeps what its file holds; resolves with why it could not save.
   */
  private async save(request: SaveRequest): Promise<string | null> {
    const session = this.session;
    if (!session) return t('statblockEditor.templateClosed');
    const outcome = await saveTemplate(this.app, session, request, this.fromNote);
    if (!outcome.ok) return outcome.problem;
    if (outcome.made) {
      await openTemplateEditor(this.app, {
        templateId: outcome.made.id, path: outcome.made.path, collectionId: this.collectionId, fromNote: this.fromNote, leaf: this.leaf,
      });
    }
    return null;
  }

  /**
   * Lets go of the session. Unsaved changes nobody else holds are not
   * dropped: Obsidian lets no tab refuse to close, so the question whether
   * to save them is asked once the view is gone, and it keeps the hold.
   */
  private letGo(): void {
    const session = this.session;
    this.session = null;
    if (!session) return;
    if (!session.alone || !session.getSnapshot().dirty) {
      session.release();
      return;
    }
    const snapshot = session.getSnapshot();
    const { collectionId, fromNote } = this;
    askToSaveClosed(this.app, session, {
      fromNote,
      reopen: async () => {
        await openTemplateEditor(this.app, { templateId: snapshot.id, path: snapshot.path, unsaved: snapshot.unsaved, collectionId, fromNote });
      },
    });
  }

  private render(): void {
    if (!this.root) return;
    const { select } = this.ephemeral;
    this.root.render(React.createElement(StatblockEditorRoot, {
      surface: {
        kind: 'template-editor',
        props: {
          app: this.app,
          session: this.session,
          problem: this.problem,
          host: this.host,
          collectionId: this.collectionId,
          initialSelection: select ? [select] : undefined,
          selectRequest: this.selectRequests,
          registerKeys: this.registerKeys,
        },
      },
    }));
  }
}
