import { TestEvent, TestSuiteEvent } from 'vscode-test-adapter-api';

export class Reporter implements jasmine.CustomReporter {

	constructor(
		private readonly sendMessage: (message: any) => void,
		private readonly testFile: string,
		private readonly testsToReport: string[] | undefined
	) {}

	suiteStarted(result: jasmine.CustomReporterResult): void {

		const event: TestSuiteEvent = {
			type: 'suite',
			suite: {
				type: 'suite',
				id: result.fullName,
				label: result.description,
				file: this.testFile,
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

			const event: TestEvent = {
				type: 'test',
				test: {
					type: 'test',
					id: result.fullName,
					label: result.description,
					file: this.testFile
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