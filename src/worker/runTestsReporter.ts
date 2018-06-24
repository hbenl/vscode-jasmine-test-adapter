import { TestEvent } from 'vscode-test-adapter-api';

export class RunTestsReporter implements jasmine.CustomReporter {

	constructor(
		private readonly sendMessage: (message: any) => void,
		private readonly testsToReport: string[] | undefined
	) {}

	specStarted(result: jasmine.CustomReporterResult): void {

		if ((this.testsToReport === undefined) ||
			(this.testsToReport.indexOf(result.fullName) >= 0)) {

			const event: TestEvent = {
				type: 'test',
				test: result.fullName,
				state: 'running'
			};
	
			this.sendMessage(event);
		}
	}

	specDone(result: jasmine.CustomReporterResult): void {

		if ((this.testsToReport === undefined) ||
			(this.testsToReport.indexOf(result.fullName) >= 0)) {

			let message: string | undefined;
			if (result.failedExpectations) {
				message = result.failedExpectations.map(failed => failed.stack).join('\n');
			}

			const event: TestEvent = {
				type: 'test',
				test: result.fullName,
				state: convertTestState(result.status),
				message
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
