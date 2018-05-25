import Jasmine = require('jasmine');
import * as RegExEscape from 'escape-string-regexp';
import { Reporter } from './reporter';

const sendMessage = process.send ? (message: any) => process.send!(message) : () => {};

const configFile = process.argv[2];
const testFile = process.argv[3];
let testsToRun: string[] | undefined;
if (process.argv.length > 4) {
	testsToRun = JSON.parse(process.argv[4]);
}

const regExp = testsToRun ? testsToRun.map(RegExEscape).join('|') : undefined;

const _jasmine = new Jasmine({});
jasmine.getEnv().addReporter(new Reporter(sendMessage, testFile, testsToRun));
_jasmine.loadConfigFile(configFile);
_jasmine.execute([ testFile ], regExp);
