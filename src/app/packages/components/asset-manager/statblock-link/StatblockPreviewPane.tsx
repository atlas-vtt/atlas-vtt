import React, { useMemo } from 'react';
import type { App } from 'obsidian';
import { FileText, ScrollText } from 'lucide-react';
import { LinkedStatblock } from '../../../../statblocks/render/LinkedStatblock';
import type { TokenVitals } from '../../../../services/statblockVitalsSync';
import { t } from '../../../../i18n';

/** The token being linked, whose art the statblock shows once linked. */
export interface StatblockPreviewToken {
  name: string;
  imagePath?: string | undefined;
  showRing?: boolean | undefined;
}

interface StatblockPreviewPaneProps {
  app: App;
  /** Vault path of the statblock note to show, or null for none. */
  path: string | null;
  token: StatblockPreviewToken;
}

/**
 * The selected creature's statblock as the token's hover preview will show it
 * once linked: the same card, with the token's portrait in place of the note's image.
 */
export function StatblockPreviewPane({ app, path, token }: StatblockPreviewPaneProps): React.JSX.Element {
  const { name, imagePath, showRing } = token;
  // Art only: without hit points the statblock keeps its own values.
  const tokens = useMemo((): TokenVitals[] => (imagePath ? [{ name, imagePath, showRing }] : []), [name, imagePath, showRing]);

  return (
    <div className="atlas-statblock-link__preview">
      {path ? (
        <>
          <div className="atlas-statblock-link__preview-path">
            <FileText aria-hidden />
            <span>{path}</span>
          </div>
          {/* Keyed by note, so every statblock opens scrolled to its top. */}
          <LinkedStatblock key={path} app={app} path={path} variant="hover" tokens={tokens} />
        </>
      ) : (
        <div className="atlas-statblock-link__placeholder">
          <ScrollText aria-hidden />
          <span>{t('am.link.selectCreature')}</span>
        </div>
      )}
    </div>
  );
}
