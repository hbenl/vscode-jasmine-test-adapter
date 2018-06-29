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
				configChange.affectsConfiguration('jasmineExplorer.env', this.workspaceFolder.uri) ||
				configChange.affectsConfiguration('jasmineExplorer.nodePath', this.workspaceFolder.uri)) {
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
		const suites: any[] = [];

		await new Promise<JasmineTestSuiteInfo | undefined>(resolve => {

			const args = [ config.configFilePath ];
			const childProcess = fork(
				require.resolve('./worker/loadTests.js'),
				args,
				{
					cwd: this.workspaceFolder.uri.fsPath,
					execPath: config.nodePath,
					env: config.env,
					execArgv: []
				}
			);

			childProcess.on('message', (msg) => {
				suites.push(msg);
			});

			childProcess.on('exit', (exitVal) => {
				resolve();
			});
		});
		
		function findFile(suite: { file: string | undefined, children: any[] }): string | undefined {
			if (!suite.file) {
				for(const child of suite.children) {
					const file = findFile(child);
					if (file) { return file; }
				}
			} else {
				return suite.file;
			}
			return undefined;
		}

		const suitesByFiles = suites.reduce((memo, suite) => {
			const file = findFile(suite);
			if (!file) {
				throw new Error(`Unable to find the file in suite ${suite.label}` );
			}
			const fileSuite = memo[file] ||  {
				type: 'suite',
				id: file,
				file: file,
				label: file.startsWith(config.specDir) ? file.substr(config.specDir.length) : file,
				children: [],
				isFileSuite: true,
			}
			fileSuite.children.push(suite);
			memo[file] = fileSuite;
			return memo;
		}, {});

		Object.keys(suitesByFiles).forEach((file) => {
			rootSuite.children.push(suitesByFiles[file]);
		});

		if (rootSuite.children.length > 0) {
			rootSuite.children.sort((a, b) => {
				return a.id.toLowerCase() < b.id.toLowerCase() ? -1 : 1;
			});
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

		const args = [ config.configFilePath ];
		if (tests) {
			args.push(JSON.stringify(tests));
			if (info.file) {
				args.push(info.file);
			}
		}

		return new Promise<void>((resolve) => {
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
		if (!this.config) {
			return;
		}

		let currentSession: vscode.DebugSession | undefined; 
		// Add a breakpoint on the 1st line of the debugger
		if (this.config.breakOnFirstLine) {
			const fileURI = vscode.Uri.file(info.file!);
			const brekpoint = new vscode.SourceBreakpoint(new vscode.Location(fileURI, new vscode.Position(info.line! + 1, 0)))
			vscode.debug.addBreakpoints([brekpoint]);
			vscode.debug.onDidTerminateDebugSession((session) => {
				if (currentSession != session) { return; }
				vscode.debug.removeBreakpoints([brekpoint]);
			});
		}

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

		currentSession = vscode.debug.activeDebugSession;

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
		const node: string | undefined = adapterConfig.get('node');
		const breakOnFirstLine: boolean = adapterConfig.get('breakOnFirstLine') || false;
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

		return { configFilePath, specDir, testFileGlobs, testFiles, env, debuggerPort, nodePath, breakOnFirstLine};
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
	nodePath: string | undefined;
	env: { [prop: string]: any };
	debuggerPort: number;
	breakOnFirstLine: boolean;
}

interface JasmineTestSuiteInfo extends TestSuiteInfo {
	isFileSuite?: boolean;
}
