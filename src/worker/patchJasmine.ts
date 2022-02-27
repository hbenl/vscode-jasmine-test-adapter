import Jasmine = require('jasmine');
import * as stackTrace from 'stack-trace';
import { IMinimatch, Minimatch } from 'minimatch';

export interface Location {
	file: string
	line: number
}

export function patchJasmine(jasmine: Jasmine, globPatterns: string[]): Map<string, Location> {

	const globs = globPatterns.map(pattern => new Minimatch(pattern));
	const locations = new Map<string, Location>();
	const env: any = jasmine.env;

	// monkey patch the suite and spec functions to detect the locations from which they were called
	for (const functionName of ['describe', 'fdescribe', 'xdescribe', 'it', 'fit', 'xit']) {

		const origImpl = env[functionName];
		env[functionName] = function() {

			const result = origImpl.apply(this, arguments);

			const location = findCallLocation(globs, functionName);
			if (location) {
				locations.set(result.id, location);
			}

			return result;
		}
	}

	return locations;
}

function findCallLocation(globs: IMinimatch[], functionName: string): Location | undefined {

	const stackFrames = stackTrace.parse(new Error());

	for (const callSite of stackFrames) {
		if (globs.some(glob => glob.match(callSite.getFileName()))) {
			return {
				file: callSite.getFileName(),
				line: callSite.getLineNumber() - 1
			};
		}
	}

	for (var i = 0; i < stackFrames.length - 1; i++) {
		if (stackFrames[i].getFunctionName() === functionName) {
			const callSite = stackFrames[i + 1];
			return {
				file: callSite.getFileName(),
				line: callSite.getLineNumber() - 1
			};
		}
	}

	return undefined;
}
