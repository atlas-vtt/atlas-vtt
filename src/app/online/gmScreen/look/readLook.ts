import { LOOK_COLOURS, type LookColour, type LookMessage } from '../../protocol/index.ts';
import { travellingColour } from './lookColour.ts';

/**
 * The look of `doc` as a device takes it: dark or light, and every colour of `LOOK_COLOURS` its body defines, as the
 * browser resolves it there, so a theme's `var()` chains, mixes and `hsl()` arrive as one plain colour each, with the
 * body's classes (the scheme, Atlas's look, a picked accent) and the accent Obsidian writes on it. Each colour is
 * read through a mix of itself in sRGB, which the browser computes to one sRGB form whatever the colour's own
 * (`oklch`, `lab`, a mix), on a hidden probe (`look-probe.scss`). A value that is no colour is left out. Null where the body defines none.
 */
export function readLook(doc: Document): LookMessage | null {
  const view = doc.defaultView;
  if (view === null) return null;
  const { body } = doc;
  const declared = view.getComputedStyle(body);
  const defined = LOOK_COLOURS.filter((name) => view.CSS.supports('color', declared.getPropertyValue(name).trim()));
  const holder = body.createDiv();
  holder.hide();
  const probes = defined.map((name) => {
    const probe = holder.createSpan({ cls: 'atlas-look-probe' });
    probe.setCssProps({ '--atlas-look-probe': `var(${name})` });
    return [name, probe] as const;
  });
  const colours: Partial<Record<LookColour, string>> = {};
  for (const [name, probe] of probes) {
    const colour = travellingColour(view.getComputedStyle(probe).backgroundColor);
    if (colour !== null) colours[name] = colour;
  }
  holder.remove();
  if (Object.keys(colours).length === 0) return null;
  return { t: 'look', dark: body.hasClass('theme-dark'), colours };
}
