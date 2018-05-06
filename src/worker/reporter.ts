import { TestEvent, TestSuiteEvent } from 'vscode-test-adapter-api';

export class Reporter implements jasmine.CustomReporter {

	constructor(private readonly sendMessage: (message: any) => void) {}

	suiteStarted(result: jasmine.CustomReporterResult): void {

		const event: TestSuiteEvent = {
			type: 'suite',
			suite: {
				type: 'suite',
				id: result.id,
				label: result.description,
				children: []
			},
			state: 'running'
		};

		this.sendMessage(event);
	}

	suiteDone(result: jasmine.CustomReporterResult): void {

		const event: TestSuiteEvent = {
			type: 'suite',
			suite: result.id,
			state: 'completed'
		};

		this.sendMessage(event);
	}

	specStarted(result: jasmine.CustomReporterResult): void {

		const event: TestEvent = {
			type: 'test',
			test: {
				type: 'test',
				id: result.id,
				label: result.description
			},
			state: 'running'
		};

		this.sendMessage(event);
	}

	specDone(result: jasmine.CustomReporterResult): void {

		const failed = result.failedExpectations && (result.failedExpectations.length > 0);
		const state = failed ? 'failed' : 'passed';

		const event: TestEvent = {
			type: 'test',
			test: result.id,
			state
		};

		this.sendMessage(event);
	}
}
