import { describe, expect, it } from 'vitest';
import { LagoTrigger } from '../../nodes/Lago/LagoTrigger.node';
import { WEBHOOK_EVENT_TYPES } from '../../nodes/Lago/shared/webhookEventTypes';
import { registeredNodes } from '../support/manifest.mjs';

const trigger = new LagoTrigger();
const description = trigger.description;

function property(name: string) {
	return description.properties.find((entry) => entry.name === name);
}

describe('trigger shape', () => {
	it('is a trigger with no input and one webhook', () => {
		expect(description.group).toEqual(['trigger']);
		expect(description.inputs).toEqual([]);
		expect(description.webhooks).toHaveLength(1);
		expect(description.webhooks?.[0].httpMethod).toBe('POST');
	});

	// A trigger is started by Lago rather than called by a model, and the type only admits true.
	it('is not offered as a tool', () => {
		expect(description.usableAsTool).toBeUndefined();
	});

	it('is registered in package.json so n8n loads it', () => {
		expect(registeredNodes).toContain('dist/nodes/Lago/LagoTrigger.node.js');
	});

	it('uses the same credential as the action node', () => {
		expect((description.credentials ?? []).map((entry) => entry.name)).toEqual(['lagoApi']);
	});
});

describe('event selection', () => {
	// Lago filters server-side, so a narrow subscription means the workflow is never woken for
	// events it would only discard.
	it('offers the same catalogue the Webhook Endpoint resource does', () => {
		expect(property('events')?.options).toHaveLength(WEBHOOK_EVENT_TYPES.length);
	});

	it('requires at least one event to be chosen', () => {
		expect(property('events')?.required).toBe(true);
	});

	it('says that Lago does the filtering', () => {
		expect(property('events')?.description).toMatch(/filters these on its side/i);
	});
});

describe('signature verification', () => {
	// JWT needs nothing configured; HMAC needs a key copied out of the Lago app.
	it('defaults to the algorithm that needs no extra configuration', () => {
		expect(property('signatureAlgorithm')?.default).toBe('jwt');
	});

	it('says HMAC needs the key on the credential', () => {
		const options = (property('signatureAlgorithm')?.options ?? []) as Array<{
			value: string;
			description?: string;
		}>;
		expect(options.find((option) => option.value === 'hmac')?.description).toMatch(
			/Webhook HMAC Key set on the credential/i,
		);
	});
});

describe('delivery handling options', () => {
	// Lago retries three times on a non-2xx, and the workflow may have succeeded before whatever
	// caused the non-2xx.
	it('deduplicates repeat deliveries by default', () => {
		const options = (property('options')?.options ?? []) as Array<{
			name: string;
			default?: unknown;
			description?: string;
		}>;
		const deduplicate = options.find((option) => option.name === 'deduplicate');
		expect(deduplicate?.default).toBe(true);
		expect(deduplicate?.description).toMatch(/retries up to three times/i);
	});
});

describe('endpoint lifecycle', () => {
	it('implements all three webhook lifecycle methods', () => {
		expect(Object.keys(trigger.webhookMethods.default).sort()).toEqual([
			'checkExists',
			'create',
			'delete',
		]);
	});
});
