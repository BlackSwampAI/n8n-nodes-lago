export function githubTagFailure(version, environment = process.env) {
	if (environment.GITHUB_REF_TYPE !== 'tag') return undefined;
	return environment.GITHUB_REF_NAME === `v${version}`
		? undefined
		: `GitHub tag must exactly match package version v${version}`;
}
