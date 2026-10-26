import { type Setting, type ToggleComponent } from 'obsidian';
import { availableHotkeys, DEFAULT_MAP_HOTKEYS, formatHotkey, hotkeyAction, hotkeyFromEvent } from '../keyboard/mapHotkeys';
import type { HotkeyOrigin } from '../keyboard/hotkeyOverrides';
import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingRow, AtlasSettingSection } from './settingSections';
import type { ButtonComponent } from 'obsidian';
import { TUTORIAL_IDS } from '../services/SettingsService';
import { t } from '../i18n';
import { showNotice } from '../ui/notice';

type HotkeyAction = ReturnType<typeof availableHotkeys>[number];

function notifyFailure(error: unknown, fallback: string): void {
  showNotice(error instanceof Error ? error.message : fallback);
}

/** The action's group, plus its default once changed or why it lost its default. */
function describeHotkey(descEl: HTMLElement, action: HotkeyAction, origin: HotkeyOrigin): void {
  const defaultKey = formatHotkey(DEFAULT_MAP_HOTKEYS[action.id]);
  descEl.setText(origin.kind === 'custom' ? t('settings.hotkeys.defaultSuffix', { group: action.group, key: defaultKey }) : action.group);
  if (origin.kind === 'displaced') {
    descEl.createDiv({ cls: 'atlas-hotkey-warning', text: t('settings.hotkeys.displaced', { key: defaultKey, action: hotkeyAction(origin.by).label }) });
  }
}

/** Map shortcut recorder rows plus the "reset all" row. Every row follows the settings, since one binding can change another. */
export function hotkeySettingsSection(settings: SettingsService): AtlasSettingSection {
  const hotkeyRow = (action: HotkeyAction): AtlasSettingRow => ({
    name: action.label,
    desc: action.group,
    aliases: ['hotkey', 'shortcut'],
    render: (setting: Setting) => {
      let input: HTMLInputElement | undefined;
      let restoreEl: HTMLElement | undefined;
      const sync = (): void => {
        const origin = settings.getHotkeyOrigin(action.id);
        if (input) input.value = formatHotkey(settings.getHotkeys()[action.id]);
        describeHotkey(setting.descEl, action, origin);
        if (origin.kind === 'default') restoreEl?.hide(); else restoreEl?.show();
      };

      setting.addText(text => {
        input = text.inputEl;
        const recorder = text.inputEl;
        recorder.readOnly = true;
        recorder.classList.add('atlas-hotkey-recorder');
        recorder.setAttribute('aria-label', t('settings.hotkeys.shortcutFor', { action: action.label }));
        recorder.addEventListener('focus', () => { recorder.value = t('settings.hotkeys.pressKey'); });
        recorder.addEventListener('blur', sync);
        recorder.addEventListener('keydown', event => {
          event.preventDefault(); event.stopPropagation();
          if (event.key === 'Escape') { recorder.blur(); return; }
          if (event.repeat) return;
          const binding = hotkeyFromEvent(event);
          if (!binding) return;
          try { settings.setHotkey(action.id, binding); recorder.blur(); }
          catch (error) { notifyFailure(error, t('settings.hotkeys.assignFailed')); }
        });
      });
      setting.addExtraButton(button => button.setIcon('x').setTooltip(t('settings.hotkeys.clear')).onClick(() => {
        settings.setHotkey(action.id, '');
      }));
      setting.addExtraButton(button => {
        restoreEl = button.extraSettingsEl;
        button.setIcon('reset').setTooltip(t('settings.hotkeys.restore')).onClick(() => {
          try { settings.setHotkey(action.id, DEFAULT_MAP_HOTKEYS[action.id]); }
          catch (error) { notifyFailure(error, t('settings.hotkeys.restoreFailed')); }
        });
      });

      sync();
      return settings.onChange(sync);
    },
  });

  return {
    heading: t('settings.hotkeys.heading'),
    rows: [
      {
        name: t('settings.hotkeys.intro'),
        desc: t('settings.hotkeys.introDesc'),
        aliases: ['hotkey', 'shortcut', 'reset'],
        render: (setting) => {
          setting.addButton(button => button.setButtonText(t('settings.hotkeys.resetAll')).onClick(() => settings.resetHotkeys()));
        },
      },
      ...availableHotkeys().map(hotkeyRow),
    ],
  };
}

/** How far the user is through the tutorials, for the Reset row. */
function tutorialProgress(settings: SettingsService): string {
  const finished = settings.finishedTutorialCount();
  if (finished === 0) return t('settings.tutorials.firstTime');
  return t('settings.tutorials.progress', { finished, total: TUTORIAL_IDS.length });
}

/**
 * Tutorials: whether they show at all, and resetting the ones the user
 * finished or skipped. A tutorial finished, skipped or dismissed with Escape
 * never shows again until it is reset here.
 */
export function onboardingSettingsSection(settings: SettingsService): AtlasSettingSection {
  let tutorialToggle: ToggleComponent | undefined;
  return {
    heading: t('settings.tutorials.heading'),
    rows: [
      {
        name: t('settings.tutorials.show'),
        desc: t('settings.tutorials.showDesc'),
        aliases: ['onboarding', 'walkthrough', 'tour'],
        render: (setting) => {
          setting.addToggle(toggle => {
            tutorialToggle = toggle;
            toggle.setValue(settings.getSetting('onboarding').enabled).onChange(enabled => {
              settings.setSetting('onboarding', { ...settings.getSetting('onboarding'), enabled });
            });
          });
        },
      },
      {
        name: t('settings.tutorials.reset'),
        desc: t('settings.tutorials.resetDesc'),
        aliases: ['onboarding', 'walkthrough', 'tour', 'replay'],
        render: (setting) => {
          let button: ButtonComponent | undefined;
          setting.addButton(component => {
            button = component;
            component.setButtonText(t('settings.tutorials.reset')).onClick(() => {
              settings.resetTutorials();
              tutorialToggle?.setValue(true);
              showNotice(t('settings.tutorials.resetDone'));
            });
          });
          const sync = (): void => {
            setting.setDesc(tutorialProgress(settings));
            button?.setDisabled(settings.finishedTutorialCount() === 0);
          };
          sync();
          return settings.onChange(sync);
        },
      },
    ],
  };
}
