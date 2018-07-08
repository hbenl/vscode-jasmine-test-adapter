import Jasmine = require('jasmine');
import { LoadTestsReporter } from './loadTestsReporter';
import { patchJasmine } from './patchJasmine';

const sendMessage = process.send ? (message: any) => process.send!(message) : () => {};
const configFile = process.argv[2];

const jasmine = new Jasmine({});
const locations = patchJasmine(jasmine);
jasmine.loadConfigFile(configFile);
jasmine.env.addReporter(new LoadTestsReporter(sendMessage, locations));

jasmine.execute(undefined, '$^');
