import { setIcon, type Plugin } from 'obsidian';
import { t } from '../i18n';
import { showSoundView } from '../sound-view';
import { MoodStore } from '../soundLibrary/MoodStore';
import { SoundLibrary } from '../soundLibrary/SoundLibrary';
import { SoundRecordStore } from '../soundLibrary/SoundRecordStore';
import { LinkedFolderWatch } from '../soundDirector/linkedFolderWatch';
import { SoundDirector } from '../soundDirector/SoundDirector';
import { isPlaying } from '../soundDirector/tableSound';
import { whatPlays } from '../soundDirector/whatPlays';
import { runInBackground } from '../utils/backgroundTask';

const STATUS_REFRESH_MS = 5000;

function moodCommandId(moodId: string): string {
  return `sound-mood-${moodId}`;
}

/** Commands exist only while sound is switched on, and each mood is one: the palette is where a mood is searched for. */
function registerMoodCommands(plugin: Plugin, director: SoundDirector): () => void {
  const moods = MoodStore.forApp(plugin.app);
  const added = new Map<string, string>();
  const sync = (): void => {
    const wanted = new Map<string, string>();
    if (director.isOn) {
      for (const mood of moods.moods()) {
        const name = t('audio.command.mood', { name: mood.name });
        wanted.set(mood.id, name);
        if (added.get(mood.id) === name) continue;
        plugin.addCommand({
          id: moodCommandId(mood.id),
          name,
          checkCallback: (checking) => {
            const current = moods.mood(mood.id);
            if (!current || !director.isOn) return false;
            if (!checking) director.press(current);
            return true;
          },
        });
        added.set(mood.id, name);
      }
    }
    for (const id of [...added.keys()]) {
      if (wanted.has(id)) continue;
      plugin.removeCommand(moodCommandId(id));
      added.delete(id);
    }
  };
  // The moods are read only once sound is on.
  let wasOn = false;
  const followSwitch = (): void => {
    if (director.isOn === wasOn) return;
    wasOn = director.isOn;
    sync();
  };
  followSwitch();
  const stopMoods = moods.onChange(sync);
  const stopDirector = director.subscribe(followSwitch);
  return () => {
    stopMoods();
    stopDirector();
  };
}

function registerSoundCommands(plugin: Plugin, director: SoundDirector): void {
  const playing = (): boolean => director.isOn && isPlaying(director.snapshot().mix.table, director.now());
  plugin.addCommand({
    id: 'sound-open-page',
    name: t('audio.command.openPage'),
    checkCallback: (checking) => {
      if (!director.isOn) return false;
      if (!checking) runInBackground(showSoundView(plugin.app), 'Opening the Sound page', t('audio.library.failed'));
      return true;
    },
  });
  plugin.addCommand({
    id: 'sound-next-mood',
    name: t('audio.command.next'),
    checkCallback: (checking) => {
      if (!director.isOn) return false;
      if (!checking) director.pressNext();
      return true;
    },
  });
  plugin.addCommand({
    id: 'sound-silence',
    name: t('audio.command.silence'),
    checkCallback: (checking) => {
      if (!playing()) return false;
      if (!checking) director.desk.toggleSilence();
      return true;
    },
  });
  plugin.addCommand({
    id: 'sound-stop',
    name: t('audio.command.stop'),
    checkCallback: (checking) => {
      if (!playing()) return false;
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
  const stopAll = item.createEl('button', { cls: 'atlas-sound-status__stop-all clickable-icon' });
  stopAll.addEventListener('click', () => director.desk.toggleSilence());
  let shownStopped: boolean | null = null;
  const render = (): void => {
    const { mix } = director.snapshot();
    const now = director.now();
    const mood = mix.mood && moods.mood(mix.mood.id);
    // Music held by Stop all is still what the table plays: Bring back stays at hand here.
    const table = mix.table.silenced && mix.paused ? { ...mix.table, music: mix.paused.play } : mix.table;
    const name = isPlaying(table, now) && (table.music || table.layers.length > 0) ? whatPlays(table, mood, director.shelf, now) : null;
    if (name === null) {
      item.hide();
      return;
    }
    if (label.getText() !== name) label.setText(name);
    if (shownStopped !== mix.table.silenced) {
      shownStopped = mix.table.silenced;
      stopAll.empty();
      setIcon(stopAll, mix.table.silenced ? 'play' : 'square');
      stopAll.setAttribute('aria-label', mix.table.silenced ? t('audio.bringBack') : t('audio.stopAll'));
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
  const director = SoundDirector.forApp(plugin.app);
  // Linked folders are prepared as they come, once the workspace is up, so a start is not held by a folder's walk.
  plugin.app.workspace.onLayoutReady(() => {
    const watch = new LinkedFolderWatch({ records: SoundRecordStore.forApp(plugin.app), library: SoundLibrary.forApp(plugin.app), director });
    plugin.register(() => watch.dispose());
  });
  registerSoundCommands(plugin, director);
  plugin.register(registerMoodCommands(plugin, director));
  plugin.register(registerSoundStatusBar(plugin, director));
  return director;
}
