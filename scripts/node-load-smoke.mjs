import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export function assertRegisteredCredentialsAreWired(nodes, credentials) {
	const referencedCredentials = new Set(
		nodes.flatMap((node) =>
			(node.description.credentials ?? []).map((credential) => credential.name),
		),
	);
	const orphaned = credentials
		.map((credential) => credential.name)
		.filter((name) => !referencedCredentials.has(name));
	if (orphaned.length > 0)
		throw new Error(
			`Registered credential types are not referenced by a node: ${orphaned.join(', ')}`,
		);
}

function loadRegistration(packageRoot, registration, kind) {
	const moduleExports = require(resolve(packageRoot, registration));
	const constructors = Object.values(moduleExports).filter(
		(value) => typeof value === 'function' && value.prototype,
	);
	for (const Constructor of constructors) {
		const instance = new Constructor();
		if (kind === 'node' && instance.description?.name) return instance;
		if (kind === 'credential' && instance.name) return instance;
	}
	throw new Error(`No loadable ${kind} export found in ${registration}`);
}

export function assertRegistrationIcons(packageRoot, registration, icon, owner) {
	const references = typeof icon === 'string' ? [icon] : [icon?.light, icon?.dark];
	const declaredReferences = references.filter(Boolean);
	if (declaredReferences.length === 0) throw new Error(`Packaged icon is required for ${owner}`);
	for (const reference of declaredReferences) {
		if (!reference.startsWith('file:'))
			throw new Error(`Packaged icon must use a file: SVG or PNG reference: ${reference}`);
		const path = resolve(packageRoot, registration, '..', reference.slice(5));
		const pathFromRoot = relative(packageRoot, path);
		if (pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot))
			throw new Error(`Packaged icon escapes the package root for ${owner}: ${reference}`);
		if (!existsSync(path) || statSync(path).size === 0)
			throw new Error(`Packaged icon is missing or empty for ${owner}: ${reference}`);
		if (!/\.(?:svg|png)$/i.test(path))
			throw new Error(`Packaged icon must be SVG or PNG: ${reference}`);
		if (/\.svg$/i.test(path)) {
			const match = /<svg\b[^>]*\bviewBox=["']([^"']+)["']/i.exec(readFileSync(path, 'utf8'));
			const values =
				match?.[1]
					.trim()
					.split(/[\s,]+/)
					.map(Number) ?? [];
			if (values.length !== 4 || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0)
				throw new Error(`Packaged SVG icon needs a usable viewBox: ${reference}`);
		}
	}
}

export function runNodeLoadSmoke(packageRoot) {
	const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
	const nodes = (packageJson.n8n?.nodes ?? []).map((registration) =>
		loadRegistration(packageRoot, registration, 'node'),
	);
	const credentials = (packageJson.n8n?.credentials ?? []).map((registration) =>
		loadRegistration(packageRoot, registration, 'credential'),
	);
	if (nodes.length === 0) throw new Error('No compiled nodes are registered');
	assertRegisteredCredentialsAreWired(nodes, credentials);
	for (const [index, node] of nodes.entries()) {
		if (!node.description.displayName || !node.description.version)
			throw new Error('A compiled node has incomplete description metadata');
		assertRegistrationIcons(
			packageRoot,
			packageJson.n8n.nodes[index],
			node.description.icon,
			node.description.name,
		);
	}
	for (const [index, credential] of credentials.entries())
		assertRegistrationIcons(
			packageRoot,
			packageJson.n8n.credentials[index],
			credential.icon,
			credential.name,
		);
	return { nodeCount: nodes.length, credentialCount: credentials.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const packageRoot = process.argv[2]
		? resolve(process.argv[2])
		: resolve(import.meta.dirname, '..');
	const { nodeCount, credentialCount } = runNodeLoadSmoke(packageRoot);
	console.log(
		`Loaded ${nodeCount} compiled node(s) and ${credentialCount} wired credential type(s) from package registrations`,
	);
}
