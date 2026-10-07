/** Removes a registration; calling it again does nothing. */
export type Disposer = () => void;

/** Names one open map view (`ViewInfo.viewId`); never reused once the view closed. */
export type ViewId = string;

export interface Point {
  x: number;
  y: number;
}

export type AtlasCapability =
  | 'views' | 'presentation' | 'rules' | 'lighting' | 'tokens' | 'dice'
  | 'lasers' | 'ui' | 'scenes' | 'bundles' | 'settings' | 'storage' | 'dice-looks' | 'scene-tabs'
  | 'asset-tabs' | 'collections' | 'dice-colours' | 'dice-look-choice';

export type { Json } from '../../app/types/json';
