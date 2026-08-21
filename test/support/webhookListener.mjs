// A throwaway HTTP listener for the trigger's end-to-end test.
//
// Lives in JavaScript for the same reason as env.mjs: the n8n community-node lint rules
// constrain what .ts files in this package may import, and node:http is one of them.
import { createServer } from 'node:http';

/**
 * Starts a listener that records everything Lago posts to it.
 *
 * @param {(body: Buffer, headers: Record<string, string>) => number} [respondWith]
 *   Status code to answer with, so a test can force Lago's retry behaviour. Defaults to 200.
 */
export async function startWebhookListener(respondWith) {
	/** @type {Array<{ raw: Buffer, headers: Record<string, string> }>} */
	const received = [];

	const server = createServer((request, response) => {
		/** @type {Buffer[]} */
		const chunks = [];
		request.on('data', (chunk) => chunks.push(chunk));
		request.on('end', () => {
			const raw = Buffer.concat(chunks);
			const headers = /** @type {Record<string, string>} */ (request.headers);
			received.push({ raw, headers });
			const status = respondWith ? respondWith(raw, headers) : 200;
			response.writeHead(status);
			response.end();
		});
	});

	await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
	const { port } = /** @type {{ port: number }} */ (server.address());

	return {
		port,
		received,
		/** URL the Lago container can reach the host on. */
		url: `http://host.docker.internal:${port}/hook`,
		/** Waits until at least `count` deliveries have arrived. */
		async waitFor(count, timeoutMs = 30_000) {
			const deadline = Date.now() + timeoutMs;
			while (Date.now() < deadline) {
				if (received.length >= count) return received;
				await new Promise((resolve) => setTimeout(resolve, 250));
			}
			throw new Error(`Expected ${count} delivery/deliveries, got ${received.length}`);
		},
		async close() {
			await new Promise((resolve) => server.close(resolve));
		},
	};
}
