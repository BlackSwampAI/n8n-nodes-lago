import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class LagoApi implements ICredentialType {
	name = 'lagoApi';

	displayName = 'Lago API';

	icon: Icon = { light: 'file:../icons/lago.svg', dark: 'file:../icons/lago.dark.svg' };

	documentationUrl = 'https://docs.getlago.com/api-reference/intro';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.getlago.com',
			required: true,
			placeholder: 'https://api.getlago.com',
			description:
				'Root URL of your Lago instance, without the /api/v1 path. Use https://api.getlago.com for Lago Cloud (US), https://api.eu.getlago.com for the EU cluster, or your own URL when self-hosting.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'A Lago API key, found in the Lago app under Developers > API keys. Rate limits apply per organization, so all keys share one budget.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{ $credentials.apiKey }}',
			},
		},
	};

	// Self-hosted users routinely paste either the host root or the full API root, so a
	// trailing /api/v1 is stripped before it is appended again. Without this, one of the two
	// spellings silently produces /api/v1/api/v1 and every request 404s.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{ $credentials.baseUrl.replace(/\\/+$/, "").replace(/\\/api\\/v1$/, "") }}',
			url: '/api/v1/billing_entities',
			method: 'GET',
		},
	};
}
