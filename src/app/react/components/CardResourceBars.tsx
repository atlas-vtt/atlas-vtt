import React, { useEffect, useRef } from 'react';
import type { ResourceDefinition, ResourceValue } from '../../resources/resourceTypes';
import { resourceColor } from '../../resources/resourceColors';
import { typedResourceUpdate } from '../../resources/typedResourceUpdate';
import { openResourceEditor, type ResourceEditor } from '../../pixi/tokenValueEditor';
import { useViewStoreHook } from '../ViewStoreContext';
import { t } from '../../i18n';

interface CardResourceBarsProps {
  tokenId: string;
  bars: readonly { definition: ResourceDefinition; value: ResourceValue }[];
}

/**
 * The bars of a card's resources, one thin bar each. A click opens the editor a bar on the map
 * opens (`openResourceEditor`), under the bar: what it takes there it takes here, and a typed value
 * changes the token as it does on the map, one undo step.
 */
export function CardResourceBars({ tokenId, bars }: CardResourceBarsProps): React.ReactElement {
  const store = useViewStoreHook();
  const editorRef = useRef<ResourceEditor | null>(null);
  useEffect(() => () => editorRef.current?.close(), []);

  const openEditor = (bar: HTMLElement, definition: ResourceDefinition, value: ResourceValue): void => {
    editorRef.current?.close();
    const { width, height } = bar.getBoundingClientRect();
    editorRef.current = openResourceEditor({
      anchorEl: bar,
      anchor: { x: width / 2, top: 0, bottom: height },
      value,
      resourceLabel: definition.name,
      onCommit: (next) => {
        const state = store.getState();
        const update = typedResourceUpdate(state.objects.tokens[tokenId], definition.key, next);
        if (update) state.updateToken(tokenId, update);
      },
      onClose: () => {
        editorRef.current = null;
      },
    });
  };

  return (
    <div className="atlas-initiative-card__resources">
      {bars.map(({ definition, value }) => (
        <button
          key={definition.key}
          type="button"
          className="atlas-initiative-card__hp-bar"
          aria-label={t('resource.edit', { label: definition.name })}
          onClick={(e) => {
            e.stopPropagation();
            openEditor(e.currentTarget, definition, value);
          }}
        >
          <span
            className="atlas-initiative-card__hp-meter"
            role="meter"
            aria-label={definition.name}
            aria-valuemin={0}
            aria-valuenow={value.current}
            aria-valuemax={value.max}
          >
            <span
              className="atlas-initiative-card__hp-fill"
              style={{ width: `${Math.max(0, Math.min(100, (value.current / value.max) * 100))}%`, '--atlas-resource-color': resourceColor(definition, value) } as React.CSSProperties}
            />
          </span>
        </button>
      ))}
    </div>
  );
}
