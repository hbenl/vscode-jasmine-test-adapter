import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";

export class LoadTestsReporter implements jasmine.CustomReporter {

	private readonly rootSuite: TestSuiteInfo;
	private readonly suiteStack: TestSuiteInfo[];

	private get currentSuite(): TestSuiteInfo {
		return this.suiteStack[this.suiteStack.length - 1];
	}

	constructor(
		private readonly testFile: string,
		private readonly done: (result: TestSuiteInfo) => void
	) {
		this.rootSuite = {
			type: 'suite',
			id: testFile,
			label: '',
			children: [],
			file: testFile
		};
		this.suiteStack = [ this.rootSuite ];
	}

	suiteStarted(result: jasmine.CustomReporterResult): void {

		const suite: TestSuiteInfo = {
			type: 'suite',
			id: result.fullName,
			label: result.description,
			file: this.testFile,
			children: []
		};

		this.currentSuite.children.push(suite);
		this.suiteStack.push(suite);
	}

	suiteDone(result: jasmine.CustomReporterResult): void {
		this.suiteStack.pop();
	}

	specDone(result: jasmine.CustomReporterResult): void {

		const test: TestInfo = {
			type: 'test',
			id: result.fullName,
			label: result.description,
			file: this.testFile
		}

		this.currentSuite.children.push(test);
	}

	jasmineDone(runDetails: jasmine.RunDetails): void {
		this.done(this.rootSuite);
	}
}
