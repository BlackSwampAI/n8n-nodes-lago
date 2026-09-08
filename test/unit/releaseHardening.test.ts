// Release-tool tests intentionally use Node built-ins and disposable local files.
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { tmpdir } from 'node:os';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertRegisteredCredentialsAreWired } from '../../scripts/node-load-smoke.mjs';
import { prepareNpmAuth } from '../../scripts/prepare-npm-auth.mjs';
import { githubTagFailure } from '../../scripts/release-check-lib.mjs';
import {
	isDeterministicSecurityFailure,
	isLikelyPropagationFailure,
} from '../../scripts/scan-policy.mjs';

describe('release tag validation', () => {
	it('allows local and pull-request refs', () => {
		expect(githubTagFailure('0.1.3', {})).toBeUndefined();
		expect(
			githubTagFailure('0.1.3', {
				GITHUB_REF_TYPE: 'branch',
				GITHUB_REF: 'refs/pull/12/merge',
				GITHUB_REF_NAME: '12/merge',
			}),
		).toBeUndefined();
	});

	it('accepts only the matching true tag', () => {
		expect(
			githubTagFailure('0.1.3', { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.1.3' }),
		).toBeUndefined();
		expect(
			githubTagFailure('0.1.3', { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.1.2' }),
		).toContain('v0.1.3');
	});
});

describe('published scanner retry policy', () => {
	const spec = '@blackswampai/n8n-nodes-lago@0.1.3';

	it.each([
		`Package ${spec} has failed security checks\nReason: No package metadata found for version 0.1.3`,
		`Package ${spec} has failed security checks\nReason: Analysis failed: Request failed with status code 404`,
		`Could not fetch the source repository recorded in the package's npm provenance (Request failed with status code 404)`,
	])('retries only known registry/provenance propagation output', (output) => {
		expect(isLikelyPropagationFailure(output, spec)).toBe(true);
		expect(isDeterministicSecurityFailure(output, spec)).toBe(false);
	});

	it.each([
		`Package ${spec} has failed security checks\nReason: No package metadata found for version 0.1.1`,
		`Package ${spec} has failed security checks\nESLint violations found at nodes/Lago/Lago.node.ts:1`,
		`Package ${spec} has failed security checks\nReason: unrelated metadata error`,
	])('does not retry deterministic or mismatched failures', (output) => {
		expect(isLikelyPropagationFailure(output, spec)).toBe(false);
		expect(isDeterministicSecurityFailure(output, spec)).toBe(true);
	});
});

const temporaryDirectories: string[] = [];
afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

describe('npm authentication preparation', () => {
	it('preserves token bootstrap configuration when explicitly provided', () => {
		const directory = mkdtempSync(join(tmpdir(), 'lago-auth-test-'));
		temporaryDirectories.push(directory);
		const config = join(directory, '.npmrc');
		const contents = '//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\nprovenance=true\n';
		writeFileSync(config, contents);
		expect(prepareNpmAuth({ NODE_AUTH_TOKEN: 'present', NPM_CONFIG_USERCONFIG: config })).toBe(
			'token',
		);
		expect(readFileSync(config, 'utf8')).toBe(contents);
	});

	it('removes only the empty setup-node placeholder for OIDC', () => {
		const directory = mkdtempSync(join(tmpdir(), 'lago-auth-test-'));
		temporaryDirectories.push(directory);
		const config = join(directory, '.npmrc');
		writeFileSync(
			config,
			'registry=https://registry.npmjs.org/\n//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\nprovenance=true\n',
		);
		expect(prepareNpmAuth({ NODE_AUTH_TOKEN: '', NPM_CONFIG_USERCONFIG: config })).toBe('oidc');
		expect(readFileSync(config, 'utf8')).toBe(
			'registry=https://registry.npmjs.org/\nprovenance=true\n',
		);
	});
});

describe('compiled credential wiring invariant', () => {
	it('rejects registered credentials that no loaded node references', () => {
		expect(() =>
			assertRegisteredCredentialsAreWired(
				[{ description: { credentials: [{ name: 'usedCredential' }] } }],
				[{ name: 'usedCredential' }, { name: 'orphanedCredential' }],
			),
		).toThrow('Registered credential types are not referenced by a node: orphanedCredential');
	});

	it('allows built-in references while requiring package credentials', () => {
		expect(() =>
			assertRegisteredCredentialsAreWired(
				[
					{
						description: {
							credentials: [{ name: 'packageCredential' }, { name: 'httpBasicAuth' }],
						},
					},
				],
				[{ name: 'packageCredential' }],
			),
		).not.toThrow();
	});
});
