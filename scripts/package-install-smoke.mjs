import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'lago-package-smoke-'));
try {
	const [{ filename }] = JSON.parse(
		execFileSync('npm', ['pack', '--json', '--pack-destination', temporary], {
			cwd: root,
			encoding: 'utf8',
		}),
	);
	const consumer = join(temporary, 'consumer');
	mkdirSync(consumer);
	writeFileSync(join(consumer, 'package.json'), '{"name":"lago-smoke","private":true}\n');
	execFileSync(
		'npm',
		[
			'install',
			'--ignore-scripts',
			'--no-package-lock',
			'--omit=peer',
			'--no-audit',
			'--no-fund',
			join(temporary, filename),
		],
		{ cwd: consumer, stdio: 'pipe' },
	);
	const installed = join(consumer, 'node_modules', '@blackswampai', 'n8n-nodes-lago');
	execFileSync(process.execPath, [resolve(root, 'scripts/node-load-smoke.mjs'), installed], {
		cwd: consumer,
		stdio: 'inherit',
		env: { ...process.env, NODE_PATH: resolve(root, 'node_modules') },
	});
	console.log('Packed Lago package installed and loaded in an isolated consumer');
} finally {
	rmSync(temporary, { recursive: true, force: true });
}
