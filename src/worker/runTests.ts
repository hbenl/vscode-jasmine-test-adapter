import Jasmine = require('jasmine');
import * as RegExEscape from 'escape-string-regexp';
import { RunTestsReporter } from './runTestsReporter';

const sendMessage = process.send ? (message: any) => process.send!(message) : () => {};

const configFile = process.argv[2];
let testsToRun: string[] | undefined;
if (process.argv.length > 3) {
	testsToRun = JSON.parse(process.argv[3]);
}

const regExp = testsToRun ? testsToRun.map(RegExEscape).join('|') : undefined;

const _jasmine = new Jasmine({});
jasmine.getEnv().addReporter(new RunTestsReporter(sendMessage, testsToRun));
_jasmine.loadConfigFile(configFile);
_jasmine.execute(undefined, regExp);
