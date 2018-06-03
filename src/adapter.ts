import * as path from 'path';
import { ChildProcess, fork } from 'child_process';
import * as fs from 'fs-extra';
import * as vscode from 'vscode';
import { TestAdapter, TestSuiteEvent, TestEvent, TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';

export class JasmineAdapter implements TestAdapter {

	private readonly testStatesEmitter = new vscode.EventEmitter<TestSuiteEvent | TestEvent>();
	private readonly reloadEmitter = new vscode.EventEmitter<void>();
	private readonly autorunEmitter = new vscode.EventEmitter<void>();

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
		vscode.workspace.onDidSaveTextDocument((doc) => {
			if (doc.uri.fsPath.startsWith(this.workspaceFolder.uri.fsPath)) {
				this.autorunEmitter.fire();
			}
		});
	}

	async load(): Promise<TestSuiteInfo | undefined> {

		const config = this.getConfiguration();
		const configFile = this.getConfigFilePath(config);
		let specDir = await this.getSpecDir(configFile) + path.sep;
		const testFiles = await this.lookupFiles(this.getConfigFilePath(config));

		if (testFiles.length === 0) {
			return undefined;
		}

		const testFileSuites = testFiles.map(file => <TestSuiteInfo>{
			type: 'suite',
			id: file,
			label: file.startsWith(specDir) ? file.substr(specDir.length) : file,
			file: file,
			children: [],
			isFileSuite: true
		});

		const rootSuite: TestSuiteInfo = {
			type: 'suite',
			id: 'root',
			label: 'Jasmine',
			children: testFileSuites
		}

		return rootSuite;
	}

	async run(info: JasmineTestSuiteInfo | TestInfo): Promise<void> {

		const config = this.getConfiguration();
		const configFile = this.getConfigFilePath(config);

		let testFiles: string[];
		if ((info.type === 'suite') && (info.id === 'root')) {
			testFiles = await this.lookupFiles(configFile);
		} else {
			testFiles = [ info.file! ];
		}

		let tests: string[] | undefined;
		if ((info.type === 'test') || !(info.id === 'root' || info.isFileSuite)) {
			tests = [];
			this.collectTests(info, tests);
		}

		this.testStatesEmitter.fire(<TestSuiteEvent>{
			type: 'suite',
			suite: 'root',
			state: 'running'
		});

		for (const testFile of testFiles) {

			this.testStatesEmitter.fire(<TestSuiteEvent>{
				type: 'suite',
				suite: testFile,
				state: 'running'
			});

			await new Promise<void>((resolve) => {

				const args = [ configFile, testFile ];
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
					event => this.testStatesEmitter.fire(<TestSuiteEvent | TestEvent>event)
				);
	
				this.runningTestProcess.on('exit', () => {

					this.testStatesEmitter.fire(<TestSuiteEvent>{
						type: 'suite',
						suite: testFile,
						state: 'completed'
					});
		
					this.runningTestProcess = undefined;
					resolve();
				});
	
			});
		}

		this.testStatesEmitter.fire(<TestSuiteEvent>{
			type: 'suite',
			suite: 'root',
			state: 'completed'
		});
	}

	async debug(info: JasmineTestSuiteInfo | TestInfo): Promise<void> {

		const config = this.getConfiguration();
		const configFile = this.getConfigFilePath(config);

		if ((info.type === 'suite') && (info.id === 'root')) {
			throw new Error("You can't debug the root suite");
		}

		const testFile = info.file!;

		let tests: string[] | undefined;
		if ((info.type === 'test') || !(info.id === 'root' || info.isFileSuite)) {
			tests = [];
			this.collectTests(info, tests);
		}

		const args = [ configFile, testFile ];
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

	private getConfiguration(): vscode.WorkspaceConfiguration {
		return vscode.workspace.getConfiguration('jasmineExplorer', this.workspaceFolder.uri);
	}

	private getConfigFilePath(adapterConfig: vscode.WorkspaceConfiguration): string {
		const relativePath = adapterConfig.get<string>('config') || 'spec/support/jasmine.json';
		return path.resolve(this.workspaceFolder.uri.fsPath, relativePath);
	}

	private async getSpecDir(configFilePath: string): Promise<string> {

		let jasmineConfig: any;
		try {
			jasmineConfig = await fs.readJson(configFilePath);
		} catch(e) {
			return this.workspaceFolder.uri.fsPath;
		}

		return path.resolve(this.workspaceFolder.uri.fsPath, jasmineConfig.spec_dir);
	}

	private async lookupFiles(configFilePath: string): Promise<string[]> {

		let jasmineConfig: any;
		try {
			jasmineConfig = await fs.readJson(configFilePath);
		} catch(e) {
			return [];
		}

		const testFiles: string[] = [];
		for (const relativeGlob of jasmineConfig.spec_files) {
			const testFilesGlob = jasmineConfig.spec_dir + '/' + relativeGlob;
			const relativePattern = new vscode.RelativePattern(this.workspaceFolder, testFilesGlob);
			const fileUris = await vscode.workspace.findFiles(relativePattern);
			const filePaths = fileUris.map(uri => uri.fsPath);
			testFiles.push(...filePaths);
		}

		return testFiles;
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

interface JasmineTestSuiteInfo extends TestSuiteInfo {
	isFileSuite?: boolean;
}
