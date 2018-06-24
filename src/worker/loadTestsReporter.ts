import * as fs from 'fs';
import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";
import * as RegExpEscape from 'escape-string-regexp';

export class LoadTestsReporter implements jasmine.CustomReporter {

	private readonly rootSuite: TestSuiteInfo;
	private readonly suiteStack: TestSuiteInfo[];
	private readonly fileContent: string;

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

		this.fileContent = fs.readFileSync(testFile, 'utf8');
	}

	suiteStarted(result: jasmine.CustomReporterResult): void {

		const suite: TestSuiteInfo = {
			type: 'suite',
			id: result.fullName,
			label: result.description,
			file: this.testFile,
			line: this.findLineContaining(result.description),
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
			file: this.testFile,
			line: this.findLineContaining(result.description)
		}

		this.currentSuite.children.push(test);
	}

	jasmineDone(runDetails: jasmine.RunDetails): void {
		this.sort(this.rootSuite);
		this.done(this.rootSuite);
	}

	private findLineContaining(needle: string): number | undefined {

		const index = this.fileContent.search(RegExpEscape(needle));
		if (index < 0) return undefined;

		return this.fileContent.substr(0, index).split('\n').length - 1;
	}

	private sort(suite: TestSuiteInfo): void {

		suite.children.sort((a, b) => {
			if ((a.line !== undefined) && (b.line !== undefined) && (a.line !== b.line)) {
				return a.line - b.line;
			} else {
				return a.label.localeCompare(b.label);
			}
		});

		for (const child of suite.children) {
			if (child.type === 'suite') {
				this.sort(child);
			}
		}
	}
}
