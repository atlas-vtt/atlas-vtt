import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseButton } from '../packages/components/primitives/CloseButton';
import type { SettingsService } from '../services/SettingsService';
import { useAtlasSettings } from './useMapHotkeys';
import { availableHotkeys, DEFAULT_MAP_HOTKEYS, formatHotkey } from './mapHotkeys';
import { useDialogFocus } from '../onboarding/useDialogFocus';
import { t } from '../i18n';

export function HotkeyHelp({ settings: explicit, onClose, isPlayerView = false }: { settings?: SettingsService | undefined; onClose: () => void; isPlayerView?: boolean }): React.JSX.Element {
  const settings = useAtlasSettings(explicit);
  const bindings = settings?.getHotkeys() ?? DEFAULT_MAP_HOTKEYS;
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(ref, onClose);
  const actions = availableHotkeys(isPlayerView);
  return createPortal(<div className="atlas-vtt-plugin atlas-vtt-root atlas-hotkey-help" onClick={onClose}>
    <div ref={ref} className="atlas-hotkey-help-card" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e => e.stopPropagation()}>
      <div className="atlas-hotkey-help-header">
        <h2 id={titleId}>{t('hotkey.title')}</h2>
        <CloseButton onClick={onClose} aria-label={t('hotkey.close')} />
      </div>
      <p>{t('hotkey.intro')}</p>
      <div className="atlas-hotkey-help-list">
        {Array.from(new Set(actions.map(action => action.group))).map(group => <section key={group}>
          <h3>{group}</h3>
          <dl>{actions.filter(action => action.group === group).map(action => <div key={action.id}><dt>{action.label}</dt><dd><kbd>{formatHotkey(bindings[action.id])}</kbd></dd></div>)}</dl>
        </section>)}
        <section>
          <h3>{t('hotkey.navigation')}</h3>
          <dl>
            <div><dt>{t('hotkey.moveAlignment')}</dt><dd><kbd>{t('hotkey.arrowKeys')}</kbd></dd></div>
            <div><dt>{t('hotkey.fineAlignment')}</dt><dd><kbd>{t('hotkey.shiftArrows')}</kbd></dd></div>
            <div><dt>{t('hotkey.previewStatblock')}</dt><dd><kbd>Ctrl/Cmd</kbd> {t('hotkey.hover')}</dd></div>
            <div><dt>{t('hotkey.dragCopy')}</dt><dd><kbd>Alt/Option</kbd> {t('hotkey.drag')}</dd></div>
            <div><dt>{t('hotkey.openBoth')}</dt><dd><kbd>Shift + Enter</kbd></dd></div>
            <div><dt>{t('hotkey.waypoint')}</dt><dd><kbd>Space</kbd> {t('hotkey.whileDragging')}</dd></div>
            <div><dt>{t('hotkey.closeDialog')}</dt><dd><kbd>Escape</kbd></dd></div>
            <div><dt>{t('hotkey.navigateMenus')}</dt><dd><kbd>Tab</kbd> / <kbd>{t('hotkey.arrowKeys')}</kbd></dd></div>
          </dl>
        </section>
      </div>
    </div>
  </div>, document.body);
}
