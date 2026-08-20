import { describe, expect, it } from 'vitest';
import {
	iconExists,
	manifest,
	readme,
	registeredCredentials,
	registeredNodes,
	sourceExists,
	toSourcePath,
} from '../support/manifest.mjs';
import { Lago } from '../../nodes/Lago/Lago.node';
import { LagoApi } from '../../credentials/LagoApi.credentials';

// package.json points at built dist paths, so a renamed or moved source file still builds and
// still lints — n8n only discovers the breakage at install time, when the node silently fails
// to appear. These tests close that gap.
describe('package registration', () => {
	it('registers at least one node and one credential', () => {
		expect(registeredNodes.length).toBeGreaterThan(0);
		expect(registeredCredentials.length).toBeGreaterThan(0);
	});

	it.each([...registeredNodes, ...registeredCredentials])(
		'has TypeScript source behind %s',
		(distPath) => {
			expect(sourceExists(distPath), `missing ${toSourcePath(distPath)}`).toBe(true);
		},
	);

	it('registers every entry point under dist/', () => {
		for (const distPath of [...registeredNodes, ...registeredCredentials]) {
			expect(distPath.startsWith('dist/')).toBe(true);
			expect(distPath.endsWith('.js')).toBe(true);
		}
	});
});

describe('node and credential wiring', () => {
	const node = new Lago();
	const credential = new LagoApi();

	it('requires the credential the node declares', () => {
		const names = (node.description.credentials ?? []).map((entry) => entry.name);
		expect(names).toContain(credential.name);
	});

	it('resolves both icon variants for the node and the credential', () => {
		const nodeIcon = node.description.icon as { light: string; dark: string };
		expect(iconExists(nodeIcon.light, registeredNodes[0])).toBe(true);
		expect(iconExists(nodeIcon.dark, registeredNodes[0])).toBe(true);

		const credentialIcon = credential.icon as { light: string; dark: string };
		expect(iconExists(credentialIcon.light, registeredCredentials[0])).toBe(true);
		expect(iconExists(credentialIcon.dark, registeredCredentials[0])).toBe(true);
	});

	it('keeps the package name and the README heading in step', () => {
		expect(readme).toContain(`# ${manifest.name}`);
	});

	it('is publishable as a scoped public package', () => {
		expect(manifest.publishConfig?.access).toBe('public');
		expect(manifest.license).toBe('MIT');
	});

	it('declares no runtime dependencies, which n8n verification forbids', () => {
		expect(Object.keys(manifest.dependencies ?? {})).toEqual([]);
	});
});
