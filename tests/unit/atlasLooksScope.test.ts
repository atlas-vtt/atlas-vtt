import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import postcss, { type Container, type Rule } from 'postcss';
import { fileURLToPath } from 'node:url';

const LOOKS = fileURLToPath(new URL('../../styles/looks/atlas-looks.css', import.meta.url));
const LOOK_SCOPE = 'body.atlas-look';

function insideKeyframes(rule: Rule): boolean {
  for (let parent: Container | undefined = rule.parent; parent; parent = parent.parent as Container | undefined) {
    if (parent.type === 'atrule' && /keyframes$/i.test((parent as unknown as { name: string }).name)) return true;
  }
  return false;
}

describe("Atlas' looks stylesheet", () => {
  const css = fs.readFileSync(LOOKS, 'utf8');

  it('draws nothing while no look is on: every selector starts with body.atlas-look', () => {
    const unscoped: string[] = [];
    let rules = 0;
    postcss.parse(css).walkRules((rule) => {
      if (insideKeyframes(rule)) return;
      rules++;
      for (const selector of rule.selectors) {
        if (!selector.trim().startsWith(LOOK_SCOPE)) unscoped.push(selector);
      }
    });
    expect(rules).toBeGreaterThan(0);
    expect(unscoped).toEqual([]);
  });

  it('inlines no font: faces load the bundled files, whose notice styles.css carries', () => {
    expect(css).not.toMatch(/data:font\//);
  });
});
