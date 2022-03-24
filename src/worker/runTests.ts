import * as util from 'util';
import * as RegExEscape from 'escape-string-regexp';
import { RunTestsReporter } from './runTestsReporter';

const sendMessage = process.send ? (message: any) => process.send!(message) : () => {};

let logEnabled = false;

try {
	logEnabled = <boolean>JSON.parse(process.argv[2]);

	// We needed to keep the thread alive until we get the message from the main thread,
	// otherwise this thread will exit
	const keepAlive = setInterval(() => {}, 1000);

	// We need to kill this thread if something happens to the main thread and we never receive a message.
	// We do not want to leave zombie threads hanging around
	const zombieTimeout = setTimeout(() => {
		clearInterval(keepAlive);
		if (logEnabled) sendMessage('Timed out without receiving a message from the main thread');
		process.exit(1);
	}, 30 * 1000); // 30s

	async function runTests(config: RunTestsMessage) {
		let { jasminePath, configFilePath, testsToRun} = config;
		const regExp = testsToRun ? testsToRun.map(RegExEscape).join('|') : undefined;

		const Jasmine = require(jasminePath);
		const jasmine = new Jasmine({ baseProjectPath: process.cwd });
		// do not exit automatically, we have a bit of cleanup/logging to do before exiting
		jasmine.exitOnCompletion = false;
		if (logEnabled) sendMessage('Loading config file');
		jasmine.loadConfigFile(configFilePath);

			// vscode output channels have no support for ANSI color codes
			jasmine.configureDefaultReporter({
				showColors: false
			});

		if (logEnabled) sendMessage('Executing Jasmine');
		const jasmineResult = jasmine.execute(undefined, regExp);

		// The reporter must be added after the call to jasmine.execute() because otherwise
		// it would be removed if the user changes the reporter in the helper files. 
		// Note that jasmine will start the tests asynchronously, so the reporter will still
		// be added before the tests are run.
		if (logEnabled) sendMessage('Creating and adding reporter');
		jasmine.env.addReporter(new RunTestsReporter(sendMessage, testsToRun));

		return jasmineResult;
	}

	process.on('message', (message: any) => {
		clearTimeout(zombieTimeout);

		runTests(message)
			.then((jasmineResult) => {
				clearInterval(keepAlive);
				if (logEnabled) sendMessage(`Done. Overall status: ${jasmineResult.overallStatus}`);
				process.exit(0);
			})
			.catch((err) => {
				clearInterval(keepAlive);
				if (logEnabled) sendMessage(`Caught error ${util.inspect(err)}`);
				process.exit(1);
			});
	});
} catch (err) {
	if (logEnabled) sendMessage(`Caught error ${util.inspect(err)}`);
	throw err;
}

interface RunTestsMessage {
	jasminePath: string;
	configFilePath: string;
	testsToRun?: string[];
}
