import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { ISSUE_AREAS, ISSUE_TYPES } from '../../src/app/support/issueCategories';
import { issueForm } from '../../src/app/support/issueReport';

const root = path.resolve(__dirname, '../..');
const readYaml = (file: string) => parse(fs.readFileSync(path.join(root, file), 'utf8')) as any;
const field = (template: any, id: string) => template.body.find((entry: any) => entry.id === id);
const bugTypes = Object.entries(ISSUE_TYPES).filter(([value]) => value !== 'feature');

describe('GitHub issue forms stay in sync with the in-app report', () => {
  const bug = readYaml('.github/ISSUE_TEMPLATE/bug_report.yml');
  const feature = readYaml('.github/ISSUE_TEMPLATE/feature_request.yml');
  const labeler = readYaml('.github/issue-labeler.yml') as Record<string, string[]>;

  it('offers the same type and area options as the plugin', () => {
    expect(field(bug, 'type').attributes.options).toEqual(bugTypes.map(([, label]) => label));
    expect(field(bug, 'area').attributes.options).toEqual(Object.values(ISSUE_AREAS));
    expect(field(feature, 'area').attributes.options).toEqual(Object.values(ISSUE_AREAS));
  });
  it('has matching field identifiers and wording', () => {
    for (const [type, template] of [['bug', bug], ['feature', feature]] as const) {
      const form = issueForm(type);
      expect(template.name).toBe(form.title);
      for (const id of Object.values(form.fields)) expect(field(template, id), `${form.file} ${id}`).toBeDefined();
      expect(field(template, form.fields.description).attributes.label).toBe(form.wording.description.label);
      expect(field(template, form.fields.steps!).attributes.label).toBe(form.wording.steps.label);
    }
    expect(feature.labels).toContain('type:feature');
    expect(bug.labels).toContain('needs-triage');
  });
  it('labels every type and area from the rendered form answers', () => {
    const matches = (label: string, body: string) => labeler[label]!.some(pattern => new RegExp(pattern).test(body));
    for (const [value, label] of bugTypes) {
      const body = `### What kind of issue is this?\n\n${label}\n\n### Which part of Atlas is affected?\n\nDice`;
      expect(matches(`type:${value}`, body), label).toBe(true);
      expect(matches(`type:${value}`, `Someone wrote "${label}" in the description`), label).toBe(false);
    }
    for (const [value, label] of Object.entries(ISSUE_AREAS)) {
      const body = `### What kind of issue is this?\n\nCrash or freeze\n\n### Which part of Atlas is affected?\n\n${label}\n\n### What happened?`;
      expect(matches(`area:${value}`, body), label).toBe(true);
    }
    expect(Object.keys(labeler).sort()).toEqual([
      ...bugTypes.map(([value]) => `type:${value}`),
      ...Object.keys(ISSUE_AREAS).map(value => `area:${value}`),
    ].sort());
  });
});
