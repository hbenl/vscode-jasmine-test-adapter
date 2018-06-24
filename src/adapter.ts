import * as path from 'path';
import { ChildProcess, fork } from 'child_process';
import * as fs from 'fs-extra';
import * as vscode from 'vscode';
import { Minimatch, IMinimatch } from 'minimatch';
import { TestAdapter, TestSuiteEvent, TestEvent, TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';

export class JasmineAdapter implements TestAdapter {

	private readonly testStatesEmitter = new vscode.EventEmitter<TestSuiteEvent | TestEvent>();
	private readonly reloadEmitter = new vscode.EventEmitter<void>();
	private readonly autorunEmitter = new vscode.EventEmitter<void>();

	private config?: LoadedConfig;

	private runningTestProcess: ChildProcess | undefined;

	get testStates(): vscode.Event<TestSuiteEvent | TestEvent> {
		return this.testStatesEmitter.event;
	}

	get reload(): vscode.Event<void> {
		return this.reloadEmitter.event;
	}

	get autorun(): vscode.Event<void> {
		return this.autorunEmitter.event;
	}

	constructor(
		public readonly workspaceFolder: vscode.WorkspaceFolder
	) {

		vscode.workspace.onDidChangeConfiguration(configChange => {
			if (configChange.affectsConfiguration('jasmineExplorer.config', this.workspaceFolder.uri)) {
				this.config = undefined;
				this.reloadEmitter.fire();
			}
		});

		vscode.workspace.onDidSaveTextDocument(document => {
			if (!this.config) return;

			const filename = document.uri.fsPath;

			if (filename === this.config.configFilePath) {
				this.config = undefined;
				this.reloadEmitter.fire();
				return;
			}

			for (const glob of this.config.testFileGlobs) {
				if (glob.match(filename)) {
					this.reloadEmitter.fire();
					return;
				}
			}

			if (filename.startsWith(this.workspaceFolder.uri.fsPath)) {
				this.autorunEmitter.fire();
			}
		});
	}

	async load(): Promise<TestSuiteInfo | undefined> {

		if (!this.config) {
			this.config = await this.loadConfig();
		}
		const config = this.config;
		if (!config) return undefined;

		if (config.testFiles.length === 0) {
			return undefined;
		}

		const rootSuite: TestSuiteInfo = {
			type: 'suite',
			id: 'root',
			label: 'Jasmine',
			children: []
		}

		for (const testFile of config.testFiles) {

			let testSuiteInfo = await new Promise<JasmineTestSuiteInfo>(resolve => {

				const args = [ config.configFilePath, testFile ];
				let received: TestSuiteInfo;

				const childProcess = fork(
					require.resolve('./worker/loadTests.js'),
					args,
					{
						cwd: this.workspaceFolder.uri.fsPath,
						execArgv: []
					}
				);

				childProcess.on('message', msg => received = msg);

				childProcess.on('exit', () => resolve(received));
			});

			testSuiteInfo.label = testFile.startsWith(config.specDir) ? testFile.substr(config.specDir.length) : testFile
			testSuiteInfo.isFileSuite = true;

			rootSuite.children.push(testSuiteInfo);
		}

		return rootSuite;
	}

	async run(info: JasmineTestSuiteInfo | TestInfo): Promise<void> {

		const config = this.config;
		if (!config) return;

		let tests: string[] | undefined;
		if ((info.type === 'test') || !(info.id === 'root' || info.isFileSuite)) {
			tests = [];
			this.collectTests(info, tests);
		}

		await new Promise<void>((resolve) => {

			const args = [ config.configFilePath ];
			if (tests) {
				args.push(JSON.stringify(tests));
			}

			this.runningTestProcess = fork(
				require.resolve('./worker/runTests.js'),
				args,
				{
					cwd: this.workspaceFolder.uri.fsPath,
					execArgv: []
				}
			);

			this.runningTestProcess.on('message', 
				event => this.testStatesEmitter.fire(<TestEvent>event)
			);

			this.runningTestProcess.on('exit', () => {
				this.runningTestProcess = undefined;
				resolve();
			});
		});
	}

	async debug(info: JasmineTestSuiteInfo | TestInfo): Promise<void> {

		if (!this.config) return;

		let tests: string[] | undefined;
		if ((info.type === 'test') || !(info.id === 'root' || info.isFileSuite)) {
			tests = [];
			this.collectTests(info, tests);
		}

		const args = [ this.config.configFilePath ];
		if (tests) {
			args.push(JSON.stringify(tests));
		}

		vscode.debug.startDebugging(this.workspaceFolder, {
			name: 'Debug Jasmine Tests',
			type: 'node',
			request: 'launch',
			program: require.resolve('./worker/runTests.js'),
			args,
			cwd: '${workspaceRoot}',
			stopOnEntry: false
		});
	}

	cancel(): void {
		if (this.runningTestProcess) {
			this.runningTestProcess.kill();
		}
	}

	private async loadConfig(): Promise<LoadedConfig | undefined> {

		const adapterConfig = vscode.workspace.getConfiguration('jasmineExplorer', this.workspaceFolder.uri);
		const relativeConfigFilePath = adapterConfig.get<string>('config') || 'spec/support/jasmine.json';
		const configFilePath = path.resolve(this.workspaceFolder.uri.fsPath, relativeConfigFilePath);

		let jasmineConfig: any;
		try {
			jasmineConfig = await fs.readJson(configFilePath);
		} catch(e) {
			return undefined;
		}

		const specDir = path.resolve(this.workspaceFolder.uri.fsPath, jasmineConfig.spec_dir);

		const testFileGlobs: IMinimatch[] = [];
		const testFiles: string[] = [];
		for (const relativeGlob of jasmineConfig.spec_files) {

			const absoluteGlob = path.resolve(this.workspaceFolder.uri.fsPath, jasmineConfig.spec_dir, relativeGlob);
			testFileGlobs.push(new Minimatch(absoluteGlob));

			const workspaceRelativeGlob = jasmineConfig.spec_dir + '/' + relativeGlob;
			const relativePattern = new vscode.RelativePattern(this.workspaceFolder, workspaceRelativeGlob);
			const fileUris = await vscode.workspace.findFiles(relativePattern);
			const files = fileUris.map(uri => uri.fsPath);
			testFiles.push(...files);
		}

		return { configFilePath, specDir, testFileGlobs, testFiles };
	}

	private collectTests(info: TestSuiteInfo | TestInfo, tests: string[]): void {
		if (info.type === 'suite') {
			for (const child of info.children) {
				this.collectTests(child, tests);
			}
		} else {
			tests.push(info.id);
		}
	}
}

interface LoadedConfig {
	configFilePath: string;
	specDir: string;
	testFileGlobs: IMinimatch[];
	testFiles: string[];
}

interface JasmineTestSuiteInfo extends TestSuiteInfo {
	isFileSuite?: boolean;
}
