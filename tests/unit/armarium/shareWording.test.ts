import { describe, expect, it } from 'vitest';
import {
  CHECK_STAGES,
  KINDS,
  LICENCES,
  STALE_DEVICE_SESSION,
  SUBMISSION_STATES,
  SYSTEMS,
  TAG_GROUPS,
  TAG_IDS,
  UPLOAD_REFUSALS,
} from '../../../src/app/armarium/upload/uploadContract';
import { fieldProblemMessage, stageLabel, stateMessage, uploadMessageFor, UPLOAD_ERROR_CODES } from '../../../src/app/armarium/upload/text/uploadMessages';
import {
  kindLabel,
  kindLine,
  LICENCE_URLS,
  licenceLabel,
  licenceLine,
  systemLabel,
  tagGroupLabel,
  tagLabel,
} from '../../../src/app/armarium/upload/text/listingVocabulary';

const GENERAL = 'Something went wrong. Try again in a moment.';
const PLACEHOLDER = /\{\w+\}/;

describe('upload sentences', () => {
  it.each(UPLOAD_REFUSALS.filter((refusal) => refusal !== 'account-too-new'))('has a sentence of its own for the refusal %s', (refusal) => {
    const message = uploadMessageFor(refusal);
    expect(message).not.toBe(GENERAL);
    expect(message).not.toMatch(PLACEHOLDER);
  });

  it('says the general sentence for a reason the account service never gives, and for codes it does not know', () => {
    expect(uploadMessageFor('account-too-new')).toBe(GENERAL);
    expect(uploadMessageFor('a-code-from-a-newer-api')).toBe(GENERAL);
    expect(uploadMessageFor('internal')).toBe(GENERAL);
  });

  it('names the day a restriction ends', () => {
    const message = uploadMessageFor('restricted', '2030-03-04T12:00:00Z');
    expect(message).toContain('2030');
    expect(message).toContain('March');
    expect(uploadMessageFor('restricted')).toContain('until the restriction is lifted');
    expect(uploadMessageFor('restricted', 'not a date')).toContain('until the restriction is lifted');
    expect(uploadMessageFor('suspended', '2030-03-04T12:00:00Z')).toContain('2030');
    expect(uploadMessageFor('too-many-today', '2030-03-04T12:00:00Z')).toContain('You can upload again at');
  });

  it('asks for a linked account in the words of what was being done', () => {
    expect(uploadMessageFor('needs-linked-provider')).toBe(
      'To share a collection, link a Discord or GitHub account to your Atlas account on your account page.',
    );
    expect(uploadMessageFor('needs-linked-provider', null, 'publish')).toMatch(/^To publish, /);
  });

  it('fills the limits a refusal names', () => {
    expect(uploadMessageFor('too-large')).toContain('1 GB');
    expect(uploadMessageFor('too-many-open')).toContain('You have 3 uploads');
  });

  it('has a sentence for every error code, the stale device session among them', () => {
    expect(UPLOAD_ERROR_CODES).toContain(STALE_DEVICE_SESSION);
    for (const code of UPLOAD_ERROR_CODES) expect(uploadMessageFor(code), code).not.toMatch(PLACEHOLDER);
    expect(uploadMessageFor(STALE_DEVICE_SESSION)).toBe('Publishing from Atlas needs a recent approval of this device. Approve it again in your browser, then publish.');
  });

  it('says where every submission stands and names every stage', () => {
    const states = SUBMISSION_STATES.map(stateMessage);
    expect(new Set(states).size).toBe(SUBMISSION_STATES.length);
    expect(stateMessage('failed')).toContain('fault on our side');
    expect(CHECK_STAGES.map(stageLabel)).toContain('Links between files');
  });
});

describe('field problems', () => {
  it('names the limits of the field', () => {
    expect(fieldProblemMessage('description', 'too-short')).toBe('Write at least 20 characters.');
    expect(fieldProblemMessage('description', 'too-long')).toBe('Use at most 5,000 characters.');
    expect(fieldProblemMessage('credits', 'too-long')).toBe('Use at most 2,000 characters.');
    expect(fieldProblemMessage('credits', 'too-short')).toBe('Write something first.');
    expect(fieldProblemMessage('description', 'too-many-lines')).toBe('Use at most 80 lines.');
    expect(fieldProblemMessage('credits', 'too-many-links')).toBe('Use at most 5 links.');
    expect(fieldProblemMessage('credits', 'hidden-characters')).toContain('do not show');
  });

  it('asks for what is missing', () => {
    expect(fieldProblemMessage('kind', 'missing')).toBe('Choose a kind.');
    expect(fieldProblemMessage('licence', 'missing')).toBe('Choose a licence.');
    expect(fieldProblemMessage('description', 'missing')).toBe('Write a description.');
    expect(fieldProblemMessage('system', 'missing')).toBe('Fill this in first.');
  });

  it('says what is wrong with the tags', () => {
    expect(fieldProblemMessage('tags', 'too-many')).toBe('Use at most 8 tags.');
    expect(fieldProblemMessage('tags', 'duplicate')).toBe('Use each tag once.');
    expect(fieldProblemMessage('tags', 'exclusive')).toBe('Use only one of No AI, AI-assisted, or AI-generated.');
    expect(fieldProblemMessage('tags', 'unknown')).toContain('not in the list');
  });

  it('falls back to a plain sentence', () => {
    expect(fieldProblemMessage('kind', 'invalid')).toBe('This field is not right yet. Change it and try again.');
    expect(fieldProblemMessage('description', 'unknown-field')).toBe('This field is not right yet. Change it and try again.');
  });
});

describe('listing vocabulary', () => {
  it('names every kind, system, licence, tag group and tag', () => {
    const labels = [
      ...KINDS.flatMap((kind) => [kindLabel(kind), kindLine(kind)]),
      ...SYSTEMS.map(systemLabel),
      systemLabel(null),
      ...LICENCES.flatMap((licence) => [licenceLabel(licence), licenceLine(licence)]),
      ...TAG_GROUPS.map((group) => tagGroupLabel(group.id)),
      ...TAG_IDS.map(tagLabel),
    ];
    for (const label of labels) {
      expect(label).not.toMatch(/^armarium/);
      expect(label.length).toBeGreaterThan(1);
    }
    expect(new Set(TAG_IDS.map(tagLabel)).size).toBe(TAG_IDS.length);
    expect(systemLabel(null)).toBe('None named');
    expect(tagLabel('settlement')).toBe('City, town or village');
  });

  it('links every licence but the one without a public text', () => {
    expect(LICENCES.filter((licence) => LICENCE_URLS[licence] === null)).toEqual(['all-rights-reserved']);
  });
});
