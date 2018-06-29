import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";
import { Location } from "./loadTestsUtils";

export class LoadTestsReporter implements jasmine.CustomReporter {

	private readonly rootSuite: TestSuiteInfo;
	private readonly suiteStack: TestSuiteInfo[];

	private get currentSuite(): TestSuiteInfo {
		return this.suiteStack[this.suiteStack.length - 1];
	}

	constructor(
		private readonly done: (result: TestSuiteInfo) => void,
		private readonly getLocations: () => {[id:string]: Location}
	) {
		this.rootSuite = {
			type: 'suite',
			id: 'root',
			label: '',
			children: [],
		};

		this.suiteStack = [ this.rootSuite ];
	}

	suiteStarted(result: jasmine.CustomReporterResult): void {

		// The suite may be a JSON object, from injection
		const description = result.description;
		const suite: TestSuiteInfo = {
			type: 'suite',
			id: result.fullName,
			label: description,
			children: []
		};

		this.currentSuite.children.push(suite);
		this.suiteStack.push(suite);
	}

	suiteDone(result: jasmine.CustomReporterResult): void {
		const suite = this.suiteStack.pop();
		
		if (suite) {
			const location = this.getLocations()[suite.id];
			if (!location) {
				console.log('Could not find location for suite', suite.id);
			} else {
				suite.file = location.file;
				suite.line = location.line;
			}
		}
		// Emit the suite when have been through it completely
		// This ensure we don't serialize a massive object on done
		if (suite && this.suiteStack.length <= 1) {
			this.done(suite);
		}
	}

	specDone(result: jasmine.CustomReporterResult): void {

		const test: TestInfo = {
			type: 'test',
			id: result.fullName,
			label: result.description
		}

		const location = this.getLocations()[test.id];
		if (!location) {
			console.log('Could not find location for spec', result.fullName);
		} else {
			test.line = location.line,
			test.file = location.file
		}

		this.currentSuite.children.push(test);
	}

	jasmineDone(runDetails: jasmine.RunDetails): void {
		this.sort(this.rootSuite);
		this.done(this.rootSuite);
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
