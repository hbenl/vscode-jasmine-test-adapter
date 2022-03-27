import { TestEvent } from "vscode-test-adapter-api";

export interface RunTestsArgs {
	configFile: string;
	jasminePath: string;
	logEnabled: boolean;
	testsToRun?: string[];
}

export interface JasmineTestEvent extends TestEvent {
	failures?: JasmineFailedExpectation[] | undefined
}

export interface JasmineFailedExpectation {
	stack: string;
	message: string;
}
