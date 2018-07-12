import Jasmine = require('jasmine');
import { LoadTestsReporter } from './loadTestsReporter';
import { patchJasmine } from './patchJasmine';

const sendMessage = process.send ? (message: any) => process.send!(message) : () => {};

let logEnabled = false;
try {

	const configFile = process.argv[2];
	logEnabled = <boolean>JSON.parse(process.argv[3]);

	const jasmine = new Jasmine({});
	if (logEnabled) sendMessage('Patching Jasmine');
	const locations = patchJasmine(jasmine);
	if (logEnabled) sendMessage('Loading config file');
	jasmine.loadConfigFile(configFile);
	if (logEnabled) sendMessage('Creating and adding reporter');
	jasmine.env.addReporter(new LoadTestsReporter(sendMessage, locations));

	if (logEnabled) sendMessage('Executing Jasmine');
	jasmine.execute(undefined, '$^');

} catch (err) {
	if (logEnabled) sendMessage(`Caught error ${JSON.stringify(err)}`);
	throw err;
}
