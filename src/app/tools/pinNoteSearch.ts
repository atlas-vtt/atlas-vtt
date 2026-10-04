import { App, TFile, setIcon } from 'obsidian';
import { mayLinkFromScene } from '../services/sceneLinks';
import { baseName, parentPath } from '../utils/pathUtils';
import { STANDING_LIST } from '../keyboard/tooltipEscape';
import { runInBackground } from '../utils/backgroundTask';
import { addonPinSearchEntries } from '../addons/pinAddons';
import type { PinSearchEntry } from '../addons/hooks/pinHooks';

const RESULT_LIMIT = 30;

export interface PinNoteSearchOptions {
  app: App;
  /** The map the pin goes on; it may only link to scenes of its own collection. */
  mapPath: string | null;
  /** A note (optionally `path#heading`) was chosen. */
  onPick: (notePath: string) => void;
  onCancel: () => void;
}

export interface PinNoteSearch {
  focus: () => void;
}

interface ResultEntry {
  element: HTMLElement;
  choose: () => void;
}

let listCount = 0;

/**
 * Search field, result list and key hints of the note pin dropdown. Picking a
 * note with headings, or typing `note#`, lists its headings. One result is
 * always active (the first after every change), so Enter picks it and the
 * arrow keys move through the list.
 */
export function createPinNoteSearch(container: HTMLElement, options: PinNoteSearchOptions): PinNoteSearch {
  const { app } = options;
  const listId = `atlas-pin-results-${++listCount}`;

  const searchWrapper = container.createDiv({ cls: 'pin-search-wrapper' });
  setIcon(searchWrapper.createDiv({ cls: 'pin-search-icon' }), 'search');
  const search = searchWrapper.createEl('input', {
    cls: 'pin-search-input',
    attr: {
      type: 'text',
      placeholder: 'Search notes and maps...',
      role: 'combobox',
      'aria-label': 'Search notes and maps',
      'aria-controls': listId,
      'aria-expanded': 'true',
      'aria-autocomplete': 'list',
    },
  });

  const results = container.createDiv({ cls: 'pin-results', attr: { id: listId, role: 'listbox', ...STANDING_LIST } });

  const footer = container.createDiv({ cls: 'pin-footer' });
  const footerHints: Array<[key: string, label: string]> = [['↑↓', 'navigate'], ['Enter', 'select'], ['Esc', 'cancel']];
  footerHints.forEach(([key, label]) => {
    const hint = footer.createSpan({ cls: 'pin-footer-hint' });
    hint.createEl('kbd', { text: key });
    hint.appendText(label);
  });

  const files = app.vault.getAllLoadedFiles().filter((f): f is TFile =>
    f instanceof TFile && (f.extension === 'md' || (f.extension === 'atlasmap' && mayLinkFromScene(options.mapPath, f.path)))
  );

  const nameCounts = new Map<string, number>();
  files.forEach((file) => {
    const name = file.basename.toLowerCase();
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  });
  /** The folder name of a file whose name another file shares, so their results can be told apart. */
  const sharedNameFolder = (file: TFile): string | null =>
    (nameCounts.get(file.basename.toLowerCase()) ?? 0) > 1 ? baseName(parentPath(file.path)) || '/' : null;

  const noteLabel = (file: TFile): string => {
    const folder = sharedNameFolder(file);
    return folder === null ? file.basename : `${folder} › ${file.basename}`;
  };

  let entries: ResultEntry[] = [];
  let activeIndex = -1;
  /** The note picked from the results, whose headings are listed; names only typed are looked up. */
  let pickedNote: TFile | null = null;

  const setActive = (index: number): void => {
    entries[activeIndex]?.element.removeClass('is-active');
    entries[activeIndex]?.element.setAttribute('aria-selected', 'false');
    activeIndex = index;
    const active = entries[index];
    if (!active) {
      search.removeAttribute('aria-activedescendant');
      return;
    }
    active.element.addClass('is-active');
    active.element.setAttribute('aria-selected', 'true');
    search.setAttribute('aria-activedescendant', active.element.id);
    active.element.scrollIntoView({ block: 'nearest' });
  };

  const addEntry = (choose: () => void): HTMLElement => {
    const index = entries.length;
    const element = results.createDiv({
      cls: 'pin-result-item',
      attr: { id: `${listId}-${index}`, role: 'option', 'aria-selected': 'false' },
    });
    element.onclick = choose;
    element.onmousemove = () => {
      if (activeIndex !== index) setActive(index);
    };
    entries.push({ element, choose });
    return element;
  };

  const hasHeadings = (file: TFile): boolean => (app.metadataCache.getFileCache(file)?.headings?.length ?? 0) > 0;

  /** Lists the headings of `file`, keeping a heading query already typed. */
  const showHeadings = (file: TFile, headingQuery = ''): void => {
    pickedNote = file;
    search.value = `${file.basename}#${headingQuery}`;
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
    render();
  };

  const addWholeNoteEntry = (file: TFile, text: string): void => {
    const item = addEntry(() => options.onPick(file.path));
    item.addClass('pin-header-item');
    setIcon(item.createDiv({ cls: 'pin-result-icon' }), 'file');
    item.createSpan({ cls: 'pin-result-name', text });
    item.createSpan({ cls: 'pin-header-file', text: noteLabel(file) });
  };

  /** A note or map result. Picking a note with headings lists them; `choose` replaces that. */
  const addFileEntry = (file: TFile, choose?: () => void): void => {
    const isMap = file.extension === 'atlasmap';
    const item = addEntry(choose ?? (() => {
      if (hasHeadings(file)) showHeadings(file);
      else options.onPick(file.path);
    }));
    setIcon(item.createDiv({ cls: 'pin-result-icon' }), isMap ? 'map' : 'file');
    item.createSpan({ cls: 'pin-result-name', text: file.basename });
    const folder = sharedNameFolder(file);
    if (folder !== null) item.createSpan({ cls: 'pin-header-file', text: folder });
    if (isMap) item.createSpan({ cls: 'pin-result-badge is-map', text: 'Map' });
  };

  /** The notes whose headings `note#` lists: the picked one, else every note of that name, else every note containing it. */
  const headingTargets = (fileNamePart: string): TFile[] => {
    if (pickedNote?.basename === fileNamePart) return [pickedNote];
    const needle = fileNamePart.toLowerCase();
    const notes = files.filter((f) => f.extension === 'md');
    const exact = notes.filter((f) => f.basename.toLowerCase() === needle);
    return exact.length > 0 ? exact : notes.filter((f) => f.basename.toLowerCase().includes(needle));
  };

  const renderHeadings = (fileNamePart: string, headingQuery: string): void => {
    const targets = headingTargets(fileNamePart);
    const targetFile = targets[0];
    if (!targetFile) {
      results.createDiv({ cls: 'pin-empty-state', text: 'File not found' });
      return;
    }
    if (targets.length > 1) {
      // A heading is being typed: open the picked note's headings, even when it has none
      targets.slice(0, RESULT_LIMIT).forEach((file) => addFileEntry(file, () => showHeadings(file, headingQuery)));
      return;
    }

    const needle = headingQuery.toLowerCase();
    const headings = app.metadataCache.getFileCache(targetFile)?.headings ?? [];
    if (headings.length === 0) {
      addWholeNoteEntry(targetFile, 'Pin to entire note');
      return;
    }

    if (needle === '') addWholeNoteEntry(targetFile, 'Entire note');

    const matching = headings.filter((h) => h.heading.toLowerCase().includes(needle));
    if (matching.length === 0) {
      results.createDiv({ cls: 'pin-empty-state', text: 'No matching headers found' });
      return;
    }
    matching.forEach((header) => {
      const item = addEntry(() => options.onPick(`${targetFile.path}#${header.heading}`));
      item.addClass('pin-header-item');
      item.createSpan({ cls: 'pin-header-level', text: `H${header.level}` });
      item.createSpan({ cls: 'pin-result-name', text: header.heading });
      item.createSpan({ cls: 'pin-header-file', text: noteLabel(targetFile) });
    });
  };

  const renderFiles = (query: string): void => {
    const needle = query.toLowerCase();
    const matching = files.filter((f) => f.basename.toLowerCase().includes(needle));
    matching.slice(0, RESULT_LIMIT).forEach((file) => addFileEntry(file));
    addonPinSearchEntries({ app, query, files, mapPath: options.mapPath }).forEach(addAddonEntry);
    if (entries.length === 0) results.createDiv({ cls: 'pin-empty-state', text: 'No notes found' });
  };

  /** An entry an add-on offers, e.g. creating a note; it resolves to the note to link. */
  const addAddonEntry = (entry: PinSearchEntry): void => {
    const item = addEntry(() => runInBackground(entry.pick().then(options.onPick), entry.label));
    if (entry.cls) item.addClass(entry.cls);
    setIcon(item.createDiv({ cls: 'pin-result-icon' }), entry.icon);
    item.createSpan({ cls: 'pin-result-name', text: entry.label });
  };

  function render(): void {
    results.empty();
    entries = [];
    activeIndex = -1;

    const query = search.value;
    const hashIndex = query.indexOf('#');
    if (hashIndex === -1) {
      pickedNote = null;
      renderFiles(query);
    } else renderHeadings(query.substring(0, hashIndex), query.substring(hashIndex + 1));

    setActive(entries.length > 0 ? 0 : -1);
  }

  search.addEventListener('input', render);
  search.addEventListener('keydown', (e) => {
    // Keys typed here belong to the search, not to the map's hotkeys
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'Escape') {
      options.onCancel();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (entries.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + entries.length) % entries.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      entries[activeIndex]?.choose();
    }
  });

  render();

  return { focus: () => search.focus() };
}
