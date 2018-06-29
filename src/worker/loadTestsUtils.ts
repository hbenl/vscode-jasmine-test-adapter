import Jasmine = require('jasmine');

export function getStackLineMatching(test: (line: string) => boolean): Location | undefined {
	const err = new Error();
	const stackLines = err.stack!.split('\n');
	let lastFoundLine;
	let found;
	// As long as we have 2 consecutive lines up the stack
	// in our project, that means the it / describe originate from 
	// one of the helpers / global variable, walking up ensure
	// the file location is not where the describe is defined
	// but where it's called in the code
	while (!found && stackLines.length > 0) {
		const line = stackLines.shift()!;
		if (test(line)) {
			lastFoundLine = line;
		} else if (lastFoundLine) {
			found = lastFoundLine;
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
	const projectBaseDir = _jasmine.projectBaseDir;
	const specMatcher = (line: string) => {
		return line.indexOf('Suite.') >= 0 && line.indexOf(projectBaseDir) >= 0;
	};

	const suiteMatcher = (line: string) => {
		return line.indexOf(projectBaseDir) >= 0;
	};

	const specPatch = function(impl: () => any): (name: string, func: any) => any {
		return function(desc: string, func: any): any {
			const location = getStackLineMatching(specMatcher);
			locations[suiteStack.join(' ')+' '+desc] = location as Location;
			return impl.call(_jasmine.env, desc, func);
		}
	}

	const suitePatch = function(impl: () => any): (name: string, func: any) => any {
		return function(name: string, func: any): any {
			suiteStack.push(name);
			const location = getStackLineMatching(suiteMatcher);
			locations[suiteStack.join(' ')] = location as Location;
			const result = impl.call(_jasmine.env, name, func);
			suiteStack.pop();
			return result;
		}
	}

	const patches: { [id: string]: (impl: () => any) => (name: string, func: any) => any} = {
		'it': specPatch,
		'fit': specPatch,
		'describe': suitePatch,
		'xdescribe': suitePatch,
		'fdescribe': suitePatch,
	};

	Object.keys(patches).forEach((key) => {
		const patch = patches[key];
		const impl = (_jasmine.env as any)[key];
		(_jasmine.env as any)[key] = patch(impl);
	});

	return () => locations;
}