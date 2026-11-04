import type { TemplateSession } from '../../library/TemplateSession';

/**
 * What the template editor uses of a `TemplateSession`. Components take this
 * shape rather than the class, so a test drives them with a session of its own.
 * Saving is the view's (`TemplateEditorHost.save`): saving as a new template
 * moves the view to it.
 */
export type EditorSession = Pick<
  TemplateSession,
  'getSnapshot' | 'subscribe' | 'apply' | 'beginGesture' | 'endGesture' | 'abandonGesture' | 'undo' | 'redo' | 'resolveConflict' | 'setDraftBody'
>;

export type { SaveState, SessionSnapshot } from '../../library/TemplateSession';
