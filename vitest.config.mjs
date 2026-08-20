// JavaScript rather than TypeScript deliberately: the n8n community-node lint rules apply to
// every .ts file in the repository and cannot be scoped, so a .ts config here would be linted
// as node source. See CONTRIBUTING.md.
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/**/*.test.ts'],
		// Integration tests share one Lago instance, and billing state accumulates — invoices,
		// sequential numbering, usage aggregation. Running files concurrently would make results
		// depend on interleaving.
		fileParallelism: false,
		// Lago does real billing work behind several of these calls, and the first request after
		// a cold boot can be slow.
		testTimeout: 30_000,
	},
});
