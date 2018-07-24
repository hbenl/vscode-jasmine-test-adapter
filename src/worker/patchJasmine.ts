import Jasmine = require('jasmine');
import { parse as parseStackTrace } from 'stack-trace';

export interface Location {
	file: string
	line: number
}

export function patchJasmine(jasmine: Jasmine): Map<string, Location> {

	const locations = new Map<string, Location>();
	const env: any = jasmine.env;

	// monkey patch the suite and spec functions to detect the locations from which they were called
	for (const functionName of ['describe', 'fdescribe', 'xdescribe', 'it', 'fit', 'xit']) {

		const origImpl = env[functionName];
		env[functionName] = function() {

			const result = origImpl.apply(this, arguments);

			const location = findCallLocation(functionName);
			if (location) {
				locations.set(result.id, location);
			}

			return result;
		}
	}

	return locations;
}

function findCallLocation(functionName: string): Location | undefined {

	const stackTrace = parseStackTrace(new Error());

	for (var i = 0; i < stackTrace.length - 1; i++) {
		if (stackTrace[i].getFunctionName() === functionName) {
			const callSite = stackTrace[i + 1];
			return {
				file: callSite.getFileName(),
				line: callSite.getLineNumber() - 1
			};
		}
	}

	return undefined;
}
