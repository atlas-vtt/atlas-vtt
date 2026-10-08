import '../setup/obsidianDom';
import React, { useState } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { DefaultWidgetsTab } from '../../src/app/react/components/collection-settings/DefaultWidgetsTab';
import { SettingsContent } from '../../src/app/react/components/collection-settings/SettingsContent';
import { DEFAULT_INITIATIVE_RULES, savedInitiativeRules } from '../../src/app/gameSystems/initiativeRules';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';

const THEME = `body { margin: 0; font: 13px/1.5 sans-serif; --background-primary: #1e1e1e;
  --background-secondary: #262626; --background-modifier-border: #363636; --background-modifier-form-field: #262626;
  --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #888; --interactive-accent: #7f6df2;
  --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --font-ui-smaller: 12px; --font-ui-small: 13px; }`;
const h = React.createElement;

function Dialog({ save }: { save: (rules: InitiativeRules) => void }): React.ReactElement {
  const [rules, setRules] = useState<InitiativeRules>({ ...DEFAULT_INITIATIVE_RULES });
  return h('div', { className: 'atlas-vtt-plugin' },
    h('div', { className: 'atlas-collection-settings-modal' },
      h('div', { className: 'atlas-collection-settings-header' }, h('h3', null, 'Collection Settings')),
      h('div', { className: 'atlas-collection-settings-body' },
        h('div', { className: 'atlas-collection-settings-sidebar' }, 'Default Widgets'),
        h(SettingsContent, null, h(DefaultWidgetsTab, { defaultWidgets: {}, onChange: () => {}, initiative: rules, onInitiativeChange: setRules }))),
      h('div', { className: 'atlas-collection-settings-footer' }, h('button', { onClick: () => save(savedInitiativeRules(rules)) }, 'Save'))));
}

afterEach(() => {
  cleanup();
  document.querySelector('[data-initiative-test-style]')?.remove();
});

describe('the statblock modifier field in collection settings', () => {
  it('is visible and editable in the styled Default Widgets tab, and saves or clears a custom field', async () => {
    await page.viewport(760, 860);
    const style = document.createElement('style');
    style.setAttribute('data-initiative-test-style', '');
    style.textContent = THEME + css;
    document.head.append(style);
    let saved: InitiativeRules | undefined;
    render(h(Dialog, { save: (rules) => { saved = rules; } }));

    const field = page.getByRole('textbox', { name: 'Statblock Modifier Field' });
    const input = field.element() as HTMLInputElement;
    const box = input.getBoundingClientRect();
    const content = document.querySelector('.atlas-collection-settings-content')!.getBoundingClientRect();
    expect(box.top).toBeGreaterThanOrEqual(content.top);
    expect(box.bottom).toBeLessThanOrEqual(content.bottom);
    expect(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)).toBe(input);
    await userEvent.fill(field, 'combat.initiative');
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    expect(saved?.modifierField).toBe('combat.initiative');
    await userEvent.fill(field, '');
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    expect(saved).toEqual(DEFAULT_INITIATIVE_RULES);
    await page.screenshot();
  });
});
