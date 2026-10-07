import type { App } from 'obsidian';
import type AtlasVTTPlugin from '../../main';
import type { SettingsService } from '../app/services/SettingsService';
import type { SightFramesByView } from './sightFramesByView';
import type { ViewTracker } from './viewTracker';

/** What the facades need of Atlas. One per published API; later groups add their trackers here. */
export interface ApiServices {
  app: App;
  plugin: AtlasVTTPlugin;
  views: ViewTracker;
  settings: SettingsService;
  /** One `SightFrames` per open view, shared by every extension; disposed when the view closes and when the API stops. */
  sightFrames: SightFramesByView;
}
