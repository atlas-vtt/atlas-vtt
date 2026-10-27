import { App, TFile, setIcon } from 'obsidian';
import { mayLinkFromScene } from '../services/sceneLinks';
import { t } from '../i18n';
import { baseName, parentPath } from '../utils/pathUtils';
import { STANDING_LIST } from '../keyboard/tooltipEscape';
import { runInBackground } from '../utils/backgroundTask';
import type { PinCreateEntry, PinLinkTarget } from './pinCreateEntries';
import { encounterFoldersOf, type EncounterFolder } from '../encounters/encounterFolders';

const RESULT_LIMIT = 30;
const BY_NAME = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export interface PinNoteSearchOptions {
  app: App;
  /** The map the pin goes on; it may only link to scenes of its own collection. */
  mapPath: string | null;
  /** A note (optionally `path#heading`), a scene or a folder of encounters was chosen; a scene made for the pin names the floor it opens on. */
  onPick: (notePath: string, sceneLevel?: string) => void;
  onCancel: () => void;
  /** Ways to make what a typed name names, offered first while no file carries that name. */
  createEntries?: readonly PinCreateEntry[];
}

export interface PinNoteSearch {
  focus: () => void;
  /** A create entry is at work (in a tab of its own, perhaps): presses outside the dropdown belong to it. */
  isCreating: () => boolean;
}

interface ResultEntry {
  element: HTMLElement;
  choose: () => void;
}

let listCount = 0;

/**
 * Search field, result list and key hints of the note pin dropdown, offering notes, the scenes of
 * the map's collection and its folders of encounters. Picking a
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
      placeholder: t('pin.search.placeholder'),
      role: 'combobox',
      'aria-label': t('pin.search.label'),
      'aria-controls': listId,
      'aria-expanded': 'true',
      'aria-autocomplete': 'list',
    },
  });

  const results = container.createDiv({ cls: 'pin-results', attr: { id: listId, role: 'listbox', ...STANDING_LIST } });

  const footer = container.createDiv({ cls: 'pin-footer' });
  const footerHints: Array<[key: string, label: string]> = [['↑↓', t('pin.search.navigate')], ['Enter', t('pin.search.select')], ['Esc', t('pin.search.cancel')]];
  footerHints.forEach(([key, label]) => {
    const hint = footer.createSpan({ cls: 'pin-footer-hint' });
    hint.createEl('kbd', { text: key });
    hint.appendText(label);
  });

  const files = app.vault.getAllLoadedFiles().filter((f): f is TFile =>
    f instanceof TFile && (f.extension === 'md' || (f.extension === 'atlasmap' && mayLinkFromScene(options.mapPath, f.path)))
  );

  // The scene's own folders of encounters, which a pin rolls from
  const encounterFolders = encounterFoldersOf(app, options.mapPath);

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
  /** A create entry is under way; nothing else is picked until it ends. */
  let creating = false;

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

  const pick = (notePath: string): void => {
    if (!creating) options.onPick(notePath);
  };

  const createAndPick = async (entry: PinCreateEntry, name: string): Promise<void> => {
    creating = true;
    if (entry.away) container.addClass('atlas-away');
    let target: PinLinkTarget | null;
    try {
      target = await entry.create(name, container);
    } finally {
      creating = false;
      container.removeClass('atlas-away');
    }
    if (target !== null) options.onPick(target.path, target.sceneLevel);
  };

  /** The create entries for a typed name no file carries; one whose name is unusable shows why, and is skipped by the keys. */
  const renderCreateEntries = (name: string): void => {
    for (const entry of options.createEntries ?? []) {
      const problem = entry.problem?.(name) ?? null;
      const item = problem === null
        ? addEntry(() => {
          if (!creating) runInBackground(createAndPick(entry, name), `Creating ${name} for a pin`, t('pin.search.createFailed', { name }));
        })
        : results.createDiv({ cls: 'pin-result-item is-disabled', attr: { role: 'option', 'aria-disabled': 'true' } });
      item.addClass('pin-create-item');
      setIcon(item.createDiv({ cls: 'pin-result-icon' }), entry.icon);
      const text = item.createDiv({ cls: 'pin-result-text' });
      text.createSpan({ cls: 'pin-result-name', text: entry.label(name) });
      if (problem !== null) text.createSpan({ cls: 'pin-result-reason', text: problem });
    }
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
    const item = addEntry(() => pick(file.path));
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
      else pick(file.path);
    }));
    setIcon(item.createDiv({ cls: 'pin-result-icon' }), isMap ? 'map' : 'file');
    item.createSpan({ cls: 'pin-result-name', text: file.basename });
    const folder = sharedNameFolder(file);
    if (folder !== null) item.createSpan({ cls: 'pin-header-file', text: folder });
    if (isMap) item.createSpan({ cls: 'pin-result-badge is-map', text: t('pin.search.map') });
  };

  const addEncounterFolderEntry = (folder: EncounterFolder): void => {
    const item = addEntry(() => options.onPick(folder.path));
    setIcon(item.createDiv({ cls: 'pin-result-icon' }), 'swords');
    item.createSpan({ cls: 'pin-result-name', text: folder.name });
    if (folder.trail) item.createSpan({ cls: 'pin-header-file', text: folder.trail });
    item.createSpan({ cls: 'pin-result-badge is-encounters', text: t('pin.search.encounters', { count: folder.count }) });
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
      results.createDiv({ cls: 'pin-empty-state', text: t('pin.search.notFound') });
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
      addWholeNoteEntry(targetFile, t('pin.search.pinWhole'));
      return;
    }

    if (needle === '') addWholeNoteEntry(targetFile, t('pin.search.whole'));

    const matching = headings.filter((h) => h.heading.toLowerCase().includes(needle));
    if (matching.length === 0) {
      results.createDiv({ cls: 'pin-empty-state', text: t('pin.search.noHeaders') });
      return;
    }
    matching.forEach((header) => {
      const item = addEntry(() => pick(`${targetFile.path}#${header.heading}`));
      item.addClass('pin-header-item');
      item.createSpan({ cls: 'pin-header-level', text: `H${header.level}` });
      item.createSpan({ cls: 'pin-result-name', text: header.heading });
      item.createSpan({ cls: 'pin-header-file', text: noteLabel(targetFile) });
    });
  };

  /** Notes, scenes and folders of encounters in one list, by name. */
  const renderFiles = (query: string): void => {
    const needle = query.toLowerCase();
    const name = query.trim();
    if (name !== '' && !files.some((f) => f.basename.toLowerCase() === name.toLowerCase())) renderCreateEntries(name);
    const matching: Array<{ name: string; add: () => void }> = [
      ...encounterFolders
        .filter((folder) => `${folder.trail} ${folder.name}`.toLowerCase().includes(needle))
        .map((folder) => ({ name: folder.name, add: () => addEncounterFolderEntry(folder) })),
      ...files
        .filter((f) => f.basename.toLowerCase().includes(needle))
        .map((file) => ({ name: file.basename, add: () => addFileEntry(file) })),
    ];
    if (matching.length === 0) {
      if (results.childElementCount > 0) return;
      results.createDiv({ cls: 'pin-empty-state', text: t('pin.search.noNotes') });
      return;
    }
    matching
      .sort((a, b) => BY_NAME.compare(a.name, b.name))
      .slice(0, RESULT_LIMIT)
      .forEach((result) => result.add());
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

  return { focus: () => search.focus(), isCreating: () => creating };
}
