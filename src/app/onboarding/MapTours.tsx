import React, { useContext } from 'react';
import { Tutorial, type TutorialStep } from './Tutorial';
import { useAtlasSettings, useHotkeyLabels } from '../keyboard/useMapHotkeys';
import type { MapHotkeyId } from '../keyboard/mapHotkeys';
import { useAtlasStore } from '../react/ViewStoreContext';
import type { SettingsService } from '../services/SettingsService';
import { t, tPointer } from '../i18n';
import { isOnScreen, useWatched } from './useWatched';
import { WelcomeWizard, shouldWelcome } from './WelcomeWizard';
import { AtlasUIContext } from '../react/root/AtlasUIContext';

/** Online play's controls, added to the map by its own code once a table can be started or is running. */
const ONLINE_DOCK = '.atlas-online-dock';
const TABLE_LOG = '.atlas-online-log-tab';

interface MapToursProps {
  root: HTMLElement | null;
  settings?: SettingsService | undefined;
}

/**
 * The GM's first-run tours of a map view: the welcome wizard when a map is the first thing of Atlas the GM sees, the
 * map itself the first time a scene is loaded, then
 * online play's dock and table log the first time each appears. One at a time, only while the view
 * is on screen and nothing of its own stands over the map.
 */
export function MapTours({ root, settings: explicit }: MapToursProps): React.JSX.Element | null {
  const settings = useAtlasSettings(explicit);
  const app = useContext(AtlasUIContext)?.app;
  const key = useHotkeyLabels();
  const busy = useAtlasStore(s => s.isMapLoading || s.isHotkeyHelpOpen || s.isCommandPaletteOpen || s.isDMScreenOpen
    || s.isAssetManagerOpen || s.isToolbarEditing || !s.mapLoaded);
  const shown = useWatched(root, isOnScreen);
  const hasDock = useWatched(root, hasDockIn);
  const hasLog = useWatched(root, hasLogIn);
  if (!settings || busy || !shown) return null;
  // The wizard stays in the tree after it is done, in the same place, so it closes with its motion.
  return (
    <>
      {app && <WelcomeWizard app={app} settings={settings} doc={root?.ownerDocument} />}
      {!(app && shouldWelcome(settings)) && <MapTour settings={settings} root={root} keyLabel={key} hasDock={hasDock} hasLog={hasLog} />}
    </>
  );
}

interface MapTourProps {
  settings: SettingsService;
  root: HTMLElement | null;
  keyLabel: (id: MapHotkeyId) => string;
  hasDock: boolean;
  hasLog: boolean;
}

/** The first of the map's tours this GM has not taken yet, if any. */
function MapTour({ settings, root, keyLabel: key, hasDock, hasLog }: MapTourProps): React.JSX.Element | null {
  if (settings.shouldShowTutorial('map')) {
    const trackpad = settings.getNavigationSettings().inputMode === 'trackpad';
    return <Tutorial settings={settings} id="map" root={root} label={t('tour.map.label')} steps={mapSteps(key, trackpad)} />;
  }
  if (hasDock && settings.shouldShowTutorial('online')) {
    return <Tutorial settings={settings} id="online" root={root} label={t('tour.online.label')} steps={[
      { title: t('tour.online.dockTitle'), body: t('tour.online.dockBody'), selector: ONLINE_DOCK },
    ]} />;
  }
  if (hasLog && settings.shouldShowTutorial('tableLog')) {
    return <Tutorial settings={settings} id="tableLog" root={root} label={t('tour.online.label')} steps={[
      { title: t('tour.online.logTitle'), body: t('tour.online.logBody'), selector: TABLE_LOG, keys: [key('diceLog')] },
    ]} />;
  }
  return null;
}

/** The map tour, in the order the eye meets things: the map, the top, the toolbar left to right, then help. */
export function mapSteps(key: (id: MapHotkeyId) => string, trackpad: boolean): TutorialStep[] {
  return [
    { title: t('tour.map.welcomeTitle'), body: tPointer(trackpad ? 'tour.map.welcomeTrackpad' : 'tour.map.welcomeMouse') },
    { title: t('tour.map.tabsTitle'), body: t('tour.map.tabsBody'), selector: '.atlas-scene-tab-bar', keys: [key('sceneSwitcher')] },
    { title: t('tour.map.toolsTitle'), body: tPointer('tour.map.toolsBody'), selector: '.atlas-main-toolbar' },
    { title: t('tour.map.gmViewTitle'), body: t('tour.map.gmViewBody'), selector: '.atlas-main-toolbar .atlas-toolbar-end', keys: [key('gmView')] },
    { title: t('tour.map.assetsTitle'), body: t('tour.map.assetsBody'), selector: '[data-toolbar-item="assets"]', keys: [key('assets')] },
    { title: t('tour.map.paletteTitle'), body: t('tour.map.paletteBody'), selector: '[data-toolbar-item="palette"]', keys: [key('palette'), key('dashboard')] },
    { title: t('tour.map.helpTitle'), body: t('tour.map.helpBody'), selector: '.atlas-hotkey-help-bar', keys: [key('help')] },
  ];
}

function hasDockIn(root: HTMLElement): boolean {
  return root.querySelector(ONLINE_DOCK) !== null;
}

function hasLogIn(root: HTMLElement): boolean {
  return root.querySelector(TABLE_LOG) !== null;
}
