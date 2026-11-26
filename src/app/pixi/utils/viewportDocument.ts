import type { Viewport } from 'pixi-viewport';
import { getDomHost } from '../../host/dom';

/** The document the map's canvas is in: a map open in a popout window, the player window among them, has its own. */
export function viewportDocument(viewport: Viewport): Document {
  return viewport.options?.events?.domElement?.ownerDocument ?? getDomHost().activeDocument();
}
