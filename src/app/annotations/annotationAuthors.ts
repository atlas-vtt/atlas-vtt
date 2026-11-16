/**
 * Who made a drawing or a text, by name. A drawing records its maker by an id (`by`: an online
 * player's; unset is the GM); whoever knows the players' names says so here, and whoever shows a
 * drawing's maker asks. Nobody knows them while no table runs.
 */

type AuthorNames = (id: string) => string | null;

let names: AuthorNames | null = null;

/** Says who knows the makers' names from now on; null: nobody. Returns the function that takes this word back. */
export function nameAnnotationAuthors(lookup: AuthorNames | null): () => void {
  names = lookup;
  return (): void => {
    if (names === lookup) names = null;
  };
}

/** The name of the maker `id`, or null where nobody knows it. */
export function annotationAuthor(id: string | null): string | null {
  return id === null ? null : names?.(id) ?? null;
}
