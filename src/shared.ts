export interface RunTestsArgs {
	configFile: string;
	jasminePath: string;
	logEnabled: boolean;
	testsToRun?: string[];
}
