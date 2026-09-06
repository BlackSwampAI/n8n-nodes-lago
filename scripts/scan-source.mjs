import { resolve } from 'node:path';
import {
	SOURCE_FILE_PATTERNS,
	analyzePackage,
} from '@n8n/scan-community-package/scanner/scanner.mjs';
const root = resolve(import.meta.dirname, '..');
for (const [label, patterns] of [
	['source', SOURCE_FILE_PATTERNS],
	['built', ['dist/**/*.js', 'package.json']],
]) {
	const result = await analyzePackage(root, patterns);
	if (!result.passed)
		throw new Error(
			`Official scanner ${label} preflight failed: ${result.message}\n${result.details ?? ''}`,
		);
	console.log(`Official scanner ${label} preflight passed`);
}
