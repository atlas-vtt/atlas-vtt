/** Where the player window looks: the world point at its centre and the zoom of the GM's screen. */
export interface PlayerCameraState {
  centerX: number;
  centerY: number;
  scale: number;
  /**
   * The world rectangle the camera frames, around its centre. A camera without it frames what
   * the GM's screen shows at `scale`, whatever size that screen has.
   */
  width?: number;
  height?: number;
}

/** A frame the GM saved on a scene for the players (TrueScale's saved frames): a camera that names the world rectangle it frames. */
export type SavedPlayerFrame = Required<PlayerCameraState>;
