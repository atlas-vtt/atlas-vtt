import React, { useRef } from 'react';
import type { EntriesBlock, FieldKey, TemplateBlock, TemplateField } from '../../model/templateTypes';
import { cn } from '../../../../utils/cn';
import { isEmptyValue } from '../../values/emptyValue';
import { blockDisplay, valuePrompt } from '../../render/blockDisplay';
import { picksChoice } from '../../values/choicePicks';
import { ChoicePicksInput } from './ChoicePicksInput';
import { ChoiceValueInput } from './ChoiceValueInput';
import { ConflictChip } from './ConflictChip';
import { DerivedValue, patternInWords } from './DerivedValue';
import { entryList, shownEntryIndexes } from './entryPatches';
import { EntryInlineEditor } from './EntryInlineEditor';
import { focusStaysIn } from './focusWithin';
import { ListValueInput } from './ListValueInput';
import { MarkdownValueInput } from './MarkdownValueInput';
import { usePaneEdit, type EditTarget, type PaneEditController } from './paneEditContext';
import { TextValueInput, type ValueInputProps } from './TextValueInput';
import { TokenSocket } from '../token-socket/TokenSocket';

/** The input for one field, by its type group (§7.6). */
function FieldInput(props: ValueInputProps): React.JSX.Element {
  const { field } = props;
  switch (field.type) {
    case 'list': return <ListValueInput {...props} />;
    case 'markdown': case 'spells': return <MarkdownValueInput {...props} />;
    case 'choice':
      if (picksChoice(field)) return <ChoicePicksInput {...props} />;
      return field.options?.length ? <ChoiceValueInput {...props} /> : <TextValueInput {...props} />;
    default: return <TextValueInput {...props} />;
  }
}

interface BlockEditorProps {
  block: TemplateBlock;
  fields: readonly TemplateField[];
  target: EditTarget;
  /** The slot holds one of the block's values alone (a number of a Metric): its own prompt stands in the input. */
  single?: boolean | undefined;
}

/** What an empty lone field's input shows: what its block showed (its prompt, or the value worked out in its place), or for a value with a slot of its own its own prompt. */
function placeholderOf(block: TemplateBlock, fields: readonly TemplateField[], pane: PaneEditController, single: boolean): string | undefined {
  const [field] = fields;
  if (!field || fields.length !== 1) return undefined;
  if (single) return isEmptyValue(pane.read(field).value) ? valuePrompt(field, field.label) : undefined;
  const shown = blockDisplay(block, pane.sheet);
  return shown?.state === 'prompt' ? shown.prompt : shown?.state === 'fallback' ? shown.text.text : undefined;
}

/**
 * What stands where a block's values show while one of its fields is edited:
 * an input per field, in the order the block writes them, focus on the one
 * clicked or reached with Tab. Focus leaving the block ends editing. A lone
 * empty field shows what its block showed (its prompt, or the value worked
 * out in its place), so a click adds only the caret.
 */
function BlockEditor({ block, fields, target, single = false }: BlockEditorProps): React.JSX.Element {
  const pane = usePaneEdit();
  const ref = useRef<HTMLSpanElement>(null);
  const onBlur = (event: React.FocusEvent): void => {
    if (!focusStaysIn(ref.current, event.relatedTarget)) pane.leave(block.id);
  };
  const prompt = placeholderOf(block, fields, pane, single);

  return (
    <span ref={ref} className="atlas-sb-pane-editor atlas-sb-value" onBlur={onBlur}>
      {fields.map((field, index) => (
        <React.Fragment key={field.key}>
          {index > 0 && ' '}
          <FieldInput field={field} autoFocus={field.key === target.field} placeholder={prompt} />
        </React.Fragment>
      ))}
    </span>
  );
}

/**
 * The list of abilities being edited: it stays drawn, since its one ability
 * being typed has its editor in its own place (`PaneEntry`); an empty list
 * shows its first new one.
 */
function EntriesEditor({ block, fields, target, values }: BlockEditorProps & { block: EntriesBlock; values: React.ReactNode }): React.ReactNode {
  const pane = usePaneEdit();
  const entries = fields.find((field) => field.type === 'entries' && field.key === target.field);
  if (!entries) return values;
  const shown = shownEntryIndexes(entryList(pane.read(entries).value), entries.entry);
  return shown.length > 0 ? values : <EntryInlineEditor block={block} field={entries} editing={{ kind: 'new', afterIndex: null, shown: 0 }} />;
}

/** How a value the template works out is made, while the block shows its fallback; null otherwise. */
function derivedWords(block: TemplateBlock, pane: PaneEditController): string | null {
  if (!block.fallback || blockDisplay(block, pane.sheet)?.state !== 'fallback') return null;
  return patternInWords(block.fallback, pane.sheet.context.labelOf);
}

/** Whether a block's values stand as blocks of their own (paragraphs, a table, a list), not in a line of text. */
function valuesAreBlocks(block: TemplateBlock): boolean {
  switch (block.type) {
    case 'text': case 'scores': case 'spells': return true;
    case 'tags': return block.look !== 'comma';
    default: return false;
  }
}

/**
 * A block's values at rest, with what the pane has to say about them: a conflict, or how a value is worked out.
 * `field`: the slot holds that one of the block's values, edited on its own (a number of a Metric).
 */
function PaneSlot({ block, values, field }: { block: TemplateBlock; values: React.ReactNode; field?: FieldKey | undefined }): React.ReactNode {
  const pane = usePaneEdit();
  if (block.type === 'image') return <TokenSocket block={block} art={values} />;
  const all = pane.spots.byBlock.get(block.id) ?? [];
  const fields = field === undefined ? all : all.filter((each) => each.key === field);
  // A value that does not fit its type has its chip from the renderer, inside `values`.
  const marks = fields.flatMap((field) => {
    const conflict = pane.conflicts.get(field.key);
    return conflict ? [<ConflictChip key={field.key} field={field} conflict={conflict} />] : [];
  });
  // A Table is typed in its own cells (`PaneTable`): it stays drawn.
  const typedHere = pane.editing?.blockId === block.id && !pane.spots.tables.has(block.id);
  const editing = typedHere && fields.some((each) => field === undefined || each.key === pane.editing?.field) ? pane.editing : null;
  // A list stays drawn while one of its abilities is typed, with what the pane has to say about it.
  if (block.type === 'entries') {
    const shown = editing ? <EntriesEditor block={block} fields={fields} target={editing} values={values} /> : values;
    const words = editing ? null : derivedWords(block, pane);
    const drawn = words ? <DerivedValue words={words}>{shown}</DerivedValue> : shown;
    return marks.length ? <>{drawn}{marks}</> : drawn;
  }
  const words = derivedWords(block, pane);
  const drawn = words ? <DerivedValue words={words}>{values}</DerivedValue> : values;
  // The values stay mounted while edited, hidden under the inputs: their box is the inputs' least size (_pane-inputs.scss).
  return (
    <span className={cn('atlas-sb-pane-slot', editing && 'atlas-sb-pane-slot--editing', valuesAreBlocks(block) && 'atlas-sb-pane-slot--blocks')}>
      <span className="atlas-sb-pane-slot__rest" aria-hidden={editing ? true : undefined} inert={editing ? true : undefined}>
        {drawn}
        {marks}
      </span>
      {editing && <BlockEditor block={block} fields={fields} target={editing} single={field !== undefined} />}
    </span>
  );
}

/** The pane's `ValueEditing.slot`: one element type, so a block's values keep their place in the tree. */
export function renderPaneSlot(block: TemplateBlock, values: React.ReactNode, field?: FieldKey): React.ReactNode {
  return <PaneSlot block={block} values={values} field={field} />;
}
