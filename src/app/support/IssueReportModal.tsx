import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Modal, Setting, type App } from 'obsidian';
import { Select, type SelectOption } from '../packages/components/primitives/Select';
import { runInBackground } from '../utils/backgroundTask';
import { formatDiagnostics, type IssueDiagnostics } from './diagnostics';
import { formatErrors, type LoggedError } from './errorLog';
import { ISSUE_AREAS, ISSUE_TYPES, type IssueArea, type IssueType } from './issueCategories';
import { formatReportMarkdown, issueForm, type IssueForm, type IssueReport } from './issueReport';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../ui/nativeModal';
import { t } from '../i18n';
import { showNotice } from '../ui/notice';

export interface IssueReportPreset {
  type?: IssueType;
  area?: IssueArea;
}

export interface IssueReportModalOptions {
  preset: IssueReportPreset;
  diagnostics: IssueDiagnostics;
  errors: LoggedError[];
  openExternal: (url: string) => void;
  copyText: (text: string) => Promise<void>;
  submitReport: (report: IssueReport, requestId: string) => Promise<{ number: number; url: string }>;
}

const TYPE_LABEL_ID = 'atlas-issue-report-type-label';
const AREA_LABEL_ID = 'atlas-issue-report-area-label';

function selectOptions<T extends string>(labels: Record<T, string>): SelectOption<T>[] {
  return (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));
}

/** Submits a report in Obsidian and keeps the draft until the service confirms creation. */
export class IssueReportModal extends Modal {
  private type: IssueType;
  private area: IssueArea;
  private submitting = false;
  private submission: { body: string; id: string } | undefined;
  private submitButton: HTMLButtonElement | undefined;
  private statusEl: HTMLElement | undefined;
  private title = '';
  private description = '';
  private steps = '';
  private includePlugins = true;
  private includeErrors: boolean;
  private descriptionSetting: Setting | undefined;
  private stepsSetting: Setting | undefined;
  private environmentEl: HTMLElement | undefined;
  private typeRoot: Root | undefined;
  private areaRoot: Root | undefined;

  constructor(app: App, private readonly options: IssueReportModalOptions) {
    super(app);
    this.type = options.preset.type ?? 'bug';
    this.area = options.preset.area ?? 'unknown';
    this.includeErrors = options.errors.length > 0;
  }

  onOpen(): void {
    this.setTitle(this.wording.title);
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, 'atlas-issue-report-modal');
    this.contentEl.createEl('p', {
      cls: 'atlas-issue-report-intro',
      text: t('issue.intro'),
    });
    this.renderChoices();
    this.renderText();
    this.renderIncludes();
    this.renderEnvironment();
    this.renderActions();
  }

  onClose(): void {
    this.clearContent();
  }

  private clearContent(): void {
    this.typeRoot?.unmount();
    this.areaRoot?.unmount();
    this.typeRoot = this.areaRoot = undefined;
    this.contentEl.empty();
  }

  private get form(): IssueForm {
    return issueForm(this.type);
  }

  /** The form's wording in Atlas' language; the report itself keeps the English headings of the GitHub forms. */
  private get wording(): { title: string; description: { label: string; hint: string }; steps: { label: string; hint: string } } {
    const kind = this.type === 'feature' ? 'feature' : 'bug';
    return {
      title: t(`issue.${kind}.title`),
      description: { label: t(`issue.${kind}.descriptionLabel`), hint: t(`issue.${kind}.descriptionHint`) },
      steps: { label: t(`issue.${kind}.stepsLabel`), hint: t(`issue.${kind}.stepsHint`) },
    };
  }

  private renderChoices(): void {
    const choices = this.contentEl.createDiv({ cls: 'atlas-issue-report-choices' });
    this.typeRoot = createRoot(this.choiceField(choices, t('issue.typeLabel'), TYPE_LABEL_ID));
    this.areaRoot = createRoot(this.choiceField(choices, t('issue.areaLabel'), AREA_LABEL_ID));
    this.renderSelects();
  }

  /** A labelled field whose name element carries `id` so the select can reference it. */
  private choiceField(container: HTMLElement, name: string, id: string): HTMLElement {
    const setting = new Setting(container).setName(name).setClass('atlas-issue-report-field');
    setting.nameEl.id = id;
    return setting.controlEl;
  }

  /** Both selects are controlled from the modal's state, so every change re-renders them. */
  private renderSelects(): void {
    this.typeRoot?.render(<Select labelledBy={TYPE_LABEL_ID} value={this.type} options={selectOptions(ISSUE_TYPES).map(option => ({ ...option, label: t(`issue.type.${option.value}`) }))} onChange={value => {
      this.type = value;
      this.applyWording();
      this.renderSelects();
    }} />);
    this.areaRoot?.render(<Select labelledBy={AREA_LABEL_ID} value={this.area} options={selectOptions(ISSUE_AREAS).map(option => ({ ...option, label: t(`issue.area.${option.value}`) }))} onChange={value => {
      this.area = value;
      this.renderSelects();
    }} />);
  }

  private renderText(): void {
    const { description, steps } = this.wording;
    new Setting(this.contentEl).setName(t('issue.titleLabel')).setClass('atlas-issue-report-field').addText(text => {
      text.setPlaceholder(t('issue.titlePlaceholder')).onChange(value => { this.title = value; });
      text.inputEl.setAttribute('maxlength', '120');
    });
    this.descriptionSetting = new Setting(this.contentEl).setName(description.label).setDesc(description.hint)
      .setClass('atlas-issue-report-field').addTextArea(area => {
        area.onChange(value => { this.description = value; });
        area.inputEl.rows = 6;
      });
    this.stepsSetting = new Setting(this.contentEl).setName(steps.label).setDesc(steps.hint)
      .setClass('atlas-issue-report-field').addTextArea(area => {
        area.onChange(value => { this.steps = value; });
        area.inputEl.rows = 5;
      });
  }

  private renderIncludes(): void {
    new Setting(this.contentEl)
      .setName(t('issue.plugins'))
      .setDesc(t('issue.pluginsDesc'))
      .addToggle(toggle => toggle.setValue(this.includePlugins).onChange(value => {
        this.includePlugins = value;
        this.renderEnvironmentText();
      }));
    const count = this.options.errors.length;
    new Setting(this.contentEl)
      .setName(t('issue.errors'))
      .setDesc(count ? t('issue.errorsDesc', { count }) : t('issue.noErrors'))
      .addToggle(toggle => toggle.setValue(this.includeErrors).setDisabled(count === 0).onChange(value => { this.includeErrors = value; }));
  }

  private renderEnvironment(): void {
    const details = this.contentEl.createEl('details', { cls: 'atlas-issue-report-environment' });
    details.createEl('summary', { text: t('issue.environment') });
    this.environmentEl = details.createEl('pre');
    this.renderEnvironmentText();
  }

  private renderEnvironmentText(): void {
    this.environmentEl?.setText(this.environment());
  }

  private renderActions(): void {
    // The status sits above the actions so the buttons stay flush with the dialog's bottom edge.
    this.statusEl = this.contentEl.createEl('p', { cls: 'atlas-issue-report-status' });
    this.statusEl.setAttribute('role', 'alert');
    const actions = this.contentEl.createDiv({ cls: 'atlas-issue-report-actions' });
    new Setting(actions)
      .addButton(button => button.setButtonText(t('issue.copy'))
        .onClick(() => runInBackground(this.copyReport(), 'Copying the issue report', t('issue.clipboardFailed'))))
      .addButton(button => {
        this.submitButton = button.buttonEl;
        button.setButtonText(t('issue.submit')).setCta()
          .onClick(() => { void this.submit(); });
      });
  }

  private applyWording(): void {
    const { title, ...wording } = this.wording;
    this.setTitle(title);
    this.descriptionSetting?.setName(wording.description.label).setDesc(wording.description.hint);
    this.stepsSetting?.setName(wording.steps.label).setDesc(wording.steps.hint);
  }

  private environment(): string {
    return formatDiagnostics(this.options.diagnostics, { includePlugins: this.includePlugins });
  }

  private validate(): IssueReport | null {
    if (!this.title.trim() || !this.description.trim()) {
      showNotice(t('issue.missing'));
      return null;
    }
    return {
      type: this.type,
      area: this.area,
      title: this.title,
      description: this.description,
      steps: this.steps,
      environment: this.environment(),
      errors: this.includeErrors ? formatErrors(this.options.errors) : '',
    };
  }

  private async copyReport(): Promise<void> {
    const report = this.validate();
    if (!report) return;
    await this.options.copyText(formatReportMarkdown(report));
    showNotice(t('issue.copied'));
  }

  private async submit(): Promise<void> {
    if (this.submitting) return;
    const report = this.validate();
    if (!report) return;
    const body = JSON.stringify(report);
    if (this.submission?.body !== body) {
      this.submission = { body, id: crypto.randomUUID() };
    }
    this.submitting = true;
    const controls = [...this.contentEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>('input, textarea, [role="combobox"]')];
    const disabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    this.statusEl?.setText('');
    if (this.submitButton) {
      this.submitButton.disabled = true;
      this.submitButton.textContent = t('issue.submitting');
    }
    try {
      const receipt = await this.options.submitReport(report, this.submission.id);
      this.clearContent();
      this.setTitle(t('issue.submitted'));
      this.contentEl.createEl('p', { text: t('issue.submittedAs', { number: String(receipt.number) }) });
      new Setting(this.contentEl)
        .addButton(button => button.setButtonText(t('issue.view'))
          .onClick(() => this.options.openExternal(receipt.url)))
        .addButton(button => button.setButtonText(t('common.close')).setCta().onClick(() => this.close()));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('issue.sendFailed');
      this.statusEl?.setText(t('issue.stillHere', { message }));
    } finally {
      this.submitting = false;
      controls.forEach((control, index) => { control.disabled = disabled[index]!; });
      if (this.submitButton) {
        this.submitButton.disabled = false;
        this.submitButton.textContent = t('issue.submit');
      }
    }
  }
}
