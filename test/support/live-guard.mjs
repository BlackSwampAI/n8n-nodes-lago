export function assertDisposableLagoTarget(environment) {
	const baseUrl = environment.LAGO_BASE_URL?.trim() ?? '';
	const apiKey = environment.LAGO_API_KEY?.trim() ?? '';
	const marker = environment.LAGO_DISPOSABLE_TEST_ENV?.trim() ?? '';
	const configured = [baseUrl, apiKey, marker].filter(Boolean).length;

	if (configured === 0) return undefined;
	if (!baseUrl || !apiKey || marker !== 'true') {
		throw new Error(
			'Lago integration configuration is partial or unsafe; provide a loopback LAGO_BASE_URL, nonblank LAGO_API_KEY, and LAGO_DISPOSABLE_TEST_ENV=true',
		);
	}

	let parsed;
	try {
		parsed = new URL(baseUrl);
	} catch {
		throw new Error('LAGO_BASE_URL must be a valid HTTP(S) loopback URL');
	}
	if (!['http:', 'https:'].includes(parsed.protocol)) {
		throw new Error('LAGO_BASE_URL must use HTTP or HTTPS');
	}
	if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
		throw new Error('LAGO_BASE_URL must target localhost, 127.0.0.1, or [::1]');
	}
	return { baseUrl: parsed.toString().replace(/\/$/, ''), apiKey };
}

export function resolveDisposableLagoEnvironment(processEnvironment, fileValues = {}) {
	return assertDisposableLagoTarget({
		LAGO_BASE_URL: processEnvironment.LAGO_BASE_URL ?? fileValues.LAGO_BASE_URL,
		LAGO_API_KEY: processEnvironment.LAGO_API_KEY ?? fileValues.LAGO_API_KEY,
		LAGO_DISPOSABLE_TEST_ENV:
			processEnvironment.LAGO_DISPOSABLE_TEST_ENV ?? fileValues.LAGO_DISPOSABLE_TEST_ENV,
	});
}
