import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve, sep } from 'node:path';
const root = process.argv[2] ? resolve(process.argv[2]) : resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
function load(registration, kind) {
	const exports = Object.values(require(resolve(root, registration)));
	for (const Constructor of exports.filter((value) => typeof value === 'function')) {
		const instance = new Constructor();
		if ((kind === 'node' && instance.description?.name) || (kind === 'credential' && instance.name))
			return instance;
	}
	throw new Error(`No compiled ${kind} in ${registration}`);
}
function checkIcons(registration, owner, icon) {
	const refs = typeof icon === 'string' ? [icon] : [icon?.light, icon?.dark];
	if (typeof icon === 'string' ? !icon : refs.some((ref) => !ref))
		throw new Error(`Every icon variant is required for ${owner}`);
	for (const ref of refs) {
		if (!ref.startsWith('file:')) throw new Error(`Icon must use file: for ${owner}`);
		const path = resolve(root, registration, '..', ref.slice(5));
		const fromRoot = relative(root, path);
		if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot))
			throw new Error(`Icon escapes package root: ${ref}`);
		if (!existsSync(path) || statSync(path).size === 0 || !/\.(?:svg|png)$/i.test(path))
			throw new Error(`Missing packaged SVG/PNG icon: ${ref}`);
	}
}
const nodes = manifest.n8n.nodes.map((path) => load(path, 'node'));
const credentials = manifest.n8n.credentials.map((path) => load(path, 'credential'));
const referenced = new Set(
	nodes.flatMap((node) => (node.description.credentials ?? []).map(({ name }) => name)),
);
for (const [index, node] of nodes.entries())
	checkIcons(manifest.n8n.nodes[index], node.description.name, node.description.icon);
for (const [index, credential] of credentials.entries()) {
	checkIcons(manifest.n8n.credentials[index], credential.name, credential.icon);
	if (!referenced.has(credential.name)) throw new Error(`Orphaned credential: ${credential.name}`);
}
console.log(`Loaded ${nodes.length} Lago nodes and ${credentials.length} wired credential`);
