import * as util from 'util';
import { LoadTestsReporter } from './loadTestsReporter';
import { patchJasmine } from './patchJasmine';

const sendMessage = process.send ? (message: any) => process.send!(message) : () => {};

let logEnabled = false;
try {

	const jasminePath = process.argv[2];
	const configFile = process.argv[3];
	logEnabled = <boolean>JSON.parse(process.argv[4]);

	const Jasmine = require(jasminePath);
	const jasmine = new Jasmine({});
	if (logEnabled) sendMessage('Patching Jasmine');
	const locations = patchJasmine(jasmine);
	if (logEnabled) sendMessage('Loading config file');
	jasmine.loadConfigFile(configFile);

	if (logEnabled) sendMessage('Executing Jasmine');
	jasmine.execute(undefined, '$^');

	// The reporter must be added after the call to jasmine.execute() because otherwise
	// it would be removed if the user changes the reporter in the helper files. 
	// Note that jasmine will start the tests asynchronously, so the reporter will still
	// be added before the tests are run.
	if (logEnabled) sendMessage('Creating and adding reporter');
	jasmine.env.addReporter(new LoadTestsReporter(sendMessage, locations));

} catch (err) {
	if (logEnabled) sendMessage(`Caught error ${util.inspect(err)}`);
	throw err;
}
