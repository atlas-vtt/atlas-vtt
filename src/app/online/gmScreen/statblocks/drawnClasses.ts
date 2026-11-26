/**
 * The classes a statblock drawn for a GM screen device keeps: those Atlas's statblock stylesheets select on (the
 * device styles the statblock with them), and the few of Atlas's controls inside a statblock. Any other class, a
 * note's or a layout's own among them, is left out, so nothing a statblock holds can borrow a look of Atlas's
 * interface outside the card. A test holds this list to the stylesheets.
 */
export const STATBLOCK_STYLE_CLASSES: readonly string[] = [
  'adversary-name', 'atlas-dice-link', 'atlas-image-placeholder', 'atlas-linked-statblock',
  'atlas-linked-statblock__bar', 'atlas-linked-statblock__bar-text', 'atlas-sb-add-entry',
  'atlas-sb-add-entry--icon', 'atlas-sb-arm', 'atlas-sb-arm-line', 'atlas-sb-chevron', 'atlas-sb-chip',
  'atlas-sb-chips', 'atlas-sb-collapse', 'atlas-sb-collapse-clip', 'atlas-sb-columns', 'atlas-sb-counter',
  'atlas-sb-counter__count', 'atlas-sb-counter__name', 'atlas-sb-counter__pip', 'atlas-sb-counter__pip-button',
  'atlas-sb-counter__pips', 'atlas-sb-counter__step', 'atlas-sb-counter__stepper', 'atlas-sb-counters__body',
  'atlas-sb-counters__cells', 'atlas-sb-divider', 'atlas-sb-editable', 'atlas-sb-editor', 'atlas-sb-entries',
  'atlas-sb-entries-intro', 'atlas-sb-entry-extra', 'atlas-sb-entry-extra-label', 'atlas-sb-gauge',
  'atlas-sb-gauge-fill', 'atlas-sb-gauge-track', 'atlas-sb-gauge-value', 'atlas-sb-header', 'atlas-sb-header__dot',
  'atlas-sb-header__heading', 'atlas-sb-header__subtitle', 'atlas-sb-header__text', 'atlas-sb-heading',
  'atlas-sb-heading-row', 'atlas-sb-image', 'atlas-sb-image-button', 'atlas-sb-image-placeholder', 'atlas-sb-inline',
  'atlas-sb-inline-item', 'atlas-sb-item', 'atlas-sb-item--fill', 'atlas-sb-item--fit', 'atlas-sb-item--line',
  'atlas-sb-javascript', 'atlas-sb-label', 'atlas-sb-labelled', 'atlas-sb-labelled--run-in',
  'atlas-sb-labelled--stacked', 'atlas-sb-line', 'atlas-sb-markdown', 'atlas-sb-metric', 'atlas-sb-metric__blank',
  'atlas-sb-metric__heading', 'atlas-sb-metric__number', 'atlas-sb-metric__numbers', 'atlas-sb-metric__value',
  'atlas-sb-misfit', 'atlas-sb-modifier', 'atlas-sb-pip', 'atlas-sb-placeholder', 'atlas-sb-portrait',
  'atlas-sb-portrait-image', 'atlas-sb-problem', 'atlas-sb-prompt', 'atlas-sb-property', 'atlas-sb-property-name',
  'atlas-sb-prose', 'atlas-sb-row', 'atlas-sb-rule', 'atlas-sb-score', 'atlas-sb-score-column',
  'atlas-sb-score-column-label', 'atlas-sb-score-group', 'atlas-sb-score-label', 'atlas-sb-scores',
  'atlas-sb-scores--table', 'atlas-sb-script', 'atlas-sb-section-heading', 'atlas-sb-section-heading--minor',
  'atlas-sb-section-heading__row', 'atlas-sb-section-toggle', 'atlas-sb-sheet', 'atlas-sb-sheet-table',
  'atlas-sb-sheet-table__corner', 'atlas-sb-sheet-table__derived', 'atlas-sb-sheet-table__frame',
  'atlas-sb-sheet-table__grid', 'atlas-sb-sheet-table__room', 'atlas-sb-sheet-table__unnamed',
  'atlas-sb-spell-group', 'atlas-sb-spell-level', 'atlas-sb-spell-list', 'atlas-sb-spell-panel',
  'atlas-sb-spell-tabs', 'atlas-sb-spells', 'atlas-sb-spells-block', 'atlas-sb-stack', 'atlas-sb-stat',
  'atlas-sb-subheading', 'atlas-sb-tab', 'atlas-sb-table', 'atlas-sb-tabpanel', 'atlas-sb-tabs', 'atlas-sb-tabstrip',
  'atlas-sb-text', 'atlas-sb-token-entry', 'atlas-sb-token-gauge', 'atlas-sb-token-gauge-controls',
  'atlas-sb-token-gauge-fill', 'atlas-sb-token-gauge-value', 'atlas-sb-token-image', 'atlas-sb-token-list',
  'atlas-sb-token-name', 'atlas-sb-token-pips', 'atlas-sb-token-resource', 'atlas-sb-token-resource-label',
  'atlas-sb-track-box', 'atlas-sb-track-boxes', 'atlas-sb-track-max', 'atlas-sb-track-value',
  'atlas-sb-tracked__max', 'atlas-sb-tracked__step', 'atlas-sb-tracked__stepper', 'atlas-sb-trait',
  'atlas-sb-trait--heading', 'atlas-sb-trait--run-in', 'atlas-sb-trait-name', 'atlas-sb-traits', 'atlas-sb-value',
  'atlas-sb-word-list', 'atlas-sb-word-list--bullets', 'atlas-sb-word-list--numbered', 'atlas-statblock',
  'atlas-statblock-body', 'atlas-statblock-missing-hint', 'atlas-toggle', 'atlas-toggle--disabled',
  'atlas-toggle--s', 'atlas-toggle--xs', 'atlas-toggle-label', 'atlas-toggle-label--disabled',
  'atlas-toggle-label__text', 'atlas-toggle__icon', 'atlas-toggle__switch', 'atlas-toggle__switch--off',
  'atlas-toggle__switch--on', 'atlas-toggle__thumb', 'atlas-toggle__thumb--off', 'atlas-toggle__thumb--on',
  'atlas-token-image-wrapper', 'atlas-token-portrait', 'atlas-token-portrait--unframed', 'atlas-token-ring', 'btn',
  'hp-11', 'hp-14', 'hp-17', 'hp-2', 'hp-20', 'hp-23', 'hp-26', 'hp-29', 'hp-5', 'hp-8', 'is-checked', 'is-left',
  'is-marked', 'stat-block', 'stat-line', 'stat-name', 'stat-value', 'stress-11', 'stress-14', 'stress-17',
  'stress-2', 'stress-20', 'stress-23', 'stress-26', 'stress-29', 'stress-5', 'stress-8',
];

/** Atlas's buttons, whose look `main.scss` gives them, and their icons by name (an icon becomes an empty element). */
export const CONTROL_CLASSES: readonly string[] = [
  'btn--ghost', 'btn--icon', 'btn--sm', 'btn--default', 'btn--outline', 'btn--secondary',
  'lucide', 'lucide-chevron-right', 'lucide-circle-alert', 'lucide-locate-fixed', 'lucide-minus', 'lucide-pencil', 'lucide-plus',
];

export const DRAWN_CLASSES: ReadonlySet<string> = new Set([...STATBLOCK_STYLE_CLASSES, ...CONTROL_CLASSES]);
