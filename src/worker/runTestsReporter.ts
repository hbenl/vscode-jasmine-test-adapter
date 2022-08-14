import { JasmineTestEvent, JasmineFailedExpectation } from '../shared';

export class RunTestsReporter implements jasmine.CustomReporter {

	constructor(
		private readonly sendMessage: (message: any) => void,
		private readonly testsToReport: string[] | undefined
	) {}

	specStarted(result: jasmine.CustomReporterResult): void {

		if ((this.testsToReport === undefined) ||
			(this.testsToReport.indexOf(result.fullName) >= 0)) {

			const event: JasmineTestEvent = {
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
			let failures: JasmineFailedExpectation[] | undefined;
			let message: string | undefined;
			if (result.failedExpectations) {
				failures = result.failedExpectations.map(failure => {
					let stack = failure.stack;
					if (stack && stack.match(/^\s+at/)) {
						stack = failure.message + "\n" + stack;
					}
					return { stack, message: failure.message };
				});
				message = failures.map(failure => failure.stack).join('\n');
			}

			const state = convertTestState(result.status);
			const event: JasmineTestEvent = {
				type: 'test',
				test: result.fullName,
				state: convertTestState(result.status),
				message,
			}
			if ((state === 'failed') && failures) {
				event.failures = failures;
			}

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
