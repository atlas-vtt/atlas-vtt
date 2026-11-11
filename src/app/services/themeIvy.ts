/** The ivy drawings of the Atlas VTT theme (theme.css), defined only on its own panels. */
const THEME_IVY = ['--atlas-theme-ivy-corner-front', '--atlas-theme-ivy-corner-back'] as const;

/**
 * Gives `element` the Atlas VTT theme's ivy when that theme is active, for an `atlas-gilt-frame`
 * at or inside it: the theme defines its drawings only on the panels it decorates, so they are
 * read off a probe of one of those. Without the theme the frame has its border and no ivy.
 */
export function lendThemeIvy(element: HTMLElement): void {
  const doc = element.ownerDocument;
  const probe = doc.body.createDiv({ cls: 'atlas-asset-manager-modal' });
  probe.hide();
  const style = (doc.defaultView ?? window).getComputedStyle(probe);
  for (const name of THEME_IVY) {
    const drawing = style.getPropertyValue(name).trim();
    // Another theme lends none: what an earlier one lent goes
    if (drawing) element.style.setProperty(name, drawing);
    else element.style.removeProperty(name);
  }
  probe.remove();
}
