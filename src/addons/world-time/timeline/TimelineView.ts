import { ItemView, setIcon, type WorkspaceLeaf } from 'obsidian';
import { SettingsService } from 'src/app/services/SettingsService';
import { CalendarService } from '../calendar/CalendarService';
import { viewingSpan } from '../dating/dateRange';
import { WorldNoteIndex } from '../notes/WorldNoteIndex';
import type { NoteLink } from '../notes/worldNoteRecord';
import type { ActiveAtlasView } from '../plugin/activeAtlasView';
import { effectiveViewingDate } from '../WorldTimeController';
import { worldSettingsOf } from '../worldSettings';
import { buildTimeline, DEFAULT_TIMELINE_FILTER, linkKey, timelineChoices, type TimelineFilter, type TimelineRow, type TimelineZoom } from './timelineModel';

export const TIMELINE_VIEW_TYPE = 'atlas-world-timeline';

const ZOOMS: Record<TimelineZoom, string> = { era: 'Eras', century: 'Centuries', decade: 'Decades', year: 'Years' };
const IMPORTANCE: Record<string, string> = { '1': 'All events', '2': 'Importance 2+', '3': 'Importance 3+', '4': 'Importance 4+', '5': 'World-shaking' };

/**
 * The world's history: every `type: event` note in date
 * order with era bands, filtered by place (with the places inside it),
 * person, faction, importance and text. Clicking opens the note; the clock
 * button moves the last used scene to the event's date.
 */
export class TimelineView extends ItemView {
  private filter: TimelineFilter = { ...DEFAULT_TIMELINE_FILTER };
  private listEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private filtersEl: HTMLElement | null = null;
  private sceneUnsubscribe: (() => void) | null = null;
  private renderQueued = false;
  private filtersDirty = false;

  constructor(leaf: WorkspaceLeaf, private readonly scenes: ActiveAtlasView) {
    super(leaf);
  }

  getViewType(): string { return TIMELINE_VIEW_TYPE; }
  getDisplayText(): string { return 'World timeline'; }
  getIcon(): string { return 'calendar-range'; }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('atlas-world-timeline');
    this.filtersEl = this.contentEl.createDiv({ cls: 'atlas-world-timeline__filters' });
    this.statusEl = this.contentEl.createDiv({ cls: 'atlas-world-timeline__status' });
    this.listEl = this.contentEl.createDiv({ cls: 'atlas-world-timeline__list' });

    const notes = WorldNoteIndex.forApp(this.app);
    const calendars = CalendarService.forApp(this.app);
    this.register(notes.subscribe(() => this.queueRender(true)));
    this.register(calendars.subscribe(() => this.queueRender(false)));
    this.register(this.scenes.subscribe(() => this.followScene()));
    const settings = SettingsService.forApp(this.app);
    if (settings) this.register(settings.onChange(() => this.queueRender(false)));
    this.register(() => this.sceneUnsubscribe?.());
    this.followScene();
    this.renderFilters();
    this.renderList();
  }

  async onClose(): Promise<void> {
    this.sceneUnsubscribe?.();
    this.sceneUnsubscribe = null;
  }

  /** Marks the events under way at the last used scene's date, and follows that date. */
  private followScene(): void {
    this.sceneUnsubscribe?.();
    const store = this.scenes.get()?.getStore();
    this.sceneUnsubscribe = store ? store.subscribe((state) => state.worldTime.viewingDate, () => this.queueRender(false)) : null;
    this.queueRender(false);
  }

  private queueRender(filters: boolean): void {
    if (filters) this.filtersDirty = true;
    if (this.renderQueued) return;
    this.renderQueued = true;
    window.requestAnimationFrame(() => {
      this.renderQueued = false;
      if (this.filtersDirty) this.renderFilters();
      this.filtersDirty = false;
      this.renderList();
    });
  }

  private renderFilters(): void {
    const el = this.filtersEl;
    if (!el) return;
    el.empty();
    const notes = WorldNoteIndex.forApp(this.app);
    const choices = timelineChoices(notes.events(), (path) => notes.parentOf(path));

    const search = el.createEl('input', { type: 'search', placeholder: 'Search events…' });
    search.value = this.filter.text;
    search.addEventListener('input', () => this.update({ text: search.value }));

    this.addSelect(el, 'Place', this.linkOptions(choices.places, 'All places'), this.filter.place, (place) => this.update({ place }));
    this.addSelect(el, 'Person', this.linkOptions(choices.people, 'All people'), this.filter.person, (person) => this.update({ person }));
    this.addSelect(el, 'Faction', this.linkOptions(choices.factions, 'All factions'), this.filter.faction, (faction) => this.update({ faction }));
    this.addSelect(el, 'Importance', IMPORTANCE, String(this.filter.minImportance), (value) => this.update({ minImportance: Number(value) }));
    this.addSelect(el, 'Zoom', ZOOMS, this.filter.zoom, (zoom) => this.update({ zoom: zoom as TimelineZoom }));
  }

  private linkOptions(links: readonly NoteLink[], all: string): Record<string, string> {
    const options: Record<string, string> = { '': all };
    for (const link of links) options[linkKey(link)] = link.name;
    return options;
  }

  private addSelect(parent: HTMLElement, label: string, options: Record<string, string>, value: string, onChange: (value: string) => void): void {
    const select = parent.createEl('select', { cls: 'dropdown', attr: { 'aria-label': label } });
    for (const [key, text] of Object.entries(options)) select.createEl('option', { value: key, text });
    // A filter whose value vanished from the notes shows (and keeps) no stale choice.
    if (!(value in options)) select.createEl('option', { value, text: `${label}: ${value}` });
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
  }

  private update(changes: Partial<TimelineFilter>): void {
    this.filter = { ...this.filter, ...changes };
    this.renderList();
  }

  private renderList(): void {
    const listEl = this.listEl;
    if (!listEl || !this.statusEl) return;
    const notes = WorldNoteIndex.forApp(this.app);
    const calendar = CalendarService.forApp(this.app).calendar();
    const scene = this.scenes.get();
    const settings = worldSettingsOf(SettingsService.forApp(this.app));
    const viewingDate = scene ? effectiveViewingDate(scene.getStore().getState().worldTime, settings) : null;
    const rows = buildTimeline({
      calendar,
      events: notes.events(),
      eras: notes.eras(),
      parentOf: (path) => notes.parentOf(path),
      filter: this.filter,
      viewing: viewingSpan(calendar, viewingDate),
    });
    const count = rows.filter((row) => row.kind === 'event').length;
    const total = notes.events().length;
    this.statusEl.setText(total === 0
      ? 'No event notes yet (notes with `type: event` in their frontmatter).'
      : `${count} of ${total} events${scene ? ` · scene: ${scene.file?.basename ?? 'untitled'}${viewingDate ? ` at ${viewingDate}` : ''}` : ''}`);
    listEl.empty();
    for (const row of rows) this.renderRow(listEl, row, scene !== null);
  }

  private renderRow(parent: HTMLElement, row: TimelineRow, hasScene: boolean): void {
    if (row.kind === 'group' || row.kind === 'era') {
      const heading = parent.createDiv({ cls: row.kind === 'era' ? 'atlas-world-timeline__era' : 'atlas-world-timeline__group', text: row.label });
      if (row.kind === 'era') heading.addEventListener('click', () => { void this.app.workspace.openLinkText(row.path, '', false); });
      return;
    }
    const { event } = row;
    const item = parent.createDiv({ cls: `atlas-world-timeline__event atlas-world-timeline__importance-${event.importance}` });
    item.toggleClass('is-current', row.current);
    item.createSpan({ cls: 'atlas-world-timeline__date', text: row.dateLabel });
    item.createSpan({ cls: 'atlas-world-timeline__title', text: event.title });
    item.addEventListener('click', (e) => { void this.app.workspace.openLinkText(event.path, '', e.metaKey || e.ctrlKey); });
    if (hasScene && event.date) {
      const go = item.createEl('button', { cls: 'clickable-icon atlas-world-timeline__goto', attr: { 'aria-label': 'Show this date in the scene' } });
      setIcon(go, 'calendar-clock');
      go.addEventListener('click', (e) => {
        e.stopPropagation();
        this.scenes.get()?.getStore().getState().setViewingDate(event.date ?? null);
      });
    }
  }
}
