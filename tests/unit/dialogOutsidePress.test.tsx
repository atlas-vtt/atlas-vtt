// @vitest-environment jsdom
import '../setup/obsidianDom';
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import type { SenseRow } from '../../src/app/lighting/tokenLighting';
import { isPressOutsideWindow } from '../../src/app/packages/components/asset-manager/utils/outsidePress';
import { SettingsDialog } from '../../src/app/react/components/collection-settings/SettingsDialog';
import { SensesEditor } from '../../src/app/react/components/senses/SensesEditor';

const senses = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!.rules.senses!;

function Dialog({ onClose }: { onClose: () => void }): React.ReactElement {
  const [rows, setRows] = useState<SenseRow[] | null>(null);
  return (
    <SettingsDialog title="Collection settings" closeLabel="Close" canSave={false} hasChanges={false} onSave={vi.fn()} onClose={onClose}>
      <p data-testid="elsewhere">Vision</p>
      <SensesEditor senses={rows} onChange={setRows} definitions={senses} unit="ft" emptyText="No senses beyond sight." />
    </SettingsDialog>
  );
}

afterEach(() => {
  cleanup();
  document.body.empty();
});

describe('a press inside a dialog', () => {
  it('closes a menu that is open in the dialog when it lands elsewhere in the dialog, and leaves the dialog open', async () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add sense' }), { key: 'ArrowDown' });
    expect(screen.queryByRole('menu')).not.toBeNull();
    // The menu listens on the document from the task after it opened, so the press that opened it is none outside it.
    await act(() => new Promise<void>((resolve) => { setTimeout(resolve, 0); }));

    fireEvent.pointerDown(screen.getByTestId('elsewhere'));

    expect(screen.queryByRole('menu')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('is no press outside the asset manager\'s window, for every dialog that opens over it', () => {
    const manager = document.body.createDiv({ cls: 'atlas-asset-manager-container' });
    const overlays = [
      'atlas-collection-settings-overlay', 'atlas-modal-overlay', 'atlas-tag-manager-modal', 'atlas-create-scene-modal',
      'atlas-create-collection-overlay', 'atlas-asset-manager-move-modal', 'atlas-uvtt-floors-overlay', 'atlas-paste-table-overlay',
      'atlas-share-host',
    ];
    for (const cls of overlays) {
      const overlay = document.body.createDiv({ cls: `atlas-vtt-root ${cls}` });
      const button = overlay.createDiv().createEl('button');
      expect(isPressOutsideWindow(overlay, manager), cls).toBe(false);
      expect(isPressOutsideWindow(button, manager), cls).toBe(false);
    }
    expect(isPressOutsideWindow(document.body.createDiv({ cls: 'atlas-map' }), manager)).toBe(true);
  });
});
