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

export function patchJasmine(_jasmine: Jasmine, projectBaseDir: string): () => {[id:string]: Location} {
	// Monkey patch the it, so we can get the lines
	const suiteStack: string[] = [];
	const it = _jasmine.env.it;
	const locations: {[id:string]: Location} = {};
	_jasmine.env.it = function(desc, func) {

		const location = getStackLineMatching((line) => {
			return line.indexOf('Suite.') >= 0 && line.indexOf(projectBaseDir) >= 0;
		});
		locations[suiteStack.join(' ')+' '+desc] = location as Location;
		return it.call(this, desc, func);
	}

	// Here we need to inject the description in the name
	const describe = _jasmine.env.describe;
	_jasmine.env.describe = function(name, func) {
		suiteStack.push(name);
		const location = getStackLineMatching((line) => {
			return line.indexOf(projectBaseDir) >= 0;
		});
		locations[suiteStack.join(' ')] = location as Location;
		const result = describe.call(_jasmine.env, name, func);
		suiteStack.pop();
		return result;
	}

	return () => {
		return locations;
	}
}