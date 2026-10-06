import { getLanguage } from 'obsidian';
import { installDomHost } from '../../host/dom';
import { setLocale } from '../../i18n';
import { pluginDomHost } from './dom';

installDomHost(pluginDomHost);
// Module-level labels must see the selected language before other plugin imports run.
setLocale(getLanguage());
