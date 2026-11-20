/**
 * `ToggleSwitch` for panels built with the DOM: the same elements, classes and keys (the small size),
 * so `toggle.scss` styles both. A `disabled` switch keeps its place and its focus, and does not switch.
 */
export function createToggleSwitch(
  parent: HTMLElement,
  { value, labelledBy, onChange, disabled = false }: { value: boolean; labelledBy: string; onChange: (value: boolean) => void; disabled?: boolean },
): HTMLElement {
  const state = value ? 'on' : 'off';
  const toggle = parent.createDiv({
    cls: ['atlas-toggle', 'atlas-toggle--s', ...(disabled ? ['atlas-toggle--disabled'] : [])],
    attr: { role: 'switch', tabindex: '0', 'aria-checked': String(value), 'aria-labelledby': labelledBy, ...(disabled ? { 'aria-disabled': 'true' } : {}) },
  });
  toggle.createDiv({ cls: `atlas-toggle__switch atlas-toggle__switch--${state}` })
    .createDiv({ cls: `atlas-toggle__thumb atlas-toggle__thumb--${state}` });
  const flip = (): void => {
    if (!disabled) onChange(!value);
  };
  toggle.addEventListener('click', flip);
  toggle.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    flip();
  });
  return toggle;
}
