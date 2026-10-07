/** How a map shows its tokens (the map's token settings), saved in its file. */
export interface TokenSettings {
  showNameplates: boolean;
  /** Keys of the collection's resources this map does not show to the GM; see `resources/sceneVisibility.ts`. */
  hiddenResources: string[];
  showInstanceBadges: boolean;
  tokenRingSize: number;
}
