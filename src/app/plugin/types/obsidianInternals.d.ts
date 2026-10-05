import 'obsidian';
import type { Component, EditorSuggest, EventRef, Menu, Plugin, TAbstractFile, TFile, View } from 'obsidian';

/**
 * Obsidian members that exist at runtime but are missing from the public
 * typings. Declared once here so call sites stay type-checked instead of
 * casting to `any`. Anything listed is undocumented API: guard optional
 * members before use.
 */
declare module 'obsidian' {
  interface App {
    openWithDefaultApp(path: string): void;
    showInFolder(path: string): void;
    /** Community plugin registry; read only for diagnostics in issue reports. */
    plugins?: {
      plugins: Record<string, Plugin>;
      enabledPlugins: Set<string>;
    };
    /** Active theme name, empty for the default theme. */
    customCss?: {
      theme?: string;
    };
    /** Renders `![[file]]` embeds and hover previews of non-markdown files, by extension. */
    embedRegistry?: EmbedRegistry;
  }

  /** What Obsidian hands an embed creator: where to render and which link asked for it. */
  interface EmbedContext {
    app: App;
    containerEl: HTMLElement;
    linktext: string;
    sourcePath: string;
    depth: number;
    /** Set for embeds in notes (reading view and live preview); unset in hover previews. */
    showInline?: boolean;
  }

  /** An embed: Obsidian adds it as a child of the note's component and then calls `loadFile`. */
  interface FileEmbed extends Component {
    loadFile(): Promise<void>;
  }

  /** Returns null to let Obsidian show its plain file embed. */
  type EmbedCreator = (context: EmbedContext, file: TFile, subpath: string) => FileEmbed | null;

  interface EmbedRegistry {
    /** Throws when the extension already has an embed. */
    registerExtension(extension: string, creator: EmbedCreator): void;
    unregisterExtension(extension: string): void;
    isExtensionRegistered(extension: string): boolean;
  }

  interface FileManager {
    /** Opens Obsidian's rename prompt for `file`. */
    promptForFileRename?(file: TAbstractFile): void;
  }

  /** View of the core file explorer (`file-explorer` leaves); check for it at runtime before use. */
  interface FileExplorerView extends View {
    revealInFolder(file: TAbstractFile): void;
  }

  interface WorkspaceLeaf {
    containerEl: HTMLElement;
    tabHeaderEl?: HTMLElement;
  }

  interface Workspace {
    /** A detached leaf meant for popover-style views; not part of any workspace split. */
    getLeafPopover?(): WorkspaceLeaf | undefined;
    /** Renders `leaf` into `container`, turning it into a popover view for the leaf. */
    openPopover?(
      leaf: WorkspaceLeaf,
      container: HTMLElement | ShadowRoot,
      options?: { focus?: boolean },
    ): void;

    /** Editor suggesters in the order they are asked; the first that triggers wins. */
    editorSuggest?: {
      suggests: EditorSuggest<unknown>[];
    };

    on(
      name: 'link-menu',
      callback: (menu: Menu, linktext: string, sourcePath: string) => unknown,
      ctx?: unknown,
    ): EventRef;
  }
}
