import { Modal, normalizePath, Notice, Setting, TFile, type App } from 'obsidian';
import type { AtlasView } from 'src/app/atlas-view';
import { SettingsService } from 'src/app/services/SettingsService';
import { ATLAS_NATIVE_MODAL_CLASSES } from 'src/app/ui/nativeModal';
import { CalendarService } from '../calendar/CalendarService';
import { addDateField } from '../ui/dateSetting';
import { effectiveViewingDate } from '../WorldTimeController';
import { worldSettingsOf } from '../worldSettings';
import { eventFileName, eventNoteContent, parseLinkList, type EventNoteDraft } from './eventNote';

/** Link text of the notes behind the selected pins. */
function scenePlaces(app: App, view: AtlasView): string[] {
  const { objects, selectedIds } = view.getStore().getState();
  const selectedPins = selectedIds.map((id) => objects.pins[id]).filter((pin) => pin !== undefined);
  const sourcePath = view.file?.path ?? '';
  const names = new Set<string>();
  for (const pin of selectedPins) {
    const path = pin.notePath.split('#')[0] ?? '';
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) names.add(app.metadataCache.fileToLinktext(file, sourcePath, true));
  }
  return [...names];
}

/**
 * "Log event": writes a `type: event` note dated at the
 * scene's viewing date, with the selected pins' notes as its places, so what
 * the party did becomes part of the world's history and shows on the map.
 */
export class LogEventModal extends Modal {
  private readonly draft: EventNoteDraft;
  private placesText: string;
  private peopleText = '';
  private factionsText = '';

  constructor(app: App, private readonly view: AtlasView) {
    super(app);
    const settings = worldSettingsOf(SettingsService.forApp(app));
    const date = effectiveViewingDate(view.getStore().getState().worldTime, settings) ?? '';
    const places = scenePlaces(app, view);
    this.placesText = places.join(', ');
    this.draft = { name: '', date, places, people: [], factions: [], importance: 2, knownBy: 'common' };
  }

  onOpen(): void {
    const { contentEl, draft } = this;
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, 'atlas-world-modal');
    this.setTitle('Log world event');
    const calendar = CalendarService.forApp(this.app).calendar();

    new Setting(contentEl).setName('Title').addText((text) => {
      text.setPlaceholder('The party burns the bandit camp').onChange((title) => { draft.name = title; });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    addDateField(new Setting(contentEl).setName('Date'), calendar, draft.date, (date) => { draft.date = date ?? ''; });
    addDateField(new Setting(contentEl).setName('End').setDesc('Optional'), calendar, undefined, (end) => {
      if (end) draft.end = end;
      else delete draft.end;
    });
    new Setting(contentEl).setName('Places').setDesc('Note names, comma-separated. Prefilled from the selected pins.')
      .addText((text) => text.setValue(this.placesText).onChange((value) => { this.placesText = value; }));
    new Setting(contentEl).setName('People')
      .addText((text) => text.setPlaceholder('Comma-separated').onChange((value) => { this.peopleText = value; }));
    new Setting(contentEl).setName('Factions')
      .addText((text) => text.setPlaceholder('Comma-separated').onChange((value) => { this.factionsText = value; }));
    new Setting(contentEl).setName('Importance').setDesc('5 = world-shaking')
      .addSlider((slider) => slider.setLimits(1, 5, 1).setValue(draft.importance).onChange((value) => { draft.importance = value; }));
    new Setting(contentEl).setName('Known by')
      .addDropdown((dropdown) => dropdown
        .addOptions({ common: 'Common folk', learned: 'The learned', secret: 'Secret' })
        .setValue(draft.knownBy)
        .onChange((value) => { draft.knownBy = value as EventNoteDraft['knownBy']; }));
    new Setting(contentEl).setName('Rumour').setDesc('How common folk tell it')
      .addTextArea((text) => text.onChange((rumour) => {
        if (rumour.trim()) draft.rumour = rumour.trim();
        else delete draft.rumour;
      }));
    new Setting(contentEl).setName('What happened')
      .addTextArea((text) => text.onChange((summary) => { draft.summary = summary; }));
    new Setting(contentEl)
      .addButton((button) => button.setButtonText('Create note').setCta().onClick(() => { void this.create(); }))
      .addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async create(): Promise<void> {
    const { draft } = this;
    if (!draft.name.trim()) {
      new Notice('Give the event a title.');
      return;
    }
    if (!draft.date) {
      new Notice('Give the event a date (set a viewing date in the scene to prefill it).');
      return;
    }
    draft.places = parseLinkList(this.placesText);
    draft.people = parseLinkList(this.peopleText);
    draft.factions = parseLinkList(this.factionsText);
    const settings = worldSettingsOf(SettingsService.forApp(this.app));
    const folder = normalizePath(settings.eventsFolder || '/');
    try {
      if (folder !== '/' && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
      const base = eventFileName(draft).replace(/\.md$/, '');
      let path = normalizePath(`${folder}/${base}.md`);
      for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) path = normalizePath(`${folder}/${base} ${n}.md`);
      const file = await this.app.vault.create(path, eventNoteContent(draft));
      new Notice(`Logged ${file.basename}`);
      this.close();
      await this.app.workspace.getLeaf('tab').openFile(file);
    } catch (error) {
      console.error('[Atlas world] Could not create the event note', error);
      new Notice('Could not create the event note; see the console.');
    }
  }
}
