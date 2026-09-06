import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const [pack] = JSON.parse(
	execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' }),
);
const files = new Set(pack.files.map(({ path }) => path));
for (const path of [
	'README.md',
	'LICENSE.md',
	'package.json',
	...manifest.n8n.nodes,
	...manifest.n8n.credentials,
	'dist/icons/lago.svg',
	'dist/icons/lago.dark.svg',
])
	if (!files.has(path)) throw new Error(`Package is missing ${path}`);
for (const path of files)
	if (!['README.md', 'LICENSE.md', 'package.json'].includes(path) && !path.startsWith('dist/'))
		throw new Error(`Unexpected package file: ${path}`);
for (const [path, expected] of Object.entries({
	'icons/lago.svg': 'efb73b97ce2baa9cb151f49e1ecc07b6004081cdf8414b7586a0da234c0b5b4a',
	'icons/lago.dark.svg': '4ac719470ca6de5a2c500b951e5959b707ea7de4ed97cfdd2c4450b9a67154e1',
	'dist/icons/lago.svg': 'efb73b97ce2baa9cb151f49e1ecc07b6004081cdf8414b7586a0da234c0b5b4a',
	'dist/icons/lago.dark.svg': '4ac719470ca6de5a2c500b951e5959b707ea7de4ed97cfdd2c4450b9a67154e1',
}))
	if (
		createHash('sha256')
			.update(readFileSync(resolve(root, path)))
			.digest('hex') !== expected
	)
		throw new Error(`Lago icon hash changed: ${path}`);
console.log(`Package boundary passed (${files.size} files)`);
