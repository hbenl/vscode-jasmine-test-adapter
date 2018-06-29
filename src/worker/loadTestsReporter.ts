import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";

export class LoadTestsReporter implements jasmine.CustomReporter {

	private readonly rootSuite: TestSuiteInfo;
	private readonly suiteStack: TestSuiteInfo[];

	private get currentSuite(): TestSuiteInfo {
		return this.suiteStack[this.suiteStack.length - 1];
	}

	constructor(
		private readonly done: (result: TestSuiteInfo) => void
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
		// With it's file location
		const description = result.description;
		let suite: TestSuiteInfo;
		try {
			const { name, location } = JSON.parse(description);
			suite = {
				type: 'suite',
				id: name,
				label: name,
				file: location.file,
				line: location.line,
				children: []
			};
		} catch(e) {
			suite = {
				type: 'suite',
				id: result.fullName,
				label: description,
				children: []
			};
		}

		this.currentSuite.children.push(suite);
		this.suiteStack.push(suite);
	}

	suiteDone(result: jasmine.CustomReporterResult): void {
		const suite = this.suiteStack.pop();
		// Emit the suite when have been through it completely
		// This ensure we don't serialize a massive object on done
		if (suite && this.suiteStack.length <= 1) {
			this.done(suite);
		}
	}

	specDone(result: jasmine.CustomReporterResult): void {
		// Desription is an array as injected before 
		const description: any[] = result.description as any;
		const {
			line,
			file
		} = description[1];
		const test: TestInfo = {
			type: 'test',
			id: result.description[0],
			label: result.description[0],
			line: line,
			file: file,
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
