/**
 * Classes for the `modalEl` of every Obsidian `Modal` Atlas opens: its native close
 * control then looks and sits like Atlas' CloseButton (`atlas-native-modal-close-control`).
 */
export const ATLAS_NATIVE_MODAL_CLASSES = ['atlas-vtt-plugin', 'atlas-native-modal'] as const;

/**
 * For the `containerEl` of an Obsidian prompt Atlas opens from one of its own dialogs: Atlas'
 * dialog overlays lie far above Obsidian's modal layer, so the prompt is raised above them
 * (`styles/_native-prompts.scss`), or it would open behind the dialog it was opened from.
 */
export const ABOVE_ATLAS_DIALOGS = 'atlas-above-dialogs';
