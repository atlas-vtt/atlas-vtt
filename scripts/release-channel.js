#!/usr/bin/env node

/**
 * Release channel rules. `main` and `release/*` only ever carry stable `x.y.z`
 * versions and `beta` only ever carries `x.y.z-beta.N` pre-releases, so a production build
 * can never be cut from beta work and a beta build can never pass as stable.
 */
const fs = require('fs');
const path = require('path');

const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BETA = /^((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-beta\.(0|[1-9]\d*)$/;
const CHANNEL_BRANCHES = { main: 'stable', beta: 'beta' };

function parseVersion(version) {
  if (typeof version === 'string' && STABLE.test(version)) {
    return { version, base: version, channel: 'stable', iteration: null };
  }
  const beta = typeof version === 'string' ? version.match(BETA) : null;
  if (beta) {
    return { version, base: beta[1], channel: 'beta', iteration: Number(beta[2]) };
  }
  throw new Error(`Invalid version "${version}": use x.y.z for stable releases or x.y.z-beta.N for beta builds`);
}

function channelForBranch(branch) {
  return branch.startsWith('release/') ? 'stable' : CHANNEL_BRANCHES[branch] ?? null;
}

function readProjectVersion(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (manifest.version !== pkg.version) {
    throw new Error(`manifest.json (${manifest.version}) and package.json (${pkg.version}) versions differ`);
  }
  return manifest.version;
}

function assertChannel(root, expected) {
  const parsed = parseVersion(readProjectVersion(root));
  if (parsed.channel !== expected) {
    throw new Error(`Version ${parsed.version} belongs to the ${parsed.channel} channel, but the ${expected} channel was expected`);
  }
  return parsed;
}

module.exports = { parseVersion, channelForBranch, readProjectVersion, assertChannel };

if (require.main === module) {
  const args = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const branch = option('--branch');
  const expected = option('--expect') ?? (branch ? channelForBranch(branch) : undefined);

  if (!expected) {
    if (branch) {
      console.log(`ℹ️ Branch ${branch} has no release channel; skipping version check`);
      process.exit(0);
    }
    console.error('Usage: release-channel.js --expect <stable|beta> | --branch <name>');
    process.exit(1);
  }

  try {
    const parsed = assertChannel(path.resolve(__dirname, '..'), expected);
    console.log(`✅ ${parsed.version} is a valid ${expected} version`);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}
