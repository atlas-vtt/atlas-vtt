import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { rulesOfPreset } from '../../src/app/gameSystems/systemRules';
import { SystemTab } from '../../src/app/react/components/collection-settings/SystemTab';
import { SystemPresetService } from '../../src/app/services/SystemPresetService';
import type { SystemRules } from '../../src/app/types/systemPresetTypes';
import { memoryPresets } from '../mocks/memoryPresets';

const [daggerheart, dnd5e] = BUILT_IN_SYSTEM_PRESETS;

/** The tab with the collection draft the settings modal keeps around it. */
function Harness({ service, initial }: { service: SystemPresetService; initial: SystemRules }): React.ReactElement {
  const [rules, setRules] = useState(initial);
  const [presetId, setPresetId] = useState<string | undefined>(undefined);
  return (
    <>
      <SystemTab
        service={service}
        presets={service.list()}
        rules={rules}
        presetId={presetId}
        onApplyPreset={(preset) => { setRules(rulesOfPreset(preset)); setPresetId(preset.id); }}
        onPresetIdChange={setPresetId}
        onDeletePreset={async (preset) => { service.delete(preset.id); }}
      />
      <button type="button" onClick={() => setRules({ ...rules, conditions: rules.conditions.slice(1) })}>Edit rules</button>
      <output data-testid="preset-id">{presetId ?? ''}</output>
    </>
  );
}

function radio(name: string): HTMLElement {
  return screen.getByRole('radio', { name: new RegExp(`^${name}`) });
}

afterEach(cleanup);

describe('SystemTab', () => {
  it('shows custom rules as their own entry and applies a preset when it is chosen', () => {
    const service = new SystemPresetService(memoryPresets());
    render(<Harness service={service} initial={{ gridDefaults: structuredClone(dnd5e!.rules.gridDefaults), conditions: [] }} />);

    expect(radio('Custom').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(radio('Daggerheart'));

    expect(radio('Daggerheart').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('radio', { name: /^Custom/ })).toBeNull();
    expect(screen.getByTestId('preset-id').textContent).toBe(daggerheart!.id);
  });

  it('marks an edited preset and resets it', () => {
    const service = new SystemPresetService(memoryPresets());
    render(<Harness service={service} initial={structuredClone(dnd5e!.rules)} />);
    fireEvent.click(radio('D&D 5e'));
    fireEvent.click(screen.getByText('Edit rules'));

    expect(screen.getByText('Edited')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to D&D 5e' }));
    expect(screen.queryByText('Edited')).toBeNull();
  });

  it('saves the current rules as a new preset and selects it', () => {
    const service = new SystemPresetService(memoryPresets());
    render(<Harness service={service} initial={structuredClone(daggerheart!.rules)} />);

    fireEvent.click(screen.getByRole('button', { name: /Save as Preset/ }));
    const input = screen.getByPlaceholderText('Preset name');
    fireEvent.change(input, { target: { value: 'Daggerheart' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe('A preset with this name already exists');

    fireEvent.change(input, { target: { value: 'Homebrew' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const saved = service.list().find((preset) => preset.name === 'Homebrew');
    expect(saved?.rules.conditions).toHaveLength(4);
    expect(screen.getByTestId('preset-id').textContent).toBe(saved?.id);
  });
});
