import { useMemo } from 'react';
import type { App } from 'obsidian';
import { TemplateLibrary } from '../../library/TemplateLibrary';
import { useTemplateLibrary } from '../../library/useTemplateLibrary';
import { AUTO_TEMPLATE_ID, autoTemplate } from '../../model/autoTemplate';
import type { LibraryTemplate } from '../../model/resolvedTypes';
import type { StatblockTemplate, TemplateId } from '../../model/templateTypes';
import type { FieldRecord } from '../../values/fieldValues';

/** How the pane draws a native statblock: its template, a newer Atlas' (read-only), or the auto template while it is missing. */
export type PaneTemplate =
  | { status: 'loading' }
  | { status: 'ok' | 'newer'; entry: LibraryTemplate; template: StatblockTemplate; name: string }
  | { status: 'missing'; template: StatblockTemplate; name: string };

/**
 * The template a native statblock names, from the app's library (§8.7), kept
 * current as the library changes. While the library still reads the vault
 * a missing template is not missing yet.
 */
export function usePaneTemplate(app: App, templateId: TemplateId | null, record: FieldRecord): PaneTemplate {
  const library = useTemplateLibrary(app);
  // Read again whenever the library's snapshot changes, which a saved template does too.
  const entry = useMemo(
    () => (templateId === null || library === null ? null : TemplateLibrary.forApp(app).get(templateId)),
    [app, library, templateId],
  );
  const missingTemplate = useMemo(() => (entry ? null : autoTemplate(record)), [entry, record]);
  if (entry) return { status: entry.status, entry, template: entry.template, name: entry.name };
  if (library === null || library.loading) return { status: 'loading' };
  return { status: 'missing', template: missingTemplate ?? autoTemplate(record), name: AUTO_TEMPLATE_ID };
}
