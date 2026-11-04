import type { ResourceDefinition } from '../../resources/resourceTypes';
import React, { useEffect, useRef } from 'react';
import { setIcon } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { t } from '../../i18n';

interface DestructiveActionRowProps {
  /** The tokens the row acts on, in one undo step. */
  tokenIds: string[];
  store: StoreApi<ViewAtlasState>;
  /** One of them has a resource that defeats it when spent. */
  canKill: boolean;
  definitions: readonly ResourceDefinition[];
  onClose: () => void;
}

function IconSpan({ name }: { name: string }): React.ReactElement {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.replaceChildren();
      setIcon(ref.current, name);
    }
  }, [name]);
  return <span ref={ref} className="atlas-ctx-icon" />;
}

export function DestructiveActionRow({ tokenIds, store, canKill, definitions, onClose }: DestructiveActionRowProps): React.ReactElement {
  return (
    <div className="atlas-ctx-destructive-row">
      {canKill && (
        <div
          role="menuitem"
          tabIndex={0}
          className="atlas-ctx-destructive-btn"
          onClick={(e) => {
            e.stopPropagation();
            store.getState().killTokens(tokenIds, definitions);
            onClose();
          }}
        >
          <IconSpan name="skull" />
          <span>{t('token.kill')}</span>
        </div>
      )}
      <div
        role="menuitem"
        tabIndex={0}
        className="atlas-ctx-destructive-btn"
        onClick={(e) => {
          e.stopPropagation();
          store.getState().deleteTokens(tokenIds);
          onClose();
        }}
      >
        <IconSpan name="trash" />
        <span>{t('common.delete')}</span>
      </div>
    </div>
  );
}
