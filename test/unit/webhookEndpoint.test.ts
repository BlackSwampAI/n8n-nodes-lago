import { describe, expect, it } from 'vitest';
import { Lago } from '../../nodes/Lago/Lago.node';
import { WEBHOOK_EVENT_TYPES } from '../../nodes/Lago/shared/webhookEventTypes';
import {
	SIGNATURE_ALGOS,
	webhookEndpointOperations,
} from '../../nodes/Lago/resources/webhookEndpoint';

const properties = new Lago().description.properties;

function fieldFor(name: string, operation: string) {
	return properties.find(
		(property) =>
			property.name === name &&
			property.displayOptions?.show?.resource?.includes('webhookEndpoint') &&
			property.displayOptions?.show?.operation?.includes(operation),
	);
}

describe('webhook endpoint operations', () => {
	it('offers full CRUD', () => {
		expect(Object.keys(webhookEndpointOperations).sort()).toEqual([
			'create',
			'delete',
			'get',
			'getAll',
			'update',
		]);
	});

	// Lago caps an organization at ten endpoints, which a workflow creating one per environment
	// can reach without realising.
	it('warns about the ten-endpoint cap', () => {
		const create = properties
			.filter(
				(property) =>
					property.name === 'operation' &&
					property.displayOptions?.show?.resource?.includes('webhookEndpoint'),
			)
			.flatMap(
				(property) => (property.options ?? []) as Array<{ value: string; description?: string }>,
			)
			.find((option) => option.value === 'create');
		expect(create?.description).toMatch(/at most ten/i);
	});
});

describe('the event catalogue', () => {
	// Carried rather than loaded: there is no API that lists valid event types.
	it('offers the events from the Lago version this node targets', () => {
		expect(WEBHOOK_EVENT_TYPES.length).toBe(65);
	});

	// The OpenAPI specification documents these with underscores and Lago rejects that form.
	it('uses dotted names throughout', () => {
		for (const entry of WEBHOOK_EVENT_TYPES) {
			expect(String(entry.value), String(entry.value)).toMatch(/^[a-z_]+\.[a-z_]+$/);
		}
	});

	it('excludes the deprecated event', () => {
		expect(WEBHOOK_EVENT_TYPES.map((entry) => entry.value)).not.toContain('event.error');
	});

	// n8n's multi-select has no grouping, so the category is carried in the label instead.
	it('prefixes each label with its Lago category', () => {
		for (const entry of WEBHOOK_EVENT_TYPES) {
			expect(String(entry.name), String(entry.value)).toMatch(/ — /);
		}
	});

	it('gives every event a description', () => {
		for (const entry of WEBHOOK_EVENT_TYPES) {
			expect(entry.description, String(entry.value)).toBeTruthy();
		}
	});

	it('has no duplicate values', () => {
		const values = WEBHOOK_EVENT_TYPES.map((entry) => entry.value);
		expect(new Set(values).size).toBe(values.length);
	});

	it('wires the catalogue into the Event Types field', () => {
		const additional = fieldFor('additionalFields', 'create');
		const eventTypes = (
			(additional?.options ?? []) as Array<{ name: string; options?: unknown[] }>
		).find((option) => option.name === 'event_types');
		expect(eventTypes?.options).toHaveLength(WEBHOOK_EVENT_TYPES.length);
	});
});

describe('signature algorithms', () => {
	it('offers both, defaulting to the one that needs no extra configuration', () => {
		expect(SIGNATURE_ALGOS.map((entry) => entry.value)).toEqual(['jwt', 'hmac']);

		const additional = fieldFor('additionalFields', 'create');
		const algo = ((additional?.options ?? []) as Array<{ name: string; default?: unknown }>).find(
			(option) => option.name === 'signature_algo',
		);
		expect(algo?.default).toBe('jwt');
	});

	// The practical difference for whoever has to verify the payload.
	it('says which one needs a key copied out of the Lago app', () => {
		expect(SIGNATURE_ALGOS.find((entry) => entry.value === 'hmac')?.description).toMatch(
			/organization HMAC key/i,
		);
		expect(SIGNATURE_ALGOS.find((entry) => entry.value === 'jwt')?.description).toMatch(
			/automatically/i,
		);
	});
});
