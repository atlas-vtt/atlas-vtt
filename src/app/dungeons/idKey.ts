/** The i18n key segment of a stored id in kebab case (`no-secrets` → `noSecrets`, `long-table` → `longTable`). */
export function idKey(id: string): string {
  return id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
}
