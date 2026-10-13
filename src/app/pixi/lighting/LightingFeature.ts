import { dynamicLightingOn } from '../../experimental/experimentalFeatures';
import { LIGHTING_QUALITY, type LightingQualitySource } from '../../lighting/lightingQuality';
import { SettingsService } from '../../services/SettingsService';
import { requestRender } from '../RenderScheduler';
import type { TokenRenderer } from '../TokenRenderer';
import { LightingController, type LightingControllerDeps } from './LightingController';

/**
 * The lighting of one map view, which is there only while dynamic lighting is switched on (an
 * experimental feature, `dynamicLightingOn`): built when the GM switches it on, from the scene
 * as the store holds it, and taken off the open map when they switch it off. Without it the map
 * shows unlit, nothing is hidden by sight, and the lighting tool gives way to the move tool. The
 * scene keeps its walls, lights and lighting settings.
 */
export class LightingFeature {
  private current: LightingController | undefined;
  private tokens: TokenRenderer | undefined;
  private readonly cleanups: Array<() => void> = [];

  constructor(private readonly deps: LightingControllerDeps) {
    this.sync();
    const settings = SettingsService.forApp(deps.obsApp);
    if (settings) this.cleanups.push(settings.onChange(() => this.sync()));
    this.cleanups.push(deps.store.subscribe((state) => state.activeTool, () => this.leaveLightingTool(), { fireImmediately: true }));
  }

  /** The view's lighting, while the feature is on. */
  get controller(): LightingController | undefined {
    return this.current;
  }

  /** The token renderer whose pointer dispatch the lighting takes part in, now and whenever it is built anew. */
  wire(tokens: TokenRenderer): void {
    this.tokens = tokens;
    this.current?.wire(tokens);
  }

  private sync(): void {
    const on = dynamicLightingOn(this.deps.obsApp);
    if (on === !!this.current) return;
    if (on) {
      const quality = settingsQuality(SettingsService.forApp(this.deps.obsApp));
      this.current = new LightingController({ ...this.deps, ...(quality && { quality }) });
      if (this.tokens) this.current.wire(this.tokens);
    } else {
      this.current?.remove();
      this.current = undefined;
      this.deps.store.getState().setSceneLightingPanelOpen(false);
      this.leaveLightingTool();
    }
    requestRender(this.deps.app);
  }

  /** The lighting tool edits through the controller: without one it would take every press and do nothing. */
  private leaveLightingTool(): void {
    const { activeTool, setActiveTool } = this.deps.store.getState();
    if (!this.current && activeTool === 'wall') setActiveTool('move');
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.current?.destroy();
    this.current = undefined;
  }
}

/** The lighting quality chosen in Atlas' settings on this device, followed while the view lives. */
function settingsQuality(settings: SettingsService | undefined): LightingQualitySource | undefined {
  if (!settings) return undefined;
  return {
    current: () => LIGHTING_QUALITY[settings.getLightingQuality()],
    onChange: (listener) => settings.onChange(listener),
  };
}
