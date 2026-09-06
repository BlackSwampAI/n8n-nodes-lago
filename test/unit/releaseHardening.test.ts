import { describe, expect, it } from 'vitest';
import { githubTagFailure } from '../../scripts/release-check-lib.mjs';
import {
	isDeterministicSecurityFailure,
	isLikelyPropagationFailure,
} from '../../scripts/scan-policy.mjs';

describe('release tag validation', () => {
	it('allows local and pull-request refs', () => {
		expect(githubTagFailure('0.1.2', {})).toBeUndefined();
		expect(
			githubTagFailure('0.1.2', {
				GITHUB_REF_TYPE: 'branch',
				GITHUB_REF: 'refs/pull/12/merge',
				GITHUB_REF_NAME: '12/merge',
			}),
		).toBeUndefined();
	});

	it('accepts only the matching true tag', () => {
		expect(
			githubTagFailure('0.1.2', { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.1.2' }),
		).toBeUndefined();
		expect(
			githubTagFailure('0.1.2', { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.1.1' }),
		).toContain('v0.1.2');
	});
});

describe('published scanner retry policy', () => {
	const spec = '@blackswampai/n8n-nodes-lago@0.1.2';

	it.each([
		`Package ${spec} has failed security checks\nReason: No package metadata found for version 0.1.2`,
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
