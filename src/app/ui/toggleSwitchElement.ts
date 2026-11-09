/**
 * `ToggleSwitch` for panels built with the DOM: the same elements, classes and keys (the small size),
 * so `toggle.scss` styles both.
 */
export function createToggleSwitch(
  parent: HTMLElement,
  { value, labelledBy, onChange }: { value: boolean; labelledBy: string; onChange: (value: boolean) => void },
): HTMLElement {
  const state = value ? 'on' : 'off';
  const toggle = parent.createDiv({
    cls: 'atlas-toggle atlas-toggle--s',
    attr: { role: 'switch', tabindex: '0', 'aria-checked': String(value), 'aria-labelledby': labelledBy },
  });
  toggle.createDiv({ cls: `atlas-toggle__switch atlas-toggle__switch--${state}` })
    .createDiv({ cls: `atlas-toggle__thumb atlas-toggle__thumb--${state}` });
  toggle.addEventListener('click', () => onChange(!value));
  toggle.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onChange(!value);
  });
  return toggle;
}
