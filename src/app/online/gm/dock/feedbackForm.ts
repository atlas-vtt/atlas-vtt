import { MAX_FEEDBACK_TEXT, feedbackNote, type FeedbackResult } from '../../protocol/index.ts';
import { COMPANION_REPORTS_NOTE, type CompanionFeedback } from '../companionReports.ts';
import { textButton } from './controls.ts';
import { t } from '../../../i18n';

export type FeedbackState = 'idle' | 'sending' | FeedbackResult;

/** The form as the panel shows it; its text is kept apart, so typing never redraws the panel. */
export interface FeedbackView {
  readonly open: boolean;
  readonly diagnostics: boolean;
  readonly state: FeedbackState;
  /** The companion's automatic error reports, which the form also switches. */
  readonly errorReports: boolean;
}

export interface FeedbackActions {
  /** Opens or closes the form; the draft stays. */
  toggleFeedback(): void;
  feedbackText(): string;
  setFeedbackText(text: string): void;
  setFeedbackDiagnostics(on: boolean): void;
  sendFeedback(): void;
  setErrorReports(on: boolean): void;
}

const STATE_TEXT: Readonly<Record<FeedbackState, string>> = {
  idle: '',
  sending: 'Sending…',
  sent: t('online.feedback.sent'),
  busy: t('online.feedback.busy'),
  failed: t('online.feedback.failed'),
};

/**
 * "Send feedback" in the online panel, above its footer: a message, the switch for diagnostics and, in
 * plain words, what goes out, then the switch for automatic error reports (the setting's twin) and what
 * they carry. Cmd/Ctrl+Enter sends.
 */
export function renderFeedback(parent: HTMLElement, view: FeedbackView, actions: FeedbackActions): void {
  const form = parent.createDiv({ cls: 'atlas-online-feedback', attr: { role: 'group', 'aria-labelledby': `${parent.id}-feedback` } });
  form.createDiv({ cls: 'atlas-online-group-label', text: t('online.feedback.send'), attr: { id: `${parent.id}-feedback` } });
  const field = form.createEl('textarea', {
    cls: 'atlas-online-feedback__text',
    attr: { rows: '4', maxlength: String(MAX_FEEDBACK_TEXT), placeholder: t('online.feedback.placeholder'), 'aria-label': t('online.feedback.label'), 'data-focus-key': 'feedback-text' },
  });
  field.value = actions.feedbackText();
  const send = (): void => {
    if (actions.feedbackText().trim() !== '' && view.state !== 'sending') actions.sendFeedback();
  };
  field.addEventListener('input', () => actions.setFeedbackText(field.value));
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) send();
  });
  checkbox(form, 'Include diagnostics', 'feedback-diagnostics', view.diagnostics, (on) => actions.setFeedbackDiagnostics(on));
  form.createDiv({ cls: 'atlas-online-help atlas-online-feedback__note', text: feedbackNote(view.diagnostics) });
  const row = form.createDiv({ cls: 'atlas-online-feedback__actions' });
  row.createSpan({ cls: 'atlas-online-help atlas-online-feedback__status', text: STATE_TEXT[view.state], attr: { role: 'status' } });
  const button = textButton(row, t('online.feedback.submit'), send, 'cta');
  button.dataset.focusKey = 'feedback-send';
  button.disabled = view.state === 'sending';
  checkbox(form, 'Send error reports automatically', 'error-reports', view.errorReports, (on) => actions.setErrorReports(on));
  form.createDiv({ cls: 'atlas-online-help atlas-online-feedback__note', text: COMPANION_REPORTS_NOTE });
}

/** A labelled checkbox, focus kept across redraws by its key. */
function checkbox(parent: HTMLElement, text: string, key: string, checked: boolean, change: (on: boolean) => void): void {
  const toggle = parent.createEl('label', { cls: 'atlas-online-feedback__toggle' });
  const box = toggle.createEl('input', { attr: { type: 'checkbox', 'data-focus-key': key } });
  box.checked = checked;
  box.addEventListener('change', () => change(box.checked));
  toggle.appendText(text);
}

/** The form's state, kept by the control: open, the draft, the diagnostics switch and how sending went. */
export class FeedbackDraft {
  readonly actions: FeedbackActions;
  private open = false;
  private text = '';
  private diagnostics = false;
  private state: FeedbackState = 'idle';

  /** `changed` redraws the panel; typing changes no view and redraws nothing. */
  private readonly sender: CompanionFeedback;

  constructor(sender: CompanionFeedback, changed: () => void) {
    this.sender = sender;
    const change = (apply: () => void): void => {
      apply();
      changed();
    };
    this.actions = {
      toggleFeedback: () => change(() => (this.open = !this.open)),
      feedbackText: () => this.text,
      setFeedbackText: (text) => {
        this.text = text;
        if (this.state !== 'idle' && this.state !== 'sending') change(() => (this.state = 'idle'));
      },
      setFeedbackDiagnostics: (on) => change(() => (this.diagnostics = on)),
      sendFeedback: () => {
        change(() => (this.state = 'sending'));
        void sender.send(this.text, this.diagnostics).then((result) => change(() => {
          this.state = result;
          if (result === 'sent') this.text = '';
        }));
      },
      setErrorReports: (on) => change(() => sender.setReportErrors(on)),
    };
  }

  view(): FeedbackView {
    return { open: this.open, diagnostics: this.diagnostics, state: this.state, errorReports: this.sender.reportsErrors() };
  }
}
