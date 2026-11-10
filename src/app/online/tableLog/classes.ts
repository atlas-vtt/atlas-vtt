/** Joins the class names that apply. */
export function classes(...names: readonly (string | false | null | undefined)[]): string {
  return names.filter((name) => typeof name === 'string' && name !== '').join(' ');
}
