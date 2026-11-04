import { getFrontMatterInfo, TFile, type App } from 'obsidian';

/** Obsidian's comments (`%% … %%`) and HTML comments: the GM's own words, never shown in reading view. */
const COMMENTS = /%%[\s\S]*?(?:%%|$)|<!--[\s\S]*?(?:-->|$)/g;

/** A note's text as Markdown, without its frontmatter and without the comments the GM wrote for themselves. */
export function questBody(content: string): string {
  return withoutComments(content.slice(getFrontMatterInfo(content).contentStart));
}

/** Markdown without the comments the GM wrote for themselves, trimmed. */
export function withoutComments(text: string): string {
  return text.replace(COMMENTS, '').trim();
}

/** The text of the quest note at `path`, as `questBody` gives it; null when the note is gone. */
export async function readQuestBody(app: App, path: string): Promise<string | null> {
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile ? questBody(await app.vault.cachedRead(file)) : null;
}
