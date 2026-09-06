export function isLikelyPropagationFailure(output, packageSpec) {
	const version = packageSpec.slice(packageSpec.lastIndexOf('@') + 1);
	const missing = /^Reason: No package metadata found for version (\S+)\s*$/m.exec(output);
	return (
		missing?.[1] === version ||
		/^Reason: Analysis failed: Request failed with status code 404\s*$/m.test(output) ||
		/Could not fetch the source repository recorded in the package's npm provenance \(Request failed with status code 404\)/.test(
			output,
		)
	);
}
export function isDeterministicSecurityFailure(output, packageSpec) {
	return (
		/ESLint violations found|malware|prohibited dependency/i.test(output) ||
		(output.includes(`Package ${packageSpec} has failed security checks`) &&
			!isLikelyPropagationFailure(output, packageSpec))
	);
}
