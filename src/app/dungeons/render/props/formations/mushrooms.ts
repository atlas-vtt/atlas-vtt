import { cutPlantForm } from '../../engraved/growth';
import { emptyForm, type Cap, type PlantForm } from '../../growth/forms';
import { fungi } from '../../growth/floorPlants';
import type { GlyphPen } from '../../glyphPen';
import type { GlyphFit } from '../../propShapes';
import { isDarkColour } from '../../stone/colours';
import { paintPlantForm } from '../../stone/growth';
import { darkFloorLine } from '../livedIn/parts';
import { rngFrom } from '../../../rng';

/**
 * A patch of cave mushrooms: knee-high clusters of caps on one cell of floor, grown by the
 * vegetation's own fungus (`fungi`) and painted or cut as the vegetation is, so a grove's patches
 * and the fungi of an overgrown room are one family. Never a giant: the largest cap is a sixth of a
 * cell across. Its caps are laid out once, in the piece's own frame.
 */

/** How high a patch stands, as a share of a column's shadow. */
export const MUSHROOM_LIFT = 0.12;

/** The most caps a patch keeps: each is a domed, lit ellipse, and a patch must cost no more than the props it stands among. */
const MOST_CAPS = 6;

/** The patch's caps in the piece's own cells: the largest of three clusters, the largest cluster towards the back. */
const MUSHROOM_CAPS: readonly Cap[] = (() => {
  const form = emptyForm('fungus', MUSHROOM_LIFT);
  const rng = rngFrom(0x5eed);
  for (const [x, y, size] of [[-0.17, 0.12, 0.32], [0.2, -0.1, 0.27], [0.06, 0.28, 0.2]] as const) fungi(form, rng, { x, y }, size);
  const kept = new Set([...form.caps].sort((a, b) => b.radius - a.radius).slice(0, MOST_CAPS));
  return form.caps.filter((cap) => kept.has(cap));
})();

/** The caps as a shadow's outline, in the piece's own frame. */
export function mushroomsSilhouette(path: CanvasPath): void {
  for (const cap of MUSHROOM_CAPS) {
    path.moveTo(cap.x + Math.cos(cap.angle) * cap.radius * cap.stretch, cap.y + Math.sin(cap.angle) * cap.radius * cap.stretch);
    path.ellipse(cap.x, cap.y, cap.radius * cap.stretch, cap.radius, cap.angle, 0, Math.PI * 2);
  }
}

/**
 * The patch turned into the map's frame, so its caps are lit from the map's one light: each cap
 * where the piece's turn carries it, the context turned back.
 */
function turned(pen: GlyphPen): PlantForm {
  const { rotation } = pen;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const form = emptyForm('fungus', MUSHROOM_LIFT);
  form.caps.push(...MUSHROOM_CAPS.map(cap => ({ ...cap, x: cap.x * cos - cap.y * sin, y: cap.x * sin + cap.y * cos, angle: cap.angle + rotation })));
  pen.ctx.rotate(-rotation);
  return form;
}

/**
 * Every cap's rim inked as a piece's outline is, so a patch reads on any floor as the formations
 * round it do: on a dark floor in the look's own pale line, as a cap's deep shade would sink into it.
 */
function inkRims(pen: GlyphPen): void {
  const { ctx } = pen;
  const { palette } = pen.hand.scene.env;
  ctx.save();
  ctx.beginPath();
  mushroomsSilhouette(ctx);
  if (isDarkColour(palette.floor)) ctx.strokeStyle = darkFloorLine(pen);
  ctx.lineWidth = pen.fine * 1.4;
  ctx.stroke();
  ctx.restore();
}

export function mushroomsStone(pen: GlyphPen, _fit: GlyphFit): void {
  pen.ctx.save();
  paintPlantForm(pen.hand.scene, turned(pen));
  pen.ctx.restore();
  inkRims(pen);
}

export function mushroomsEngraved(pen: GlyphPen, _fit: GlyphFit): void {
  pen.ctx.save();
  cutPlantForm(pen.hand.scene, turned(pen));
  pen.ctx.restore();
  inkRims(pen);
}
