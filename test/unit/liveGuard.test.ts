import { describe, expect, it } from 'vitest';
import {
	assertDisposableLagoTarget,
	resolveDisposableLagoEnvironment,
} from '../support/live-guard.mjs';

describe('disposable Lago target guard', () => {
	it('skips only when completely unconfigured', () => {
		expect(assertDisposableLagoTarget({})).toBeUndefined();
	});

	it.each([
		[{ LAGO_BASE_URL: 'http://127.0.0.1:3000' }],
		[{ LAGO_API_KEY: 'test-key' }],
		[{ LAGO_DISPOSABLE_TEST_ENV: 'true' }],
		[{ LAGO_BASE_URL: 'http://127.0.0.1:3000', LAGO_DISPOSABLE_TEST_ENV: 'true' }],
		[{ LAGO_BASE_URL: 'ftp://127.0.0.1', LAGO_API_KEY: 'key', LAGO_DISPOSABLE_TEST_ENV: 'true' }],
		[
			{
				LAGO_BASE_URL: 'https://example.com',
				LAGO_API_KEY: 'key',
				LAGO_DISPOSABLE_TEST_ENV: 'true',
			},
		],
	])('rejects partial or unsafe configuration %#', (environment) => {
		expect(() => assertDisposableLagoTarget(environment)).toThrow();
	});

	it.each(['http://localhost:3000', 'https://127.0.0.1:3000', 'http://[::1]:3000'])(
		'accepts marked loopback target %s',
		(baseUrl) => {
			expect(
				assertDisposableLagoTarget({
					LAGO_BASE_URL: baseUrl,
					LAGO_API_KEY: 'test-key',
					LAGO_DISPOSABLE_TEST_ENV: 'true',
				}),
			).toMatchObject({ apiKey: 'test-key' });
		},
	);
});

describe('disposable Lago environment resolution', () => {
	it('accepts all generated values, including the safety marker, from .env.test fallback', () => {
		expect(
			resolveDisposableLagoEnvironment(
				{},
				{
					LAGO_BASE_URL: 'http://localhost:3210',
					LAGO_API_KEY: 'generated-key',
					LAGO_DISPOSABLE_TEST_ENV: 'true',
				},
			),
		).toEqual({ baseUrl: 'http://localhost:3210', apiKey: 'generated-key' });
	});

	it('prefers explicit process values over file values', () => {
		expect(
			resolveDisposableLagoEnvironment(
				{
					LAGO_BASE_URL: 'http://127.0.0.1:4321',
					LAGO_API_KEY: 'process-key',
					LAGO_DISPOSABLE_TEST_ENV: 'true',
				},
				{
					LAGO_BASE_URL: 'http://localhost:3210',
					LAGO_API_KEY: 'file-key',
					LAGO_DISPOSABLE_TEST_ENV: 'false',
				},
			),
		).toEqual({ baseUrl: 'http://127.0.0.1:4321', apiKey: 'process-key' });
	});
});
