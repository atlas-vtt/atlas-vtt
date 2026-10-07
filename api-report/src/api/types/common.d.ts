/** Removes a registration; calling it again does nothing. */
export type Disposer = () => void;
/** Names one open map view (`ViewInfo.viewId`); never reused once the view closed. */
export type ViewId = string;
export interface Point {
    x: number;
    y: number;
}
export type AtlasCapability = 'views' | 'presentation' | 'rules' | 'lighting' | 'dice' | 'lasers' | 'settings' | 'storage';
