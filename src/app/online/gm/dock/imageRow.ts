import { textButton } from './controls.ts';
import { t } from '../../../i18n';

export interface ImageRowActions {
  /** Takes the shown image away from every player. */
  hideImage(): void;
}

/**
 * Under a surface's header while players are shown an image over the map: the line that says so, with
 * the way to take it away. The GM does not see the players' screens, and Atlas's own dismiss command
 * is easy to miss.
 */
export function renderImageRow(layer: HTMLElement, shown: boolean, actions: ImageRowActions): void {
  if (!shown) return;
  const row = layer.createDiv({ cls: 'atlas-online-image-row', attr: { role: 'status' } });
  row.createSpan({ cls: 'atlas-online-image-row__text', text: t('online.imageShown') });
  textButton(row, t('online.hide'), () => actions.hideImage()).dataset.focusKey = 'hide-image';
}
