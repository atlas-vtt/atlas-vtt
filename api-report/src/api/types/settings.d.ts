export type AtlasSettingKey = 'laserPointer' | 'diceLook' | 'diceDisplay' | 'playerView';
export interface AtlasSettingsView {
    laserPointer: {
        color: string;
        size: number;
    };
    diceLook: {
        colour: string;
        font: string;
    };
    /** Atlas's own `DiceDisplay`. */
    diceDisplay: 'card' | 'fast' | 'full';
    /** The four `localPlayerView` rules a view an extension shows to players follows, as the player window does (`PLAYER_VIEW_RULE_KEYS`). */
    playerView: {
        showGrid: boolean;
        showTokenNameplates: boolean;
        showWidgets: boolean;
        showInitiative: boolean;
    };
}
export interface SettingsApi {
    /** Read-only; changes arrive as 'settings-changed'. */
    get<K extends AtlasSettingKey>(key: K): AtlasSettingsView[K];
}
export interface StorageApi {
    /**
     * `atlas-vtt/.atlas-data/extensions/<extension id>/`, created on first call; a dot folder Obsidian does not
     * index, kept with Atlas's own data. Rejects for an extension id that is not kebab-case.
     */
    folder(): Promise<string>;
}
