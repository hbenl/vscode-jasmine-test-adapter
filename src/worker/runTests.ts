import Jasmine = require('jasmine');
import * as RegExEscape from 'escape-string-regexp';
import { RunTestsReporter } from './runTestsReporter';

const sendMessage = process.send ? (message: any) => process.send!(message) : () => {};

let logEnabled = false;
try {

	let testsToRun: string[] | undefined;
	let testFiles = [];

	const argv = process.argv;
	const configFile = argv[2];
	logEnabled = <boolean>JSON.parse(argv[3]);

	if (argv.length > 4) {
		testsToRun = JSON.parse(argv[4]);
	}

	if (argv.length > 5) {
		testFiles.push(argv[5]);
	}

	const regExp = testsToRun ? testsToRun.map(RegExEscape).join('|') : undefined;
	const jasmine = new Jasmine({ baseProjectPath: process.cwd });
	if (logEnabled) sendMessage('Loading config file');
	jasmine.loadConfigFile(configFile);
	if (logEnabled) sendMessage('Creating and adding reporter');
	jasmine.env.addReporter(new RunTestsReporter(sendMessage, testsToRun));

	if (logEnabled) sendMessage('Executing Jasmine');
	jasmine.execute(testFiles, regExp);

} catch (err) {
	if (logEnabled) sendMessage(`Caught error ${JSON.stringify(err)}`);
	throw err;
}
