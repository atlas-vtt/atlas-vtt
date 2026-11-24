export interface ApiVersion {
  readonly major: number;
  readonly minor: number;
}

/** Takes back what a call added: the setting, the overlay. Calling it again, or after Atlas unloaded, does nothing. */
export type Remove = () => void;

/** Fills `el`, a row of Appearance settings, while the panel shows it; what it returns runs when the panel goes. */
export type SettingMount = (el: HTMLElement) => (() => void) | void;

/** A picture Atlas draws over every token's ring, sized by the ring and turned with the token's art. */
export interface TokenOverlay {
  /** The picture's URL; a data URL keeps it offline. */
  readonly image: string;
  /** The picture's width in ring diameters: 1 fits the ring, more reaches past it. */
  readonly span: number;
}

/** What Atlas VTT offers other plugins: `app.plugins.plugins['atlas-vtt'].api`. */
export interface AtlasApi {
  readonly apiVersion: ApiVersion;
  readonly atlasVersion: string;
  readonly appearance: {
    /** Adds a row to Appearance settings, beside the accent colour. */
    readonly addSetting: (mount: SettingMount) => Remove;
  };
  readonly tokens: {
    /** Draws `overlay` over every token on the map, in the player window too. */
    readonly addOverlay: (overlay: TokenOverlay) => Remove;
  };
}
