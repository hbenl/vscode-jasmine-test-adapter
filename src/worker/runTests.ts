import Jasmine = require('jasmine');
import * as RegExEscape from 'escape-string-regexp';
import { RunTestsReporter } from './runTestsReporter';
const sendMessage = process.send ? (message: any) => process.send!(message) : () => {};

let testsToRun: string[] | undefined;
let testFiles = [];

const argv = process.argv;
const configFile = argv[2];

if (argv.length > 3) {
	testsToRun = JSON.parse(argv[3]);
}

if (argv.length > 4) {
	testFiles.push(argv[4]);
}

const regExp = testsToRun ? testsToRun.map(RegExEscape).join('|') : undefined;
const _jasmine = new Jasmine({ baseProjectPath: process.cwd });
_jasmine.loadConfigFile(configFile);
_jasmine.execute(testFiles, regExp);
jasmine.getEnv().addReporter(new RunTestsReporter(sendMessage, testsToRun));
