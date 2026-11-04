import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkBoundaries } from './boundaries/graph.mjs';

const args = process.argv.slice(2);
const root = path.resolve(args.includes('--root') ? args[args.indexOf('--root') + 1] : '.');
const file = args.includes('--manifest') ? path.resolve(root, args[args.indexOf('--manifest') + 1]) : path.join(root, 'scripts/boundaries.mjs');
const manifest = await import(pathToFileURL(file).href);
const { violations, counts } = checkBoundaries(root, manifest);
for (const message of violations) console.error(message);
console.log(Object.entries(counts).map(([name, count]) => `${name}: ${count}`).join(', '));
if (violations.length) process.exitCode = 1;
