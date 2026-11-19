import { t } from '../i18n';
import { hotkeyCaps } from './hotkeyCaps';
import { availableHotkeys, type MapHotkeys } from './mapHotkeys';

/** One line of the cheat sheet: what it does, and the keys that do it (each entry one way, its caps pressed together). */
export interface CheatSheetRow {
  id: string;
  label: string;
  combos: string[][];
  /** What the pointer does with the keys held ("hover", "drag"). */
  gesture?: string;
}

export interface CheatSheetSection {
  title: string;
  rows: CheatSheetRow[];
}

/** Keys that are no binding of the GM's: they work the same on every map, with the pointer or in Atlas' panels. */
function interactionRows(mac: boolean): CheatSheetRow[] {
  const row = (id: string, label: string, bindings: string[], gesture?: string): CheatSheetRow => ({
    id, label, combos: bindings.map((binding) => hotkeyCaps(binding, mac)), ...(gesture ? { gesture } : {}),
  });
  return [
    row('moveAlignment', t('hotkey.moveAlignment'), ['Arrows']),
    row('fineAlignment', t('hotkey.fineAlignment'), ['Shift+Arrows']),
    row('previewStatblock', t('hotkey.previewStatblock'), ['Mod'], t('hotkey.hover')),
    row('dragCopy', t('hotkey.dragCopy'), ['Alt'], t('hotkey.drag')),
    row('openBoth', t('hotkey.openBoth'), ['Shift+Enter']),
    row('waypoint', t('hotkey.waypoint'), ['Space'], t('hotkey.whileDragging')),
    row('closeDialog', t('hotkey.closeDialog'), ['Escape']),
    row('navigateMenus', t('hotkey.navigateMenus'), ['Tab', 'Arrows']),
  ];
}

/** The sheet as the GM's bindings make it, group by group in the settings' order, the pointer's keys last. */
export function cheatSheetSections(bindings: MapHotkeys, player: boolean, mac: boolean): CheatSheetSection[] {
  const sections: CheatSheetSection[] = [];
  for (const action of availableHotkeys(player)) {
    const row: CheatSheetRow = { id: action.id, label: action.label, combos: bindings[action.id] ? [hotkeyCaps(bindings[action.id], mac)] : [] };
    const section = sections.find((candidate) => candidate.title === action.group);
    if (section) section.rows.push(row);
    else sections.push({ title: action.group, rows: [row] });
  }
  sections.push({ title: t('hotkey.navigation'), rows: interactionRows(mac) });
  return sections;
}

/** The rows a search keeps: those whose section, name, gesture or keys hold every word typed. */
export function filterCheatSheet(sections: readonly CheatSheetSection[], query: string): CheatSheetSection[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...sections];
  return sections
    .map((section) => ({
      ...section,
      rows: section.rows.filter((row) => {
        const text = [section.title, row.label, row.gesture ?? '', ...row.combos.flat()].join(' ').toLocaleLowerCase();
        return words.every((word) => text.includes(word));
      }),
    }))
    .filter((section) => section.rows.length > 0);
}
