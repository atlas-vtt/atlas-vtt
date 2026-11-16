import { getLanguage, Platform } from 'obsidian';
import { installDomHost } from '../../host/dom';
import { setLocale } from '../../i18n';
import { TRANSLATIONS } from '../../i18n/languages';
import { setCtrlClickIsSecondary } from '../../pixi/utils/pointerButtons';
import { pluginDomHost } from './dom';

installDomHost(pluginDomHost);
setCtrlClickIsSecondary(Platform.isMacOS);
// Module-level labels must see the selected language before other plugin imports run.
setLocale(getLanguage(), TRANSLATIONS);
