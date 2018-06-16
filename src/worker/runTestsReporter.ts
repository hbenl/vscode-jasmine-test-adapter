import * as fs from 'fs';
import * as RegExpEscape from 'escape-string-regexp';
import { TestEvent, TestSuiteEvent } from 'vscode-test-adapter-api';

export class RunTestsReporter implements jasmine.CustomReporter {

	private readonly fileContent: string;

	constructor(
		private readonly sendMessage: (message: any) => void,
		private readonly testFile: string,
		private readonly testsToReport: string[] | undefined
	) {
		this.fileContent = fs.readFileSync(testFile, 'utf8');
	}

	suiteStarted(result: jasmine.CustomReporterResult): void {

		const line = findLineContaining(result.description, this.fileContent);

		const event: TestSuiteEvent = {
			type: 'suite',
			suite: {
				type: 'suite',
				id: result.fullName,
				label: result.description,
				file: this.testFile,
				line,
				children: []
			},
			state: 'running'
		};

		this.sendMessage(event);
	}

	suiteDone(result: jasmine.CustomReporterResult): void {

		const event: TestSuiteEvent = {
			type: 'suite',
			suite: result.fullName,
			state: 'completed'
		};

		this.sendMessage(event);
	}

	specStarted(result: jasmine.CustomReporterResult): void {

		if ((this.testsToReport === undefined) ||
			(this.testsToReport.indexOf(result.fullName) >= 0)) {

			const line = findLineContaining(result.description, this.fileContent);

			const event: TestEvent = {
				type: 'test',
				test: {
					type: 'test',
					id: result.fullName,
					label: result.description,
					file: this.testFile,
					line
				},
				state: 'running'
			};
	
			this.sendMessage(event);
		}
	}

	specDone(result: jasmine.CustomReporterResult): void {

		if ((this.testsToReport === undefined) ||
			(this.testsToReport.indexOf(result.fullName) >= 0)) {

			const event: TestEvent = {
				type: 'test',
				test: result.fullName,
				state: convertTestState(result.status)
			};

			this.sendMessage(event);
		}
	}
}

function convertTestState(jasmineState: string | undefined): 'passed' | 'failed' | 'skipped' {

	switch (jasmineState) {

		case 'passed':
		case 'failed':
			return jasmineState;

		case 'pending': // skipped in the source (e.g. using xit() instead of it())
		case 'excluded': // skipped due to test run filter
		default:
			return 'skipped';
	}
}

function findLineContaining(needle: string, haystack: string): number | undefined {

	const index = haystack.search(RegExpEscape(needle));
	if (index < 0) return undefined;

	return haystack.substr(0, index).split('\n').length - 1;
}
