import * as util from 'util';
import * as RegExEscape from 'escape-string-regexp';
import { RunTestsArgs } from "../shared";
import { RunTestsReporter } from './runTestsReporter';

const sendMessage = process.send ? (message: any) => process.send!(message) : console.log;

(async () => {
	if (process.send) {

		// receive the args from process.send()
		const { configFile, jasminePath, logEnabled, testsToRun } = await new Promise<RunTestsArgs>(
			resolve => process.once('message', resolve)
		);
		await execute(jasminePath, configFile, logEnabled, testsToRun);

	} else {

		// get the args from the command line - useful for debugging the worker
		const argv = process.argv;
		const jasminePath = argv[2];
		const configFile = argv[3];
		const logEnabled = <boolean>JSON.parse(argv[4]);
		let testsToRun: string[] | undefined;
		if (argv.length > 5) {
			testsToRun = JSON.parse(argv[5]);
		}
		await execute(jasminePath, configFile, logEnabled, testsToRun);
	}
})();

async function execute(jasminePath: string, configFile: string, logEnabled: boolean, testsToRun?: string[]) {
	try {
		const regExp = testsToRun ? testsToRun.map(RegExEscape).join('|') : undefined;
	
		const Jasmine = require(jasminePath);
		const jasmine = new Jasmine({ baseProjectPath: process.cwd });
		if (logEnabled) sendMessage('Loading config file');
		jasmine.loadConfigFile(configFile);
	
			// vscode output channels have no support for ANSI color codes
			jasmine.configureDefaultReporter({
				showColors: false
			});
	
		if (logEnabled) sendMessage('Executing Jasmine');
		jasmine.execute(undefined, regExp);
	
		// The reporter must be added after the call to jasmine.execute() because otherwise
		// it would be removed if the user changes the reporter in the helper files. 
		// Note that jasmine will start the tests asynchronously, so the reporter will still
		// be added before the tests are run.
		if (logEnabled) sendMessage('Creating and adding reporter');
		jasmine.env.addReporter(new RunTestsReporter(sendMessage, testsToRun));
	
	} catch (err) {
		if (logEnabled) sendMessage(`Caught error ${util.inspect(err)}`);
		throw err;
	}
}
