import Jasmine = require('jasmine');
import { LoadTestsReporter } from './loadTestsReporter';
import { patchJasmine } from './loadTestsUtils';

const sendMessage = process.send ? (message: any) => process.send!(message) : () => {};
const configFile = process.argv[2];
// Allow for testing if needed by passing another argument
const projectBaseDir = process.argv[3] || process.cwd();

const _jasmine = new Jasmine({ projectBaseDir });
_jasmine.loadConfigFile(configFile);
patchJasmine(_jasmine, projectBaseDir);
_jasmine.execute([], '$^');
jasmine.getEnv().addReporter(new LoadTestsReporter(sendMessage));
