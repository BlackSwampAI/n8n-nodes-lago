#!/usr/bin/env node
// Regenerates nodes/Lago/shared/webhookEventTypes.ts from Lago's own catalogue.
//
// Lago validates the `event_types` field on a webhook endpoint against
// config/webhook_event_types.yml, compiled into the server. No API exposes that list, so the
// node has to carry it — and a carried list goes stale.
//
// The Lago version is read from docker-compose.yml rather than passed in, so the catalogue and
// the server the tests run against cannot drift apart. Run this after bumping that image tag;
// the integration test that sends every event to Lago will fail if you forget.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const OUTPUT = resolve(root, 'nodes/Lago/shared/webhookEventTypes.ts');

function die(message) {
	console.error(`\n✖ ${message}`);
	process.exit(1);
}

/** The Lago version the development stack pins, which is the version to generate against. */
function pinnedLagoVersion() {
	const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8');
	const match = /getlago\/api:(v[\d.]+)/.exec(compose);
	if (!match) die('Could not find the getlago/api image tag in docker-compose.yml');
	return match[1];
}

async function fetchCatalogue(version) {
	const url = `https://raw.githubusercontent.com/getlago/lago-api/${version}/config/webhook_event_types.yml`;
	const response = await fetch(url);
	if (!response.ok) {
		die(`Could not fetch the catalogue for ${version} (${response.status}). Check the tag exists.`);
	}
	return response.text();
}

/**
 * Parses the entries out of the YAML.
 *
 * Deliberately a regular expression rather than a YAML parser: the file is a flat map of fixed
 * shape, and this script must not add a dependency to a package that ships none.
 */
function parseEvents(yaml) {
	const pattern =
		/^(\w+):\n {2}name: (\S+)\n {2}description: (.*)\n {2}category: (.*)\n {2}deprecated: (\w+)/gm;

	const events = [];
	for (const match of yaml.matchAll(pattern)) {
		const [, , name, description, category, deprecated] = match;
		if (deprecated === 'true') continue;
		events.push({ name, description: description.trim().replace(/^"|"$/g, ''), category });
	}
	return events.sort(
		(a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
	);
}

function render(events, version) {
	const entries = events
		.map((event) => {
			const description = event.description.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
			return `\t{\n\t\tname: '${event.category} — ${event.name}',\n\t\tvalue: '${event.name}',\n\t\tdescription: '${description}',\n\t},`;
		})
		.join('\n');

	return `import type { INodePropertyOptions } from 'n8n-workflow';

/**
 * Every webhook event Lago can send, as the \`event_types\` field accepts them.
 *
 * GENERATED FILE — do not edit by hand. Run \`npm run generate:webhook-events\` after changing
 * the Lago image tag in docker-compose.yml. Generated from Lago ${version}.
 *
 * Three things make this list worth carrying rather than deriving:
 *
 * - The names are **dotted**. The OpenAPI specification documents the same events with
 *   underscores (\`invoice_created\`), and Lago rejects that form outright with
 *   \`event_types: contains invalid types\`.
 * - There is no API that lists them, so a dropdown cannot be loaded at runtime.
 * - The list grows between releases. Generating from the repository's default branch offered
 *   nine events a v1.51.0 server rejects, so it is pinned to the version the stack runs. A newer
 *   Lago may accept events beyond this list; it will never reject one that is in it.
 *
 * Deprecated events are excluded. Names are prefixed with Lago's own category so the list reads
 * as grouped in n8n's multi-select, which has no grouping of its own.
 */
export const WEBHOOK_EVENT_TYPES: INodePropertyOptions[] = [
${entries}
];
`;
}

const version = pinnedLagoVersion();
const events = parseEvents(await fetchCatalogue(version));

if (events.length === 0) die('Parsed no events. The catalogue format has probably changed.');

writeFileSync(OUTPUT, render(events, version), 'utf8');

console.log(`✔ Wrote ${events.length} events from Lago ${version}`);
console.log('  Run `npx prettier --write` on the file, then `npm run test:integration`.');
