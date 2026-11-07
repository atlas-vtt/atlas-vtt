import React from 'react';
import { Modal, type App } from 'obsidian';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { ChangelogContent } from './ChangelogContent';
import { RepositoryLink } from './RepositoryLink';
import type { ChangelogOptions } from './types';
import atlasIcon from '../../../.github/images/atlas-vtt-icon.webp?inline';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../ui/nativeModal';

/** The service targets the main window; Obsidian owns focus and Escape handling. */
export class ChangelogModal extends Modal {
  private root: Root | undefined;
  private rendered = false;

  constructor(app: App, private readonly options: ChangelogOptions) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.empty();
    this.titleEl.addClass('atlas-changelog-title');
    this.titleEl.createEl('img', {
      cls: 'atlas-changelog-icon',
      attr: { src: atlasIcon, alt: '', 'aria-hidden': 'true' },
    });
    this.titleEl.createSpan({ text: 'What’s new in Atlas' });
    this.titleEl.createSpan({ cls: 'atlas-changelog-version', text: this.options.currentVersion });
    const repositoryLinkHost = this.titleEl.createSpan({ cls: 'atlas-changelog-title-actions' });
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, 'atlas-changelog-modal');
    this.root = createRoot(this.contentEl);
    // One root renders the header link too, so both unmount together.
    this.root.render(<>
      {createPortal(<RepositoryLink />, repositoryLinkHost)}
      <ChangelogContent {...this.options} app={this.app}
        onCurrentRendered={() => { this.rendered = true; }} onClose={() => this.close()} />
    </>);
  }

  onClose(): void {
    this.root?.unmount();
    this.root = undefined;
    this.contentEl.empty();
    this.options.onClose(this.rendered);
  }
}
