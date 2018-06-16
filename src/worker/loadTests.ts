import Jasmine = require('jasmine');
import { TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';

const sendMessage = process.send ? (message: any) => process.send!(message) : () => {};

const configFile = process.argv[2];
const testFile = process.argv[3];

const rootSuite: TestSuiteInfo = {
	type: 'suite',
	id: testFile,
	label: '',
	children: [],
	file: testFile
};
const suiteStack: TestSuiteInfo[] = [ rootSuite ];
function getCurrentSuite(): TestSuiteInfo {
	return suiteStack[suiteStack.length - 1];
}

class Reporter implements jasmine.CustomReporter {

	suiteStarted(result: jasmine.CustomReporterResult): void {
		const currentSuite = getCurrentSuite();
		const suite: TestSuiteInfo = {
			type: 'suite',
			id: result.fullName,
			label: result.description,
			file: testFile,
			children: []
		};
		currentSuite.children.push(suite);
		suiteStack.push(suite);
	}

	suiteDone(result: jasmine.CustomReporterResult): void {
		suiteStack.pop();
	}

	specDone(result: jasmine.CustomReporterResult): void {
		const currentSuite = getCurrentSuite();
		const test: TestInfo = {
			type: 'test',
			id: result.fullName,
			label: result.description,
			file: testFile
		}
		currentSuite.children.push(test);
	}

	jasmineDone(runDetails: jasmine.RunDetails): void {
		sendMessage(rootSuite);
	}
}

const _jasmine = new Jasmine({});
jasmine.getEnv().addReporter(new Reporter());
_jasmine.loadConfigFile(configFile);
_jasmine.execute([ testFile ], '$^');
