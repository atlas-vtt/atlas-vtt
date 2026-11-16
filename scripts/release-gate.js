#!/usr/bin/env node

/**
 * Keeps a new version off `main` until it can be installed. Obsidian offers the
 * version in the `manifest.json` on `main` and downloads it from the GitHub
 * release of that name, so a version merged before its release is published
 * ends in "Failed to install plugin" for everyone who tries.
 */
const { execFileSync } = require('child_process');

const ASSETS = ['main.js', 'manifest.json', 'styles.css'];

/** Why `commit`, which names `version`, may not go on `main`; null when it may. */
function releaseGateProblem({ mainVersion, version, commit, release }) {
  if (version === mainVersion) return null;
  if (!release || release.draft) {
    return `Release ${version} is not published yet. Run Prepare Plugin Release on this branch, publish the draft, then merge.`;
  }
  if (release.prerelease) return `Release ${version} is a pre-release, which is no stable release.`;
  if (release.commit !== commit) {
    return `Release ${version} was published from ${release.commit}, but this branch is at ${commit}. Merge what was released.`;
  }
  const missing = ASSETS.filter((name) => !release.assets.includes(name));
  if (missing.length > 0) return `Release ${version} lacks ${missing.join(', ')}.`;
  return null;
}

module.exports = { releaseGateProblem };

if (require.main === module) {
  const { GH_REPO: repo, HEAD_SHA: commit } = process.env;
  const api = (path, ...args) => execFileSync('gh', ['api', `repos/${repo}/${path}`, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const versionAt = (ref) => JSON.parse(api(`contents/manifest.json?ref=${ref}`, '-H', 'Accept: application/vnd.github.raw+json')).version;
  const publishedRelease = (tag) => {
    let found;
    try {
      found = JSON.parse(api(`releases/tags/${tag}`));
    } catch (error) {
      // Drafts answer 404 as well
      if (String(error.stderr).includes('HTTP 404')) return null;
      throw error;
    }
    return {
      draft: found.draft,
      prerelease: found.prerelease,
      commit: api(`commits/${tag}`, '--jq', '.sha').trim(),
      assets: found.assets.map(({ name }) => name),
    };
  };

  const version = versionAt(commit);
  const problem = releaseGateProblem({ mainVersion: versionAt('main'), version, commit, release: publishedRelease(version) });
  if (problem) {
    console.error(`❌ ${problem}`);
    process.exit(1);
  }
  console.log(`✅ ${version} may go on main`);
}
