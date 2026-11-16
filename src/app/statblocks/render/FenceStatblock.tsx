import React from 'react';
import { Pencil } from 'lucide-react';
import type { App } from 'obsidian';
import { Button } from '../../packages/components/primitives/button';
import { useExperimentalFeature } from '../../react/hooks/useExperimentalFeature';
import { SettingsService } from '../../services/SettingsService';
import { LinkedStatblock } from './LinkedStatblock';
import { useNativeTemplateId } from './useLinkedStatblock';
import { t } from '../../i18n';
import './statblock-fence.scss';

export interface FenceStatblockProps {
  app: App;
  /** The note the fence stands in. */
  path: string;
  /** Opens the statblock editor for the note; the plugin hands it in, so rendering never loads the editor. */
  onEdit?: ((path: string) => void) | undefined;
}

/**
 * What a note's `atlas-statblock` fence shows (D14): the note's statblock and,
 * above it for a native statblock while the statblock editor is switched on,
 * **Edit statblock**, which shows the statblock beside the note. While it
 * shows there, the fence shrinks to one line (note-panel/).
 */
export function FenceStatblock({ app, path, onEdit }: FenceStatblockProps): React.JSX.Element {
  const editorOn = useExperimentalFeature('statblockEditor', SettingsService.forApp(app));
  const native = useNativeTemplateId(app, path, undefined) !== null;
  return (
    <>
      {onEdit && editorOn && native && (
        <div className="atlas-vtt-plugin atlas-statblock-fence__bar">
          <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(path)}>
            <Pencil aria-hidden />
            {t('statblockEditor.editStatblock')}
          </Button>
        </div>
      )}
      <LinkedStatblock app={app} path={path} variant="full" />
    </>
  );
}
