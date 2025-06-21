import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";
import { Location } from "./patchJasmine";

export class LoadTestsReporter implements jasmine.CustomReporter {

	private readonly rootSuite: TestSuiteInfo;
	private readonly suiteStack: TestSuiteInfo[];

	private get currentSuite(): TestSuiteInfo {
		return this.suiteStack[this.suiteStack.length - 1];
	}

	constructor(
		private readonly onDone: (result: TestSuiteInfo) => Promise<void>,
		private readonly locations: Map<string, Location>
	) {
		this.rootSuite = {
			type: 'suite',
			id: 'root',
			label: 'Jasmine',
			file: '.',
			children: [],
		};

		this.suiteStack = [ this.rootSuite ];
	}

	suiteStarted(result: jasmine.SuiteResult): void {
		const suite: TestSuiteInfo = {
			type: 'suite',
			id: result.fullName,
			label: result.description,
			children: []
		};

		const location = this.locations.get(result.id);
		if (location) {
			suite.file = location.file;
			suite.line = location.line;
		}
		this.currentSuite.children.push(suite);
		this.suiteStack.push(suite);
	}

	suiteDone() {
		this.currentSuite.children.sort((a, b) => {
			return a.label.toLocaleLowerCase() < b.label.toLocaleLowerCase() ? -1 : 1;
		});
		this.suiteStack.pop();
	}

	specStarted(result: jasmine.SpecResult): void {
		const test: TestInfo = {
			type: 'test',
			id: result.fullName,
			label: result.description,
			skipped: !!result.pendingReason
		}

		const location = this.locations.get(result.id);
		if (location) {
			test.line = location.line,
			test.file = location.file
		} else {
			console.log('Could not find location for spec', result.fullName);
		}

		this.currentSuite.children.push(test);
	}

	jasmineDone(_: jasmine.JasmineDoneInfo, done: () => void): void | Promise<void> {
		this.onDone(this.rootSuite).then(done);
	}
}
