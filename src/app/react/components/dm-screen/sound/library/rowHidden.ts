import { t } from '../../../../../i18n';
import { isCut } from '../CutTooltip';

/**
 * What a row's name line hides: the name where its line cuts it, and the tag beside it where that did not fit and was
 * dropped (it wraps onto the line's hidden second line), so neither goes without a trace. Null where all shows.
 */
export function rowHidden(title: HTMLElement): string | null {
  const tag = title.parentElement?.querySelector<HTMLElement>('.atlas-sound-lib__where');
  const dropped = tag !== null && tag !== undefined && tag.offsetTop > title.offsetTop;
  if (!dropped) return isCut(title) ? title.textContent : null;
  return t('audio.library.nameWithTag', { name: title.textContent ?? '', tag: tag.textContent ?? '' });
}
