import * as path from 'path';
import { ChildProcess, fork, execSync } from 'child_process';
import * as fs from 'fs-extra';
import * as os from 'os';
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
			if (configChange.affectsConfiguration('jasmineExplorer.config', this.workspaceFolder.uri) ||
				configChange.affectsConfiguration('jasmineExplorer.env', this.workspaceFolder.uri)) {
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

			let testSuiteInfo = await new Promise<JasmineTestSuiteInfo | undefined>(resolve => {

				const args = [ config.configFilePath, testFile ];
				let received: TestSuiteInfo | undefined;

				const childProcess = fork(
					require.resolve('./worker/loadTests.js'),
					args,
					{
						cwd: this.workspaceFolder.uri.fsPath,
						env: config.env,
						execPath: config.nodePath,
						execArgv: []
					}
				);

				childProcess.on('message', msg => received = msg);

				childProcess.on('exit', () => resolve(received));
			});

			if (testSuiteInfo !== undefined) {

				testSuiteInfo.label = testFile.startsWith(config.specDir) ? testFile.substr(config.specDir.length) : testFile
				testSuiteInfo.isFileSuite = true;

				rootSuite.children.push(testSuiteInfo);
			}
		}

		if (rootSuite.children.length > 0) {
			return rootSuite;
		} else {
			return undefined;
		}
	}

	async run(info: JasmineTestSuiteInfo | TestInfo, execArgv: string[] = []): Promise<void> {

		const config = this.config;
		if (!config) return;

		let tests: string[] = [];
		this.collectTests(info, tests);

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
					env: config.env,
					execPath: config.nodePath,
					execArgv,
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
		const promise = this.run(info,  [`--inspect-brk=${this.config.debuggerPort}`]);
		if (!promise || !this.runningTestProcess) {
			return;
		}

		await vscode.debug.startDebugging(this.workspaceFolder, {
			name: 'Debug Jasmine Tests',
			type: 'node',
			request: 'attach',
			port: this.config.debuggerPort,
			protocol: 'inspector',
			timeout: 30000,
			stopOnEntry: false,
		});

		const currentSession = vscode.debug.activeDebugSession;
		// Kill the process to ensure we're good once the de
		vscode.debug.onDidTerminateDebugSession((session) => {
			if (currentSession != session) { return; }
			this.cancel(); // just ot be sure
		});

		return promise;
	}

	cancel(): void {
		if (this.runningTestProcess) {
			this.runningTestProcess.kill();
		}
	}

	private getNodePath(): string | undefined {
		try {
			if (os.platform() === 'win32') {
				return execSync("where node").toString().trim();
			} else {
			return execSync("which node").toString().trim();
			}
		} catch (e) {
			return;
		}
	}

	private async loadConfig(): Promise<LoadedConfig | undefined> {

		const adapterConfig = vscode.workspace.getConfiguration('jasmineExplorer', this.workspaceFolder.uri);
		const relativeConfigFilePath = adapterConfig.get<string>('config') || 'spec/support/jasmine.json';
		const configFilePath = path.resolve(this.workspaceFolder.uri.fsPath, relativeConfigFilePath);
		const debuggerPort = adapterConfig.get<number>('debuggerPort') || 9229;
		let nodePath: string | undefined = adapterConfig.get<string>('nodePath') || undefined;

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

		const processEnv = process.env;
		const configEnv: { [prop: string]: any } = adapterConfig.get('env') || {};

		const env = { ...processEnv };

		for (const prop in configEnv) {
			const val = configEnv[prop];
			if ((val === undefined) || (val === null)) {
				delete env.prop;
			} else {
				env[prop] = String(val);
			}
		}

		if (nodePath === 'default') {
			nodePath = this.getNodePath();
		}

		return { configFilePath, specDir, testFileGlobs, testFiles, env, debuggerPort, nodePath };
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
	debuggerPort: number;
	nodePath: string | undefined;
	env: { [prop: string]: any };
}

interface JasmineTestSuiteInfo extends TestSuiteInfo {
	isFileSuite?: boolean;
}
