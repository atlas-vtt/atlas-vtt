import { GM_AUTHOR } from '../../protocol/index.ts';
import type { SpeakerOption } from '../../tableLog/index.ts';
import { selectedTokenIds, tokenLabel, type SceneState } from '../atlasView.ts';

/** The most tokens the GM's speaker menu lists: the selected ones always, the rest by name. */
const MAX_LISTED = 60;

/**
 * Whom the GM may speak as in the log: themselves, then the tokens of the shared scene, the
 * selected ones first, each with its portrait as the map draws it. The same list while the scene's
 * tokens and selection stay the same objects.
 */
export function gmSpeakerList(imageSrc: (path: string) => string): (state: SceneState) => readonly SpeakerOption[] {
  let last: { readonly tokens: unknown; readonly selected: unknown; readonly list: readonly SpeakerOption[] } | null = null;
  return (state) => {
    const selected = (state as { readonly selectedIds?: unknown }).selectedIds;
    const { tokens } = state.objects;
    if (last !== null && last.tokens === tokens && last.selected === selected) return last.list;
    const chosen = selectedTokenIds(state);
    const rest = Object.values(tokens).filter((token) => !chosen.includes(token.id)).sort((a, b) => tokenLabel(a).localeCompare(tokenLabel(b)));
    const listed = [...chosen.flatMap((id) => tokens[id] ?? []), ...rest].slice(0, Math.max(MAX_LISTED, chosen.length));
    const list: SpeakerOption[] = [
      { key: GM_AUTHOR, name: 'GM', kind: 'self', portrait: null },
      ...listed.map((token): SpeakerOption => ({
        key: token.id,
        name: tokenLabel(token),
        kind: 'token',
        portrait: token.imagePath === undefined || token.imagePath === '' ? null : { src: imageSrc(token.imagePath), showRing: token.showRing === true, ...(token.ringColor !== undefined && { ringColor: token.ringColor }) },
      })),
    ];
    last = { tokens, selected, list };
    return list;
  };
}
