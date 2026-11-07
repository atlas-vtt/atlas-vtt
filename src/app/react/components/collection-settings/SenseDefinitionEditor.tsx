import React, { useEffect, useId, useRef } from 'react';
import { t } from '../../../i18n';
import { senseKind, senseNameProblem, senseProblem, withSenseKind, type SenseKind } from '../../../gameSystems/senseEditing';
import { withUnit } from '../../../lighting/tokenLighting';
import { Select, type SelectOption } from '../../../packages/components/primitives/Select';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import type { SenseDefinition, SenseLook, SenseRange, SenseSight } from '../../../types/senseTypes';
import { numberText, parseNumberText, positiveNumber } from '../../../utils/numberInput';

const KINDS: SelectOption<SenseKind>[] = [
  { value: 'sense', label: t('senses.kind.sense') },
  { value: 'see-invisible', label: t('senses.kind.seeInvisible') },
];

const RANGES: SelectOption<SenseRange>[] = [
  { value: 'required', label: t('senses.range.required') },
  { value: 'optional', label: t('senses.range.optional') },
  { value: 'unlimited', label: t('senses.range.unlimited') },
];

const IN_DIM: SelectOption<SenseSight['dim']>[] = [
  { value: 'none', label: t('senses.sees.none') },
  { value: 'normal', label: t('senses.sees.asIs') },
  { value: 'as-bright', label: t('senses.sees.asBright') },
];

const IN_DARK: SelectOption<SenseSight['dark']>[] = [
  { value: 'none', label: t('senses.sees.none') },
  { value: 'as-dim', label: t('senses.sees.asDim') },
  { value: 'as-bright', label: t('senses.sees.asBright') },
];

const LOOKS: SelectOption<SenseLook>[] = [
  { value: 'colour', label: t('senses.look.colour') },
  { value: 'monochrome', label: t('senses.look.grey') },
  { value: 'black-and-white', label: t('senses.look.blackWhite') },
  { value: 'heat', label: t('senses.look.heat') },
];

interface ChoiceProps<T extends string> {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  wide?: boolean;
}

function Choice<T extends string>({ label, value, options, onChange, wide = false }: ChoiceProps<T>): React.ReactElement {
  const id = useId();
  return (
    <div className={`atlas-csm-field${wide ? ' atlas-csm-sense-editor__wide' : ''}`}>
      <span id={id} className="atlas-csm-label">{label}</span>
      <Select value={value} options={options} onChange={onChange} labelledBy={id} />
    </div>
  );
}

function Switch({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }): React.ReactElement {
  const id = useId();
  return (
    <div className="atlas-csm-sense-editor__switch">
      <span id={id} className="atlas-csm-toggle-label">{label}</span>
      <ToggleSwitch value={value} onChange={() => onChange(!value)} labelledBy={id} />
    </div>
  );
}

interface SenseDefinitionEditorProps {
  sense: SenseDefinition;
  /** Every sense of the collection, for the name check. */
  all: readonly SenseDefinition[];
  /** Game unit of the collection, e.g. "ft". */
  unit: string;
  onChange: (sense: SenseDefinition) => void;
}

/** The fields of one of the collection's own senses, in plain words. */
export function SenseDefinitionEditor({ sense, all, unit, onChange }: SenseDefinitionEditorProps): React.ReactElement {
  const nameId = useId();
  const rangeId = useId();
  const problemId = useId();
  const fields = useRef<HTMLDivElement>(null);
  const problem = senseProblem(sense, all);
  const isSense = senseKind(sense) === 'sense';

  // The fields open at the end of a list that scrolls. Newer browsers return a promise from
  // scrollIntoView, which an effect must not hand back.
  useEffect(() => {
    void fields.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  const set = (changes: Partial<SenseDefinition>): void => onChange({ ...sense, ...changes });

  const setRange = (range: SenseRange): void => {
    const { defaultRange: _defaultRange, ...rest } = sense;
    // Only a sense that needs a range has a default one.
    onChange(range === 'required' ? { ...sense, range } : { ...rest, range });
  };

  const setDefaultRange = (text: string): void => {
    const { defaultRange: _defaultRange, ...rest } = sense;
    const defaultRange = positiveNumber(parseNumberText(text));
    onChange(defaultRange === undefined ? rest : { ...rest, defaultRange });
  };

  return (
    <div ref={fields} className="atlas-csm-sense-editor">
      <div className="atlas-csm-field atlas-csm-sense-editor__wide">
        <label className="atlas-csm-label" htmlFor={nameId}>{t('senses.editor.name')}</label>
        <input
          id={nameId}
          type="text"
          className="atlas-csm-input"
          value={sense.name}
          placeholder={t('senses.editor.namePlaceholder')}
          aria-invalid={senseNameProblem(sense, all) ? true : undefined}
          aria-describedby={problem ? problemId : undefined}
          onChange={(event) => set({ name: event.target.value })}
        />
      </div>
      <Choice label={t('senses.editor.kind')} value={senseKind(sense)} options={KINDS} onChange={(kind) => onChange(withSenseKind(sense, kind))} wide />
      {isSense && (
        <>
          <Choice label={t('senses.editor.range')} value={sense.range} options={RANGES} onChange={setRange} />
          {sense.range === 'required' ? (
            <div className="atlas-csm-field">
              <label className="atlas-csm-label" htmlFor={rangeId}>{withUnit(t('senses.editor.defaultRange'), unit)}</label>
              <input
                id={rangeId}
                type="number"
                className="atlas-csm-input"
                min={0}
                value={numberText(sense.defaultRange)}
                placeholder={t('common.none')}
                onChange={(event) => setDefaultRange(event.target.value)}
              />
            </div>
          ) : <span />}
          <Choice label={t('senses.editor.inDim')} value={sense.sees.dim} options={IN_DIM} onChange={(dim) => set({ sees: { ...sense.sees, dim } })} />
          <Choice label={t('senses.editor.inDark')} value={sense.sees.dark} options={IN_DARK} onChange={(dark) => set({ sees: { ...sense.sees, dark } })} />
          {sense.sees.dark !== 'none' && sense.reveals === 'all' && (
            <Choice label={t('senses.editor.lookInDark')} value={sense.look} options={LOOKS} onChange={(look) => set({ look })} wide />
          )}
          <Switch label={t('senses.editor.throughWalls')} value={!sense.lineOfSight} onChange={(on) => set({ lineOfSight: !on })} />
          <Switch label={t('senses.editor.seesInvisible')} value={sense.seesInvisible} onChange={(seesInvisible) => set({ seesInvisible })} />
          <Switch label={t('senses.editor.whileBlinded')} value={sense.worksWhileBlinded} onChange={(worksWhileBlinded) => set({ worksWhileBlinded })} />
          <Switch label={t('senses.editor.creaturesOnly')} value={sense.reveals === 'creatures'} onChange={(on) => set(on ? { reveals: 'creatures' } : { reveals: 'all', precise: true })} />
          {/* A sense that shows the map sees what it perceives; one that feels creatures may only sense them. */}
          {sense.reveals === 'creatures' && (
            <Switch label={t('senses.editor.outlines')} value={!sense.precise} onChange={(on) => set({ precise: !on })} />
          )}
        </>
      )}
      {problem && <p id={problemId} className="atlas-csm-hint atlas-csm-hint--error atlas-csm-sense-editor__wide">{problem}</p>}
    </div>
  );
}
