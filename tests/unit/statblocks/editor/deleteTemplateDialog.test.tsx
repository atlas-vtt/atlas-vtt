// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import React from 'react';
import { expect, it } from 'vitest';
import { DeleteTemplateDialog } from '../../../../src/app/statblocks/editor/template-editor/DeleteTemplateDialog';
function dialog(lostButtons: readonly string[]): void {
  render(
    <DeleteTemplateDialog
      anchor={document.body}
      name="Marsh creature"
      templateId="marsh-creature-abc123"
      usage={{ notes: [], roles: [] }}
      templates={[]}
      lostButtons={lostButtons}
      onDelete={() => Promise.resolve()}
      onClose={() => undefined}
    />,
  );
}

it('says which recovery buttons go with the template', () => {
  dialog(['Short rest', 'Long rest']);
  expect(screen.getByText('The recovery actions Short rest and Long rest go with it.')).toBeTruthy();
});

it('says nothing of recovery where no button is lost', () => {
  dialog([]);
  expect(screen.queryByText(/recovery action/)).toBeNull();
});
