import * as path from 'path';
import { ChildProcess, fork } from 'child_process';
import * as stream from 'stream';
import * as fs from 'fs-extra';
import * as vscode from 'vscode';
import { Minimatch, IMinimatch } from 'minimatch';
import { parse as parseStackTrace } from 'stack-trace';
import { TestAdapter, TestSuiteEvent, TestEvent, TestSuiteInfo, TestInfo, TestDecoration } from 'vscode-test-adapter-api';
import { detectNodePath } from 'vscode-test-adapter-util';

interface IDisposable {
	dispose(): void;
}

export class JasmineAdapter implements TestAdapter, IDisposable {

	private disposables: IDisposable[] = [];

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
		public readonly workspaceFolder: vscode.WorkspaceFolder,
		public readonly channel: vscode.OutputChannel,
	) {

		this.disposables.push(this.testStatesEmitter);
		this.disposables.push(this.reloadEmitter);
		this.disposables.push(this.autorunEmitter);

		this.disposables.push(vscode.workspace.onDidChangeConfiguration(configChange => {
			if (configChange.affectsConfiguration('jasmineExplorer.config', this.workspaceFolder.uri) ||
				configChange.affectsConfiguration('jasmineExplorer.env', this.workspaceFolder.uri) ||
				configChange.affectsConfiguration('jasmineExplorer.nodePath', this.workspaceFolder.uri)) {
				this.config = undefined;
				this.reloadEmitter.fire();
			}
		}));

		this.disposables.push(vscode.workspace.onDidSaveTextDocument(document => {
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
		}));
	}

	async load(): Promise<TestSuiteInfo | undefined> {

		if (!this.config) {
			this.config = await this.loadConfig();
		}
		const config = this.config;
		if (!config) return undefined;

		const rootSuite: TestSuiteInfo = {
			type: 'suite',
			id: 'root',
			label: 'Jasmine',
			children: []
		}

		const suites: {[id: string]: TestSuiteInfo} = {};

		await new Promise<JasmineTestSuiteInfo | undefined>(resolve => {
			const args = [ config.configFilePath ];
			const childProcess = fork(
				require.resolve('./worker/loadTests.js'),
				args,
				{
					cwd: this.workspaceFolder.uri.fsPath,
					env: config.env,
					execPath: config.nodePath,
					execArgv: [],
					stdio: ['pipe', 'pipe', 'pipe', 'ipc']
				}
			);

			this.pipeProcess(childProcess);

			// The loader emits one suite per file, in order of running
			// When running in random order, the same file may have multiple suites emitted
			// This way the only thing we need to do is just to replace the name
			// With a shorter one
			childProcess.on('message', (msg) => {
				msg.label = msg.file.replace(config.specDir, '');
				const file = msg.file;
				if (suites[file]) {
					suites[file].children = suites[file].children.concat(msg.children);
				} else {
					suites[file] = msg;
				}
			});

			childProcess.on('exit', (exitVal) => {
				resolve();
			});
		});

		function sort(suite: (TestInfo | TestSuiteInfo)) {
			const s = suite as TestSuiteInfo;
			if (s.children) {
				s.children = s.children.sort((a, b) => {
					return a.line! - b.line!;
				});
				s.children.forEach((suite) => sort(suite));
			}
			return s;
		}

		// Sort the suites by their filenames
		Object.keys(suites).sort((a, b) => {
			return a.toLocaleLowerCase() < b.toLocaleLowerCase() ? -1 : 1;
		}).forEach((file) => {
			rootSuite.children.push(sort(suites[file]));
		});

		if (rootSuite.children.length > 0) {
			return rootSuite;
		} else {
			return undefined;
		}
	}

	async run(info: JasmineTestSuiteInfo | TestInfo, execArgv: string[] = []): Promise<void> {

		const config = this.config;
		if (!config) return;

		const testfiles = new Map<string, string>();
		this.collectTestfiles(info, testfiles);
		const tests: string[] = [];
		for (const test of testfiles.keys()) {
			tests.push(test);
		}

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
					stdio: ['pipe', 'pipe', 'pipe', 'ipc']
				}
			);

			this.pipeProcess(this.runningTestProcess);

			this.runningTestProcess.on('message', (event: JasmineTestEvent) => {

				if (event.failures) {
					event.decorations = this.createDecorations(event, testfiles);
					delete event.failures;
				}

				this.testStatesEmitter.fire(event);
			});

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
			const breakpoint = new vscode.SourceBreakpoint(new vscode.Location(fileURI, new vscode.Position(info.line! + 1, 0)));
			vscode.debug.addBreakpoints([breakpoint]);
			const subscription = vscode.debug.onDidTerminateDebugSession((session) => {
				if (currentSession != session) { return; }
				vscode.debug.removeBreakpoints([breakpoint]);
				subscription.dispose();
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
		const subscription = vscode.debug.onDidTerminateDebugSession((session) => {
			if (currentSession != session) { return; }
			this.cancel(); // just ot be sure
			subscription.dispose();
		});

		return promise;
	}

	cancel(): void {
		if (this.runningTestProcess) {
			this.runningTestProcess.kill();
		}
	}

	dispose(): void {
		this.cancel();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
	}

	private pipeProcess(process: ChildProcess) {
		const customStream = new stream.Writable();
		customStream._write = (data, encoding, callback) => {
			this.channel.append(data.toString());
			callback();
		};
		process.stderr.pipe(customStream);
		process.stdout.pipe(customStream);
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
		for (const relativeGlob of jasmineConfig.spec_files) {
			const absoluteGlob = path.resolve(this.workspaceFolder.uri.fsPath, jasmineConfig.spec_dir, relativeGlob);
			testFileGlobs.push(new Minimatch(absoluteGlob));
		}

		const processEnv = process.env;
		const configEnv: { [prop: string]: any } = adapterConfig.get('env') || {};
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
			nodePath = await detectNodePath();
		}

		return { configFilePath, specDir, testFileGlobs, env, debuggerPort, nodePath, breakOnFirstLine};
	}

	private collectTestfiles(info: TestSuiteInfo | TestInfo, testfiles: Map<string, string>): void {
		if (info.type === 'suite') {
			for (const child of info.children) {
				this.collectTestfiles(child, testfiles);
			}
		} else {
			if (info.file) {
				testfiles.set(info.id, info.file);
			}
		}
	}

	private createDecorations(
		event: JasmineTestEvent,
		testfiles: Map<string, string>
	): TestDecoration[] {

		const testfile = testfiles.get(<string>event.test);
		const decorations: TestDecoration[] = [];

		if (testfile && event.failures) {
			for (const failure of event.failures) {
				const decoration = this.createDecoration(failure, testfile);
				if (decoration) {
					decorations.push(decoration);
				}
			}
		}

		return decorations;
	}

	private createDecoration(
		failure: jasmine.FailedExpectation,
		testfile: string
	): TestDecoration | undefined {

		const error: Error = { name: '', message: '', stack: failure.stack };
		const stackFrames = parseStackTrace(error);

		for (const stackFrame of stackFrames) {
			if (stackFrame.getFileName() === testfile) {
				return {
					line: stackFrame.getLineNumber() - 1,
					message: failure.message
				}
			}
		}

		return undefined;
	}
}

interface LoadedConfig {
	configFilePath: string;
	specDir: string;
	testFileGlobs: IMinimatch[];
	debuggerPort: number;
	nodePath: string | undefined;
	env: { [prop: string]: any };
	breakOnFirstLine: boolean;
}

interface JasmineTestSuiteInfo extends TestSuiteInfo {
	isFileSuite?: boolean;
}

export interface JasmineTestEvent extends TestEvent {
	failures?: jasmine.FailedExpectation[] | undefined
}
