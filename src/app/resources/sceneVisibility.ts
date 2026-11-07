/**
 * Which resources a map hides. Every map shows the resources of its collection
 * unless its token settings list their key in `hiddenResources`; the player
 * window never reads this, it follows each resource's own player setting.
 *
 * The collection says which of the two bars every map had a new scene shows: its default
 * widgets `hpBar` and `stressBar`, which older versions of Atlas read too. Any further
 * resource shows on every scene until the scene hides it.
 */
import { HP_RESOURCE, STRESS_RESOURCE } from './resourceDefinitions';
import { tokenSettingsFromFile, tokenSettingsToFile } from './resourceFileFormat';
import type { ResourceDefinition } from './resourceTypes';

/** The default widgets that switch a bar on for new scenes, and the resource each stands for. */
const BAR_WIDGETS = [['hpBar', HP_RESOURCE.key], ['stressBar', STRESS_RESOURCE.key]] as const;

/** The hidden list after the GM switched `key` on or off in the scene's settings. */
export function toggleHidden(hidden: readonly string[] | undefined, key: string): string[] {
  const list = hidden ?? [];
  return list.includes(key) ? list.filter((other) => other !== key) : [...list, key];
}

/** The bar switches of a collection that defines `resources`: a bar is on when its resource is defined. */
export function barWidgets(resources: readonly ResourceDefinition[]): { hpBar: boolean; stressBar: boolean } {
  const has = (key: string): boolean => resources.some((resource) => resource.key === key);
  return { hpBar: has(HP_RESOURCE.key), stressBar: has(STRESS_RESOURCE.key) };
}

/**
 * `widgets` after the collection's resources changed from `before` to `after`: a bar whose
 * resource was added is on for new scenes, one whose resource went is off. A resource
 * that stays keeps the switch the collection had.
 */
export function withChangedBars(
  widgets: Record<string, boolean>,
  before: readonly ResourceDefinition[],
  after: readonly ResourceDefinition[],
): Record<string, boolean> {
  const [had, has] = [barWidgets(before), barWidgets(after)];
  const next = { ...widgets };
  for (const [widget] of BAR_WIDGETS) {
    if (had[widget] !== has[widget]) next[widget] = has[widget];
  }
  return next;
}

/**
 * The bars a save of a collection's rules shows on the scenes it already has, as a new scene
 * of the collection would (`defaultWidgets`, as saved). A bar whose resource just came: nobody
 * chose to hide a bar that had no resource. Stress also when the GM picked or reset the system
 * (`systemApplied`): files wrote the secondary bar off unless switched on, so a hidden one in a
 * scene cannot be told from a choice, and picking the system is the GM asking for its bars. A
 * hidden HP bar without such a change was the GM's own choice (it was on unless switched off).
 */
export function barsToShowOnScenes(
  defaultWidgets: Record<string, boolean>,
  before: readonly ResourceDefinition[],
  after: readonly ResourceDefinition[],
  systemApplied: boolean,
): string[] {
  const [had, has] = [barWidgets(before), barWidgets(after)];
  return BAR_WIDGETS
    .filter(([widget, key]) => has[widget] && defaultWidgets[widget] && (!had[widget] || (systemApplied && key === STRESS_RESOURCE.key)))
    .map(([, key]) => key);
}

/**
 * What a new scene hides of the two bars: those the collection's default widgets do not
 * switch on. A collection that never set its default widgets shows HP and hides the
 * secondary bar, as a new map always did.
 */
export function hiddenOnNewScenes(defaultWidgets: Record<string, boolean> | undefined): string[] {
  if (!defaultWidgets) return [STRESS_RESOURCE.key];
  return BAR_WIDGETS.filter(([widget]) => !defaultWidgets[widget]).map(([, key]) => key);
}

/** The keys in the hidden list of token settings as they are in memory. */
function hiddenKeys(settings: Record<string, unknown>): string[] {
  const listed: unknown[] = Array.isArray(settings.hiddenResources) ? settings.hiddenResources : [];
  return listed.filter((key): key is string => typeof key === 'string');
}

/** The token settings a new scene of the collection starts with, as its file holds them. */
export function newSceneTokenSettings(
  defaultWidgets: Record<string, boolean> | undefined,
  defaults: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return tokenSettingsToFile({ ...defaults, hiddenResources: hiddenOnNewScenes(defaultWidgets) });
}

/**
 * A scene file that shows the two bars as a new scene of its collection does, for a scene
 * that joins the collection; null when it already does, or when the collection never set
 * its default widgets. `defaults` completes the scene's token settings: a map file
 * replaces the store's as a whole.
 */
export function showNewSceneBarsInJson(
  content: string,
  defaultWidgets: Record<string, boolean> | undefined,
  defaults: Readonly<Record<string, unknown>>,
): string | null {
  if (!defaultWidgets) return null;
  const data = JSON.parse(content) as { state?: { tokenSettings?: Record<string, unknown> } } | null;
  if (!data?.state) return null;
  const settings = tokenSettingsFromFile(data.state.tokenSettings ?? {});
  const hiddenNow = hiddenKeys(settings);
  const wanted = hiddenOnNewScenes(defaultWidgets);
  const bars: readonly string[] = BAR_WIDGETS.map(([, key]) => key);
  const hidden = [...hiddenNow.filter((key) => !bars.includes(key)), ...wanted];
  if (data.state.tokenSettings && bars.every((key) => hiddenNow.includes(key) === wanted.includes(key))) return null;
  data.state.tokenSettings = tokenSettingsToFile({ ...defaults, ...settings, hiddenResources: hidden });
  return JSON.stringify(data, null, 2);
}

/**
 * A scene file that no longer hides the resources `keys`; null when it hides none of them.
 * `defaults` completes the scene's token settings: a map file replaces the store's as a whole.
 */
export function showResourcesInJson(content: string, keys: readonly string[], defaults: Readonly<Record<string, unknown>>): string | null {
  const data = JSON.parse(content) as { state?: { tokenSettings?: Record<string, unknown> } } | null;
  if (!data?.state?.tokenSettings) return null;
  const settings = tokenSettingsFromFile(data.state.tokenSettings);
  const hidden = hiddenKeys(settings);
  const kept = hidden.filter((key) => !keys.includes(key));
  if (kept.length === hidden.length) return null;
  data.state.tokenSettings = tokenSettingsToFile({ ...defaults, ...settings, hiddenResources: kept });
  return JSON.stringify(data, null, 2);
}
