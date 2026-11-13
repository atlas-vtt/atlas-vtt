import { setLayerVisibility, type HideableLayer, type LayerVisibility } from '../playerSafeFrame';

/**
 * Who sees what of the drawings and texts: the one place that says it.
 *
 * What only the GM sees lies in layers of its own (`gmLayers`): the annotations kept from the
 * players (`hidden`), drawn paler, the stroke under way of one, and the tool's own marks (the
 * eraser's ring, handles, hover). They show on the GM's view of the canvas and nowhere else: not
 * in a players' frame, not while the canvas shows the players' picture (session view, a peek),
 * and not in a picture of the scene. Everything else is the players' as it is the GM's, the
 * stroke under way of a drawing they will see included; fog and, for what lies on the map, the
 * lighting decide where they see it.
 */
export class AnnotationPlayersView {
  constructor(private readonly gmLayers: readonly HideableLayer[]) {}

  /** The canvas shows the players' picture (`players`), or the GM's again. */
  showOnCanvas(players: boolean): void {
    setLayerVisibility(this.gmLayers.map((layer) => ({ layer, visible: !players })));
  }

  /** What a players' frame changes for its one render. */
  playerViewLayers(): LayerVisibility[] {
    return this.gmLayers.map((layer) => ({ layer, visible: false }));
  }

  /** What a picture of the scene changes for its render: it is the GM's picture, without what the GM keeps from the players. */
  pictureLayers(): LayerVisibility[] {
    return this.playerViewLayers();
  }
}
