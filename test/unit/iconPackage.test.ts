/* eslint-disable @n8n/community-nodes/no-restricted-imports -- package-boundary fixture */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertRegistrationIcons } from '../../scripts/node-load-smoke.mjs';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture(contents = '<svg viewBox="0 0 32 32"></svg>') {
	const root = mkdtempSync(join(tmpdir(), 'icon-package-'));
	roots.push(root);
	const directory = join(root, 'dist', 'credentials');
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, 'light.svg'), contents);
	return root;
}

describe('packed icon validation', () => {
	it('accepts valid themed icons and requires every variant', () => {
		const root = fixture();
		writeFileSync(join(root, 'dist/credentials/dark.svg'), '<svg viewBox="0 0 16 16"></svg>');
		expect(() =>
			assertRegistrationIcons(
				root,
				'dist/credentials/Test.js',
				{ light: 'file:light.svg', dark: 'file:dark.svg' },
				'test',
			),
		).not.toThrow();
		expect(() =>
			assertRegistrationIcons(
				root,
				'dist/credentials/Test.js',
				{ light: 'file:light.svg', dark: 'file:missing.svg' },
				'test',
			),
		).toThrow('missing or empty');
	});
	it('rejects traversal, empty assets, and malformed viewBox values', () => {
		const root = fixture();
		expect(() =>
			assertRegistrationIcons(
				root,
				'dist/credentials/Test.js',
				'file:../../../outside.svg',
				'test',
			),
		).toThrow('escapes');
		writeFileSync(join(root, 'dist/credentials/empty.svg'), '');
		expect(() =>
			assertRegistrationIcons(root, 'dist/credentials/Test.js', 'file:empty.svg', 'test'),
		).toThrow('missing or empty');
		for (const viewBox of ['bad', '0 0 0 32', '0 0 32 -1']) {
			writeFileSync(join(root, 'dist/credentials/bad.svg'), `<svg viewBox="${viewBox}"></svg>`);
			expect(() =>
				assertRegistrationIcons(root, 'dist/credentials/Test.js', 'file:bad.svg', 'test'),
			).toThrow('usable viewBox');
		}
	});
	it('rejects missing and non-file icon declarations', () => {
		const root = fixture();
		expect(() =>
			assertRegistrationIcons(root, 'dist/credentials/Test.js', undefined, 'test'),
		).toThrow('required');
		expect(() =>
			assertRegistrationIcons(root, 'dist/credentials/Test.js', 'fa:cube', 'test'),
		).toThrow('file: SVG or PNG');
	});
});
