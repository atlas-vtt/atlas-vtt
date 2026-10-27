import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { applyDungeonEdits, NO_EDITS, withWingHidden, type DungeonEdits } from '../../../dungeons/edits';
import { DEFAULT_DUNGEON_GENERATOR_SETTINGS, type DungeonGeneratorSettings } from '../../../dungeons/generatorSettings';
import { floorCount, requestedFloors, type DungeonModel, type DungeonRequest } from '../../../dungeons/model';
import { randomSeed } from '../../../dungeons/rng';
import { secretWingOf } from '../../../dungeons/secretWings';
import type { DungeonView } from '../../../dungeons/style';
import type { DungeonStyleId } from '../../../dungeons/styleCatalog';
import { SIZE_TAGS, withTag, type DungeonTag } from '../../../dungeons/tags';
import type { ThemeChoice } from '../../../dungeons/themes/themeTypes';
import { SettingsService } from '../../../services/SettingsService';

/** Everything the generator panel holds and how it changes. */
export interface DungeonState {
  request: DungeonRequest;
  /** What the scene will be called; the dungeon itself never depends on it. */
  name: string;
  settings: DungeonGeneratorSettings;
  edits: DungeonEdits;
  /** The generated dungeon of the current request, before the GM's edits; null until it arrived. */
  generated: DungeonModel | null;
  /** The dungeon as shown: the generated one with the GM's edits. */
  model: DungeonModel | null;
  /** How many floors the request gives the dungeon: one for a five-room dungeon. */
  floors: number;
  /** The floor the preview shows and exports draw, by index (0 the entry floor). */
  floor: number;
  /** Shows another floor; the dungeon stays as it is. */
  setFloor: (floor: number) => void;
  /** The floors stepper: another dungeon. */
  setFloors: (floors: number) => void;
  /** The theme choice: another dungeon on the same seed. */
  setTheme: (theme: ThemeChoice) => void;
  setBossRoom: (on: boolean) => void;
  setFiveRoom: (on: boolean) => void;
  setGenerated: (request: DungeonRequest, model: DungeonModel) => void;
  /** The Name field: names the scene, changes nothing of the dungeon. */
  setName: (name: string) => void;
  /** New layout: a new seed, everything else as it is. */
  newSeed: () => void;
  /** Switches a tag on or off (and the tags it rules out off): this seed with the tags as they are then. */
  toggleTag: (tag: DungeonTag) => void;
  /** Picks one of `among` (null: none of them), as a segmented choice does; the seed stays. */
  chooseTag: (among: readonly DungeonTag[], tag: DungeonTag | null) => void;
  setWaterLevel: (level: number | undefined) => void;
  setView: (changes: Partial<DungeonView>) => void;
  /** The look picked in the style gallery. */
  setStyle: (style: DungeonStyleId) => void;
  /** Hides the secret wing `room` of floor `floor` lies in (Hide room). */
  hideWing: (floor: number, room: number) => void;
  /** Shows every secret wing hidden by hand again. */
  showHiddenWings: () => void;
}

/** A dungeon always has a size in the wizard: medium where the tags name none. */
function sized(tags: readonly DungeonTag[]): DungeonTag[] {
  return tags.some((tag) => SIZE_TAGS.includes(tag)) ? [...tags] : withTag(tags, 'medium');
}

function readSettings(app: App): DungeonGeneratorSettings {
  return SettingsService.forApp(app)?.getDungeonGenerator() ?? DEFAULT_DUNGEON_GENERATOR_SETTINGS;
}

/** The floor shown: the one picked, or the deepest there is where the dungeon has fewer. */
function shownFloor(picked: number, request: DungeonRequest, model: DungeonModel | null): number {
  const count = Math.min(requestedFloors(request), model?.floors.length ?? Infinity);
  return Math.max(0, Math.min(picked, count - 1));
}


/**
 * The generator's state. Style, view, the theme and tags generated with, the floors and the boss
 * room and five-room switches are the GM's preferences and kept in Atlas' settings as they change; the
 * seed, the name and the edits belong to this one dungeon and go with the panel. A new seed,
 * theme, tags, floor count or switch is another dungeon: edits are dropped. The name only names the
 * scene, and the floor shown only which floor the preview and exports draw.
 */
export function useDungeonState(app: App, initialName = ''): DungeonState {
  const [settings, setSettings] = useState<DungeonGeneratorSettings>(() => readSettings(app));
  const [request, setRequest] = useState<DungeonRequest>(() => ({
    seed: randomSeed(), theme: settings.theme, tags: sized(settings.tags), floors: settings.floors, bossRoom: settings.bossRoom, fiveRoom: settings.fiveRoom,
  }));
  const [pickedFloor, setPickedFloor] = useState(0);
  const [name, setNameState] = useState(initialName.trim());
  const requestRef = useRef(request);
  requestRef.current = request;
  const [edits, setEdits] = useState<DungeonEdits>(NO_EDITS);
  const [generated, setGeneratedState] = useState<{ request: DungeonRequest; model: DungeonModel } | null>(null);
  // Ahead of the render, so changes made one after the other build on each other.
  const settingsRef = useRef(settings);

  const persist = useCallback((changes: Partial<DungeonGeneratorSettings>): void => {
    settingsRef.current = { ...settingsRef.current, ...changes };
    setSettings(settingsRef.current);
    SettingsService.forApp(app)?.setDungeonGenerator(changes);
  }, [app]);


  // A request is another dungeon: what was edited on the last one does not fit it.
  const changeRequest = useCallback((change: (current: DungeonRequest) => DungeonRequest): void => {
    const next = change(requestRef.current);
    // Leaving a field unchanged asks for the same dungeon, whose edits still fit
    if (next === requestRef.current) return;
    requestRef.current = next;
    setRequest(next);
    setEdits(NO_EDITS);
  }, []);

  const applyTags = useCallback((tags: DungeonTag[]): void => {
    changeRequest((current) => ({ ...current, tags }));
    persist({ tags });
  }, [changeRequest, persist]);

  // The settings may change elsewhere (another device, another generator): follow them.
  useEffect(() => SettingsService.forApp(app)?.onChange(() => {
    const next = readSettings(app);
    if (JSON.stringify(next) === JSON.stringify(settingsRef.current)) return;
    settingsRef.current = next;
    setSettings(next);
  }), [app]);

  const model = useMemo(() => {
    if (!generated || generated.request !== request) return null;
    return applyDungeonEdits(generated.model, edits);
  }, [generated, request, edits]);

  const floor = shownFloor(pickedFloor, request, model);

  return {
    request,
    name,
    settings,
    edits,
    generated: generated?.request === request ? generated.model : null,
    model,
    floors: requestedFloors(request),
    floor,
    setFloor: setPickedFloor,
    setFloors: useCallback((floors) => {
      changeRequest((current) => (current.floors === floors ? current : { ...current, floors: floorCount(floors) }));
      persist({ floors: floorCount(floors) });
    }, [changeRequest, persist]),
    setTheme: useCallback((theme) => {
      changeRequest((current) => (current.theme === theme ? current : { ...current, theme }));
      persist({ theme });
    }, [changeRequest, persist]),
    setBossRoom: useCallback((on) => {
      changeRequest((current) => (current.bossRoom === on ? current : { ...current, bossRoom: on }));
      persist({ bossRoom: on });
    }, [changeRequest, persist]),
    setFiveRoom: useCallback((on) => {
      changeRequest((current) => (current.fiveRoom === on ? current : { ...current, fiveRoom: on }));
      persist({ fiveRoom: on });
    }, [changeRequest, persist]),
    setGenerated: useCallback((asked, next) => setGeneratedState({ request: asked, model: next }), []),
    setName: setNameState,
    newSeed: useCallback(() => changeRequest((current) => ({ ...current, seed: randomSeed() })), [changeRequest]),
    toggleTag: useCallback((tag) => {
      const tags = requestRef.current.tags as DungeonTag[];
      applyTags(tags.includes(tag) ? tags.filter((t) => t !== tag) : withTag(tags, tag));
    }, [applyTags]),
    chooseTag: useCallback((among, tag) => {
      const others = (requestRef.current.tags as DungeonTag[]).filter((t) => !among.includes(t));
      applyTags(tag ? withTag(others, tag) : others);
    }, [applyTags]),
    setWaterLevel: useCallback((level) => setRequest((current) => {
      const { waterLevel: _old, ...rest } = current;
      return level === undefined ? rest : { ...rest, waterLevel: level };
    }), []),
    setView: useCallback((changes) => persist({ view: { ...settingsRef.current.view, ...changes } }), [persist]),
    setStyle: useCallback((style) => persist({ style }), [persist]),
    hideWing: useCallback((index, room) => {
      const rooms = generated?.model.floors[index]?.rooms;
      const wing = rooms ? secretWingOf(rooms, room) : null;
      if (wing !== null) setEdits((current) => withWingHidden(current, index, wing));
    }, [generated]),
    showHiddenWings: useCallback(() => setEdits(NO_EDITS), []),
  };
}
