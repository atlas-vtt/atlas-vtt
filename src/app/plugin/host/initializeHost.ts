import { getLanguage, Platform } from 'obsidian';
import { installDomHost } from '../../host/dom';
import { setLocale, setPlatformSource, setPointerSource } from '../../i18n';
import { TRANSLATIONS } from '../../i18n/languages';
import { isDesktopApp } from '../../platform/desktopOnly';
import { deviceProfile } from '../../platform/deviceProfile';
import { setCtrlClickIsSecondary } from '../../pixi/utils/pointerButtons';
import { setResourcePathPrefix } from '../../utils/pathUtils';
import { pluginDomHost } from './dom';

installDomHost(pluginDomHost);
setCtrlClickIsSecondary(Platform.isMacOS);
setResourcePathPrefix(Platform.resourcePathPrefix);
// Module-level labels must see the selected language before other plugin imports run.
setLocale(getLanguage(), TRANSLATIONS);
// Texts that name what a mouse does have a second wording for a finger (`tPointer`).
setPointerSource(() => deviceProfile().pointer === 'coarse');
// Texts that name the player window have a second wording for Obsidian mobile, which has none (`tPlatform`).
setPlatformSource(() => !isDesktopApp());
