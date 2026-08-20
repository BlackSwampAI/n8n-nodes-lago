// Environment access lives here, in JavaScript, on purpose.
//
// The n8n community-node lint rules ban the `process` global in .ts files, and strict mode
// forbids scoping those rules to nodes/ and credentials/. Keeping the one place that reads
// environment variables in a .mjs module lets the test suite stay TypeScript everywhere else.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function fromEnvFile() {
	const path = resolve(import.meta.dirname, '../../.env.test');
	if (!existsSync(path)) return {};

	const values = {};
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
		if (match) values[match[1]] = match[2];
	}
	return values;
}

const fileValues = fromEnvFile();

/** Base URL of the Lago instance under test, or undefined when none is configured. */
export const lagoBaseUrl = process.env.LAGO_BASE_URL ?? fileValues.LAGO_BASE_URL;

/** API key for the Lago instance under test, or undefined when none is configured. */
export const lagoApiKey = process.env.LAGO_API_KEY ?? fileValues.LAGO_API_KEY;

/** True when a Lago instance is configured, so integration tests can skip instead of fail. */
export const hasLago = Boolean(lagoBaseUrl && lagoApiKey);
