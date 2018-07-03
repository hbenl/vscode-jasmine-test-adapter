import Jasmine = require('jasmine');

export function getStackLineMatching(test: (line: string) => boolean): Location | undefined {
	const err = new Error();
	const stackLines = err.stack!.split('\n');
	let found;
	// Find the line that match the function call (at it, at describe etc...);
	while (stackLines.length > 0) {
		const line = stackLines.shift()!;
		if (test(line)) {
			found = stackLines.shift()!;
			break;
		}
	}

	if (!found) {
		return;
	}
	
	// Walk up until we get out of the spec module to have the higest call site
	// the function may be called by jasmine (inside a Suite), or from the module loader (module.js)
	while (stackLines.length > 0) {
		const nextLine = stackLines.shift()!;
		// Check if after we're inside the module loader or this module
		// Which means we're at the highest point for the stacktrace
		if (nextLine.indexOf('module.js') >= 0
			|| nextLine.indexOf('modules/cjs/loader') >= 0
			|| nextLine.indexOf('lib/jasmine-core') >= 0) {
			break;
		} else {
			found = nextLine;
		}
	}

	// Not found... nothing much we can do
	if (!found) {
		return;
	}

	const components = found.split(':');
	const specLine = components[components.length - 2];
	let file = components[0];
	if (file.indexOf('(') >= 0) {
		file = file.split('(')[1]
	}
	return {
		file,
		line: parseInt(specLine) - 1,
	}
}

export interface Location {
	file: string
	line: number
}

export function patchJasmine(_jasmine: Jasmine): () => {[id:string]: Location} {
	// Monkey patch the it, so we can get the lines
	const suiteStack: string[] = [];
	const locations: {[id:string]: Location} = {};
	const getMatcher = (element: string) => {
		return (line: string) => {
			return line.indexOf(`at ${element}`) >= 0;
		};
	}

	function getSuitePrefix() {
		if (suiteStack.length > 0) {
			return suiteStack.join(' ')+' ';
		}
		return '';
	}

	const specPatch = function(impl: () => any, functionKey: string): (name: string, func: any) => any {
		return function(desc: string, func: any): any {
			const location = getStackLineMatching(getMatcher(functionKey));
			if (location) {
				locations[getSuitePrefix()+desc] = location as Location;
			}
			return impl.call(_jasmine.env, desc, func);
		}
	}

	const suitePatch = function(impl: () => any, functionKey: string): (name: string, func: any) => any {
		return function(name: string, func: any): any {
			suiteStack.push(name);
			const location = getStackLineMatching(getMatcher(functionKey));
			locations[suiteStack.join(' ')] = location as Location;
			const result = impl.call(_jasmine.env, name, func);
			suiteStack.pop();
			return result;
		}
	}

	const patches: { [id: string]: (impl: () => any, functionKey: string) => (name: string, func: any) => any} = {
		'it': specPatch,
		'fit': specPatch,
		'xit': specPatch,
		'describe': suitePatch,
		'xdescribe': suitePatch,
		'fdescribe': suitePatch,
	};

	Object.keys(patches).forEach((key) => {
		const patch = patches[key];
		const impl = (_jasmine.env as any)[key];
		(_jasmine.env as any)[key] = patch(impl, key);
	});

	return () => locations;
}