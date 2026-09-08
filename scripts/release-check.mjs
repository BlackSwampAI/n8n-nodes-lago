import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { githubTagFailure } from './release-check-lib.mjs';
const root = resolve(import.meta.dirname, '..');
const failures = [];
const fail = (message) => failures.push(message);
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const ci = read('.github/workflows/ci.yml');
const publish = read('.github/workflows/publish.yml');
const readme = read('README.md');
const lagoNode = read('nodes/Lago/Lago.node.ts');
let marker;
try {
	marker = JSON.parse(read('.blackswamp/template.json'));
} catch {
	fail('Template marker must be valid JSON');
}
if (
	JSON.stringify(marker) !==
	JSON.stringify({
		schemaVersion: 1,
		templateVersion: '2.1.0',
		sourceRepository: 'https://github.com/christopherjnelson/n8n-community-node-template',
	})
)
	fail('Template v2.1 marker is invalid');
if (
	pkg.name !== '@blackswampai/n8n-nodes-lago' ||
	pkg.homepage !== 'https://blackswampai.com/n8n-nodes/lago/' ||
	pkg.repository?.url !== 'https://github.com/BlackSwampAI/n8n-nodes-lago.git' ||
	pkg.bugs?.url !== 'https://github.com/BlackSwampAI/n8n-nodes-lago/issues'
)
	fail('Package identity/URLs are invalid');
if (
	!/^\d+\.\d+\.\d+$/.test(pkg.version) ||
	lock.version !== pkg.version ||
	lock.packages?.['']?.version !== pkg.version
)
	fail('Package and lock versions must match plain semver');
if (pkg.packageManager !== 'npm@11.19.0' || pkg.engines?.node !== '>=22.22.0')
	fail('Node/npm baseline is invalid');
for (const [dependency, version] of [
	['@n8n/node-cli', '0.46.4'],
	['@n8n/scan-community-package', '0.34.0'],
	['eslint', '9.39.4'],
	['prettier', '3.8.3'],
	['release-it', '20.2.0'],
	['typescript', '5.9.3'],
	['vitest', '4.1.11'],
])
	if (pkg.devDependencies?.[dependency] !== version)
		fail(`${dependency} must be pinned to ${version}`);
if (pkg.allowScripts?.['eslint-plugin-n8n-nodes-base'] !== false)
	fail('eslint-plugin install scripts must be denied');
if (
	Object.keys(pkg.dependencies ?? {}).length ||
	pkg.peerDependencies?.['n8n-workflow'] !== '*' ||
	pkg.n8n?.strict !== true ||
	pkg.license !== 'MIT' ||
	pkg.publishConfig?.access !== 'public'
)
	fail('Runtime/release metadata is invalid');
if (
	!readme.includes('**Settings → Community Nodes**') ||
	!readme.includes(
		'This is an independent community integration and is not affiliated with, endorsed by,',
	)
)
	fail('README manual-install or independence wording is invalid');
if (/requestDefaults\s*:|\brouting\s*:/.test(lagoNode))
	fail('Programmatic Lago action must not expose inactive declarative metadata');
for (const path of [
	'docs/api-matrix.md',
	'docs/testing.md',
	'docs/branding.md',
	'docs/BATCH_HANDOFF_TEMPLATE.md',
	'docs/TEMPLATE_MIGRATIONS.md',
	'AGENTS.md',
	'.github/pull_request_template.md',
	'.github/ISSUE_TEMPLATE/release.md',
	'.codex/config.toml',
	'.codex/agents/builder.toml',
	'scripts/scan-source.mjs',
	'scripts/scan-published.mjs',
	'scripts/prepare-npm-auth.mjs',
	'scripts/verify-npm-version.mjs',
	'scripts/package-check.mjs',
	'scripts/node-load-smoke.mjs',
	'scripts/package-install-smoke.mjs',
	'test/support/live-guard.mjs',
	'test/unit/liveGuard.test.ts',
])
	if (!existsSync(resolve(root, path))) fail(`${path} is required`);
if (!/timeout-minutes:\s*20/.test(ci) || !/timeout-minutes:\s*30/.test(publish))
	fail('Workflow timeouts are missing');
if (!/LAGO_DISPOSABLE_TEST_ENV:\s*['"]true['"]/.test(ci))
	fail('Integration CI must explicitly mark Lago disposable');
if (!/id-token:\s*write/.test(publish) || publish.includes('NPM_TOKEN'))
	fail('Established package must use tokenless OIDC');
for (const workflow of [ci, publish])
	for (const command of [
		'npm install --global npm@11.19.0',
		'npm run build',
		'npm run scan:source',
		'npm run release:check',
		'npm run package:check',
		'npm run smoke:load',
		'npm run smoke:install',
	])
		if (!workflow.includes(command)) fail(`Workflow missing ${command}`);
const [publishJob, verifyPublishedJob = ''] = publish.split(/\n  verify-published:\s*\n/);
if (
	!publishJob.includes('node scripts/prepare-npm-auth.mjs') ||
	!/needs:\s*publish/.test(verifyPublishedJob) ||
	!verifyPublishedJob.includes('npm run scan:published') ||
	publishJob.includes('npm run scan:published') ||
	verifyPublishedJob.includes('npm run release') ||
	/id-token:\s*write/.test(verifyPublishedJob) ||
	!read('scripts/scan-published.mjs').includes('has passed all security checks')
)
	fail('Publish auth/scanner sequence is incomplete');
const tagFailure = githubTagFailure(pkg.version);
if (tagFailure) fail(tagFailure);
if (!new RegExp(`^## \\[${pkg.version.replaceAll('.', '\\.')}\\]`, 'm').test(read('CHANGELOG.md')))
	fail('CHANGELOG lacks current version');
try {
	const originResult = spawnSync('git', ['remote', 'get-url', 'origin'], {
		cwd: root,
		encoding: 'utf8',
	});
	if (!originResult.stdout) throw originResult.error ?? new Error('git returned no origin');
	const origin = originResult.stdout
		.trim()
		.replace(/^git@github\.com:/, 'https://github.com/')
		.replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
		.replace(/\.git$/, '');
	if (origin !== 'https://github.com/BlackSwampAI/n8n-nodes-lago') fail('Git origin is invalid');
} catch {
	fail('Unable to verify git origin');
}
if (failures.length) {
	console.error(`Release audit failed:\n${failures.map((value) => `- ${value}`).join('\n')}`);
	process.exit(1);
}
console.log(`Release audit passed for ${pkg.name}@${pkg.version}`);
