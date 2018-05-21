import Jasmine = require('jasmine');
import { Reporter } from './reporter';

const sendMessage = process.send ? (message: any) => process.send!(message) : () => {};

const configFile = process.argv[2];
const testFile = process.argv[3];

const _jasmine = new Jasmine({});
jasmine.getEnv().addReporter(new Reporter(sendMessage));
_jasmine.loadConfigFile(configFile);
_jasmine.execute([ testFile ]);
