import type { App } from 'obsidian';
import type { SettingsService } from 'src/app/services/SettingsService';
import type { AtlasSettingSection } from 'src/app/settings/settingSections';
import { CalendarService } from '../calendar/CalendarService';
import { addDateField } from '../ui/dateSetting';
import { DATE_BAR_POSITIONS, updateWorldSettings, worldSettingsOf, type DateBarMode, type DateBarPosition, type WorldSettings } from '../worldSettings';

/** Settings: calendar, default date, ghosts, rumours, event notes. */
export function worldSettingsSection(app: App, settingsService: SettingsService): AtlasSettingSection {
  const world = (): WorldSettings => worldSettingsOf(settingsService);
  const calendars = CalendarService.forApp(app);
  return {
    heading: 'World time',
    rows: [
      {
        name: 'Calendar file',
        desc: 'Vault path of the JSON file with the calendar definitions.',
        aliases: ['calendar', 'arcivalian', 'date'],
        render: (setting) => {
          const problem = calendars.loadProblem();
          if (problem) setting.setDesc(problem);
          setting.addText((text) => text
            .setPlaceholder('File path')
            .setValue(world().calendarPath)
            .onChange((calendarPath) => updateWorldSettings(settingsService, { calendarPath })));
        },
      },
      {
        name: 'Calendar',
        desc: 'Calendar dates are shown in. Stored dates always use the file\'s default calendar years.',
        render: (setting) => {
          setting.addDropdown((dropdown) => {
            dropdown.addOption('', 'File default');
            for (const calendar of calendars.calendars()) dropdown.addOption(calendar.id, calendar.name);
            dropdown.setValue(world().calendarId).onChange((calendarId) => updateWorldSettings(settingsService, { calendarId }));
          });
        },
      },
      {
        name: 'Year label',
        desc: 'Written after every year, e.g. "eO" or "AD". Empty: the label the calendar file gives.',
        aliases: ['era', 'year name', 'reckoning'],
        render: (setting) => {
          setting.addText((text) => text
            .setPlaceholder(calendarFileLabel(calendars, 'after'))
            .setValue(world().yearLabel)
            .onChange((yearLabel) => updateWorldSettings(settingsService, { yearLabel })));
        },
      },
      {
        name: 'Year label before year 0',
        desc: 'Written after years before year 0, e.g. "fO" or "BC". Empty: the label the calendar file gives.',
        aliases: ['era', 'year name'],
        render: (setting) => {
          setting.addText((text) => text
            .setPlaceholder(calendarFileLabel(calendars, 'before'))
            .setValue(world().yearLabelBefore)
            .onChange((yearLabelBefore) => updateWorldSettings(settingsService, { yearLabelBefore })));
        },
      },
      {
        name: 'Default viewing date',
        desc: 'Used by scenes that have no viewing date of their own. Empty: such scenes show all times.',
        aliases: ['time slider', 'viewing date'],
        render: (setting) => {
          addDateField(setting, calendars.calendar(), world().defaultViewingDate || undefined, (date) => {
            updateWorldSettings(settingsService, { defaultViewingDate: date ?? '' });
          }, 'none');
        },
      },
      {
        name: 'Show objects from other times faintly',
        desc: 'The GM sees pins, tokens, texts and drawings outside the viewing date as ghosts. Players never do.',
        aliases: ['ghost'],
        render: (setting) => {
          setting.addToggle((toggle) => toggle.setValue(world().showGhosted).onChange((showGhosted) => updateWorldSettings(settingsService, { showGhosted })));
        },
      },
      {
        name: 'Rumour window (years)',
        desc: 'Events stay on the map as grey rumour markers this long after they ended. 0 turns rumours off.',
        render: (setting) => {
          setting.addText((text) => {
            text.inputEl.type = 'number';
            text.inputEl.min = '0';
            text.setValue(String(world().rumourYears)).onChange((value) => {
              const rumourYears = Number(value);
              if (Number.isFinite(rumourYears) && rumourYears >= 0) updateWorldSettings(settingsService, { rumourYears });
            });
          });
        },
      },
      {
        name: 'Event notes folder',
        desc: 'Where "Log world event" creates notes.',
        render: (setting) => {
          setting.addText((text) => text
            .setPlaceholder('Folder path')
            .setValue(world().eventsFolder)
            .onChange((eventsFolder) => updateWorldSettings(settingsService, { eventsFolder })));
        },
      },
      {
        name: 'Show the date bar',
        desc: "The world date bar on the map. Also switched from the map's More options menu.",
        aliases: ['timeline', 'time slider'],
        render: (setting) => {
          setting.addToggle((toggle) => toggle
            .setValue(world().showDateBar)
            .onChange((showDateBar) => updateWorldSettings(settingsService, { showDateBar })));
        },
      },
      {
        name: 'Date bar position',
        desc: 'The edge of the map the date bar sits on.',
        render: (setting) => {
          setting.addDropdown((dropdown) => dropdown
            .addOptions(Object.fromEntries(DATE_BAR_POSITIONS.map(({ position, label }) => [position, label])))
            .setValue(world().dateBarPosition)
            .onChange((dateBarPosition) => updateWorldSettings(settingsService, { dateBarPosition: dateBarPosition as DateBarPosition })));
        },
      },
      {
        name: 'Date bar',
        desc: 'Show the date bar in every scene, or only in scenes that have dates.',
        render: (setting) => {
          setting.addDropdown((dropdown) => dropdown
            .addOptions({ always: 'Every scene', 'dated-scenes': 'Scenes with dates' })
            .setValue(world().dateBar)
            .onChange((dateBar) => updateWorldSettings(settingsService, { dateBar: dateBar as DateBarMode })));
        },
      },
    ],
  };
}

/** The label the calendar file itself gives, shown as the placeholder of the year label fields. */
function calendarFileLabel(calendars: CalendarService, side: 'after' | 'before'): string {
  const own = calendars.calendars().find((calendar) => calendar.id === calendars.calendar().id) ?? calendars.calendar();
  return (side === 'after' ? own.eraAfter : own.eraBefore) || 'None';
}
