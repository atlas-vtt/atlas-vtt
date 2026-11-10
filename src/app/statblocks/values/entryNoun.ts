/** "Action" for "Actions", "Ability" for "Abilities": what one entry of a list is called. */
export function singular(label: string): string {
  const trimmed = label.trim();
  if (/ies$/i.test(trimmed)) return `${trimmed.slice(0, -3)}y`;
  return /[^su]s$/i.test(trimmed) ? trimmed.slice(0, -1) : trimmed;
}
