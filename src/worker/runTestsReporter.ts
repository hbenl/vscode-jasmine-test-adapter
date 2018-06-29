import { TestEvent } from 'vscode-test-adapter-api';

export class RunTestsReporter implements jasmine.CustomReporter {

	constructor(
		private readonly sendMessage: (message: any) => void,
		private readonly testsToReport: string[] | undefined
	) {}

	specStarted(result: jasmine.CustomReporterResult): void {
		if ((this.testsToReport === undefined) ||
			(this.testsToReport.indexOf(result.description) >= 0)) {

			const event: TestEvent = {
				type: 'test',
				test: result.description,
				state: 'running'
			};
	
			this.sendMessage(event);
		}
	}

	// Confirmance to jasmine.Report
	reportRunnerStarting(runner: jasmine.Runner): void {}
	reportRunnerResults(runner: jasmine.Runner): void {}
	reportSuiteResults(suite: jasmine.Suite): void {}
	reportSpecStarting(spec: jasmine.Spec): void {}
	reportSpecResults(spec: jasmine.Spec): void {}
	log(str: string): void {}

	specDone(result: jasmine.CustomReporterResult): void {
		if ((this.testsToReport === undefined) ||
			(this.testsToReport.indexOf(result.description) >= 0)) {

			let message: string | undefined;
			if (result.failedExpectations) {
				message = result.failedExpectations.map(failed => failed.stack).join('\n');
			}

			const state = convertTestState(result.status);
			let event: TestEvent
			if (state === 'failed') {
				const f: FailedTestEvent = {
					type: 'test',
					test: result.description,
					state: convertTestState(result.status),
					message,
					failures: result.failedExpectations
				};
				event = f;
			} else {
				event = {
					type: 'test',
					test: result.description,
					state: convertTestState(result.status),
					message,
				};
			}

			this.sendMessage(event);
		}
	}
}

interface FailedTestEvent extends TestEvent {
	failures: jasmine.FailedExpectation[] | undefined
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
