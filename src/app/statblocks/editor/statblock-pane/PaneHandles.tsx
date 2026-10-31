import React, { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { StatblockTemplate } from '../../model/templateTypes';
import { GutterHandle } from '../interaction/GutterHandle';
import { HoverStore } from '../interaction/hoverStore';
import { SurfaceLayer } from '../interaction/SurfaceLayer';
import { useSurfaceHover } from '../interaction/useSurfaceHover';
import { usePaneEdit } from './paneEditContext';
import { usePaneItemDrag } from './usePaneItemDrag';
import { t } from '../../../i18n';
import '../interaction/interaction.scss';

export interface PaneHandlesProps {
  /** The pane's root: the card is found in it, and the layer hangs from the panel around it. */
  paneRef: RefObject<HTMLElement | null>;
  template: StatblockTemplate;
}

const CARD = '.atlas-sb-pane-card';
const HINT_MS = 4000;

/**
 * The grip beside the pointed-at ability (spec §7.2): drag it to move the
 * ability within its list. A statblock is filled in, not built, so nothing
 * else on the card has a handle or a menu: its shape is its template's,
 * changed in the template editor. The grip floats in a layer outside the
 * scroller and never takes focus, so a value being typed keeps its input
 * through a press on it.
 */
export function PaneHandles({ paneRef, template }: PaneHandlesProps): React.JSX.Element {
  const pane = usePaneEdit();
  const [store] = useState(() => new HoverStore());
  const cardRef = useRef<HTMLElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // After the commit: the pane's root takes its ref after its children's layout effects run.
  useEffect(() => {
    const root = paneRef.current;
    cardRef.current = root?.querySelector<HTMLElement>(CARD) ?? null;
    setHost(root?.closest<HTMLElement>('.atlas-sb-note-panel') ?? root ?? null);
  }, [paneRef]);

  useSurfaceHover(cardRef, store, { items: true, enabled: pane.writable });

  const showHint = useCallback((text: string): void => setHint(text), []);
  const press = usePaneItemDrag({ pane, template, hint: showHint });

  useEffect(() => {
    if (!hint) return undefined;
    const win = cardRef.current?.win ?? window;
    const timer = win.setTimeout(() => setHint(null), HINT_MS);
    return () => win.clearTimeout(timer);
  }, [hint]);

  return (
    <SurfaceLayer host={host}>
      {(layer) => (
        <>
          <GutterHandle
            store={store}
            layer={layer}
            glyphOf={(target) => (target.kind === 'item' ? 'grip' : null)}
            labelOf={() => t('statblockEditor.dragToReorder')}
            onPress={(target, event) => press(target, event.currentTarget, event.nativeEvent)}
          />
          {hint && <div className="atlas-sb-drag-hint" role="note">{hint}</div>}
        </>
      )}
    </SurfaceLayer>
  );
}
