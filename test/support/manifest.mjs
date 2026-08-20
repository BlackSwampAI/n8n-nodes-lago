// Filesystem and package.json access lives here, in JavaScript, for the same reason as env.mjs:
// the n8n community-node lint rules constrain what .ts files in this package may import, and
// strict mode forbids scoping them. See CONTRIBUTING.md.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

/**
 * Node entry points registered in package.json, as built dist paths.
 * @type {string[]}
 */
export const registeredNodes = packageJson.n8n?.nodes ?? [];

/**
 * Credential entry points registered in package.json, as built dist paths.
 * @type {string[]}
 */
export const registeredCredentials = packageJson.n8n?.credentials ?? [];

/**
 * dist/nodes/Lago/Lago.node.js -> nodes/Lago/Lago.node.ts
 * @param {string} distPath
 * @returns {string}
 */
export function toSourcePath(distPath) {
	return distPath.replace(/^dist\//, '').replace(/\.js$/, '.ts');
}

/**
 * True when the TypeScript source behind a registered dist path exists.
 * @param {string} distPath
 * @returns {boolean}
 */
export function sourceExists(distPath) {
	return existsSync(resolve(root, toSourcePath(distPath)));
}

/**
 * True when an icon referenced by a node or credential exists on disk.
 * @param {string} iconPath - as written in the source, e.g. "file:../../icons/lago.svg"
 * @param {string} fromDistPath - the registered dist path of the file referencing it
 * @returns {boolean}
 */
export function iconExists(iconPath, fromDistPath) {
	const relative = iconPath.replace(/^file:/, '');
	const sourceDir = resolve(root, toSourcePath(fromDistPath), '..');
	return existsSync(resolve(sourceDir, relative));
}

/** The published README, for checking that documentation keeps up with the node. */
export const readme = readFileSync(resolve(root, 'README.md'), 'utf8');

/** package.json, for release checks. */
export const manifest = packageJson;
