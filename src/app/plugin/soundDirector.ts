import { setIcon, type Plugin } from 'obsidian';
import { t } from '../i18n';
import { AssetService } from '../services/AssetService';
import { MoodStore } from '../soundLibrary/MoodStore';
import { SoundDirector } from '../soundDirector/SoundDirector';
import { isPlaying } from '../soundDirector/tableSound';
import { whatPlays } from '../soundDirector/whatPlays';

const STATUS_REFRESH_MS = 5000;

/** Commands exist only while sound is switched on, and each mood is one: the palette is where a mood is searched for. */
function moodCommandId(moodId: string): string {
  return `sound-mood-${moodId}`;
}

function collectionsOf(assets: AssetService): Promise<string[]> {
  return assets.getCollections().then((collections) => collections.map((collection) => collection.id));
}

function registerMoodCommands(plugin: Plugin, director: SoundDirector, assets: AssetService): () => void {
  const moods = MoodStore.forApp(plugin.app);
  const added = new Map<string, string>();
  let collections: string[] = [];
  const sync = (): void => {
    const wanted = new Map<string, string>();
    if (director.isOn) {
      for (const collectionId of collections) {
        for (const mood of moods.moodsOf(collectionId)) {
          const name = t('audio.command.mood', { name: mood.name });
          wanted.set(mood.id, name);
          if (added.get(mood.id) === name) continue;
          plugin.addCommand({
            id: moodCommandId(mood.id),
            name,
            checkCallback: (checking) => {
              const current = moods.mood(collectionId, mood.id);
              if (!current || !director.isOn) return false;
              if (!checking) director.press(collectionId, current);
              return true;
            },
          });
          added.set(mood.id, name);
        }
      }
    }
    for (const id of [...added.keys()]) {
      if (wanted.has(id)) continue;
      plugin.removeCommand(moodCommandId(id));
      added.delete(id);
    }
  };
  const readCollections = async (): Promise<void> => {
    await assets.initialize();
    collections = await collectionsOf(assets);
    sync();
  };
  // The index is read only once sound is on, which is after the storage is ready.
  let wasOn = false;
  const followSwitch = (): void => {
    if (director.isOn === wasOn) return;
    wasOn = director.isOn;
    if (wasOn) void readCollections();
    else sync();
  };
  followSwitch();
  const refresh = plugin.app.workspace.on('atlas-vtt:refresh-assets', () => {
    if (wasOn) void readCollections();
  });
  const stopMoods = moods.onChange(sync);
  const stopDirector = director.subscribe(followSwitch);
  return () => {
    plugin.app.workspace.offref(refresh);
    stopMoods();
    stopDirector();
  };
}

function registerSoundCommands(plugin: Plugin, director: SoundDirector, assets: AssetService): void {
  plugin.addCommand({
    id: 'sound-next-mood',
    name: t('audio.command.next'),
    checkCallback: (checking) => {
      if (!director.isOn) return false;
      if (!checking) director.pressNext(assets.getDefaultCollectionId());
      return true;
    },
  });
  plugin.addCommand({
    id: 'sound-silence',
    name: t('audio.command.silence'),
    checkCallback: (checking) => {
      if (!director.isOn || !isPlaying(director.snapshot().mix.table, director.now())) return false;
      if (!checking) director.desk.toggleSilence();
      return true;
    },
  });
  plugin.addCommand({
    id: 'sound-stop',
    name: t('audio.command.stop'),
    checkCallback: (checking) => {
      if (!director.isOn || !isPlaying(director.snapshot().mix.table, director.now())) return false;
      if (!checking) director.stop();
      return true;
    },
  });
}

/** Shown only while something plays, so a GM without a map open still has the music in hand. */
function registerSoundStatusBar(plugin: Plugin, director: SoundDirector): () => void {
  const moods = MoodStore.forApp(plugin.app);
  const item = plugin.addStatusBarItem();
  item.addClass('atlas-sound-status');
  item.hide();
  const label = item.createSpan({ cls: 'atlas-sound-status__name' });
  const silence = item.createEl('button', { cls: 'atlas-sound-status__silence clickable-icon' });
  silence.addEventListener('click', () => director.desk.toggleSilence());
  let shownSilenced: boolean | null = null;
  const render = (): void => {
    const { mix } = director.snapshot();
    const now = director.now();
    const mood = mix.mood && moods.mood(mix.mood.collectionId, mix.mood.id);
    const name = isPlaying(mix.table, now) && (mix.table.music || mix.table.layers.length > 0) ? whatPlays(mix.table, mood ?? null, director.shelf, now) : null;
    if (name === null) {
      item.hide();
      return;
    }
    if (label.getText() !== name) label.setText(name);
    if (shownSilenced !== mix.table.silenced) {
      shownSilenced = mix.table.silenced;
      silence.empty();
      setIcon(silence, mix.table.silenced ? 'volume-2' : 'volume-x');
      silence.setAttribute('aria-label', mix.table.silenced ? t('audio.bringBack') : t('audio.silence'));
    }
    item.show();
  };
  render();
  // A list goes on through its tracks with nobody telling it to.
  plugin.registerInterval(window.setInterval(render, STATUS_REFRESH_MS));
  return director.subscribe(render);
}

/**
 * Opens the app's sound owner before the views, so every restored map view joins it. Its context and
 * copies exist only while sound is switched on; the palette commands work without a map. `onunload` releases it.
 */
export function registerSoundDirector(plugin: Plugin): SoundDirector {
  const { app } = plugin;
  const director = SoundDirector.forApp(app);
  const assets = AssetService.getInstance(app);
  registerSoundCommands(plugin, director, assets);
  plugin.register(registerMoodCommands(plugin, director, assets));
  plugin.register(registerSoundStatusBar(plugin, director));
  return director;
}
