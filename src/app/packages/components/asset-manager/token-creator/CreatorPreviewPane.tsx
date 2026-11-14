import React, { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { cn } from '../../../../../utils/cn';
import { PreviewGrid } from './PreviewGrid';
import type { useTokenPreviews } from './useTokenPreviews';
import type { CreatorMode } from './types';
import { t } from '../../../../i18n';

interface CreatorPreviewPaneProps {
  mode: CreatorMode;
  previews: ReturnType<typeof useTokenPreviews>;
  /** Saving: the previews stay in view and take no input. */
  inert: boolean;
}

/** The creator's previews, or what to add while it holds none. */
export function CreatorPreviewPane({ mode, previews, inert }: CreatorPreviewPaneProps): React.JSX.Element {
  const [pane, setPane] = useState<HTMLDivElement | null>(null);
  const count = previews.previews.length;
  return (
    <div ref={setPane} className={cn('atlas-token-creator__previews', count === 0 && 'atlas-empty')} inert={inert}>
      {count === 0 ? (
        <div className="atlas-token-creator__empty">
          <div className="atlas-token-creator__empty-icon"><ImageIcon /></div>
          <h3>{t(`creator.${mode}.none`)}</h3>
          <p>{t('creator.emptyHint')}</p>
        </div>
      ) : (
        <PreviewGrid
          previews={previews.previews}
          mode={mode}
          scrollElement={pane}
          onChange={previews.update}
          onToggleSelected={previews.toggleSelected}
          onRemove={previews.remove}
        />
      )}
    </div>
  );
}
