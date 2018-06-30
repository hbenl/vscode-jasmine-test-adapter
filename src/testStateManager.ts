import { TestEvent } from 'vscode-test-adapter-api';
import * as vscode from 'vscode';

export class TestFailure {
	message: string;
	file: string;
	line: number;
	column: number;
	originalEvent: TestEvent;

	static failures(event: TestEvent, worspacePath: string): TestFailure[] {
		if (!event.message) { return []; }
		const lines = event.message.split('\n');
		const errors: TestFailure[] = [];
		let file: string;
		let line: number | undefined;
		let column: number;
		let message: string | undefined;

		lines.forEach((stackLine) => {
			if (stackLine.indexOf('Error:') >= 0) {
				message = stackLine;
			} else if (stackLine.indexOf(worspacePath) >=0 && message && !line) {
				const lineURI = stackLine.split('(')[1].split(')')[0]; // remove the parentheses
				file = lineURI.split(':')[0],
				line = parseInt(lineURI.split(':')[1]),
				column = parseInt(lineURI.split(':')[2]),
				errors.push(new TestFailure(
					message, file, line, column, event
				));
				message = undefined;
				line = undefined;
			} 
		});
		return errors;
	}

	constructor(message: string, file: string, line: number, column: number, originalEvent: TestEvent) {
		this.message = message
		this.file = file
		this.line = line
		this.column = column
		this.originalEvent = originalEvent
	}
}

export class FailuresStore {
	errors: { [id: string]: {[id: string]: TestFailure} };
	errorsByName: { [id: string]: TestFailure };

	constructor() {
		this.errors = {};
		this.errorsByName = {};
	}

	public add(failure: TestFailure) {
		const file = failure.file;
		const line = failure.line;
		const test = failure.originalEvent.test;
		if (!this.errors[file]) {
			this.errors[file] = {};
		}
		this.errors[file][`${line}`] = failure;
		this.errorsByName[test.toString()] = failure;
	}

	public remove(fromEvent: TestEvent) {
		const name = fromEvent.test;
		const originalError = this.errorsByName[name.toString()];
		if (!originalError) { return; }
		if (!this.errors[originalError.file]) { return; }
		Object.keys(this.errors[originalError.file]).forEach((key) => {
			const error = this.errors[originalError.file][key];
			if (error.originalEvent.test === fromEvent.test) {
				delete this.errors[originalError.file][key];
			}
		});
	}
	
	public get(fileName: string, position: number): TestFailure | undefined {
		if (!this.errors[fileName]) { return; }
		const errors = this.errors[fileName];
		return errors[`${position}`];
	}

	public all(matching: ((test: TestFailure) => boolean) | undefined): TestFailure[] {
		const initial: TestFailure[] = [];
		const results: TestFailure[] = Object.keys(this.errors).reduce((memo, key) => {
			const values = this.errors[key];
			const failures = Object.keys(values).map((key) => {
				return values[`${key}`];
			});
			return memo.concat(failures);
		}, initial);
		
		if (matching) {
			return results.filter(matching)
		}
		return results;
	}
}

export class TestResultsManager {
	private store: FailuresStore = new FailuresStore()
	private workspace: string
	failedTestDecoration = vscode.window.createTextEditorDecorationType({
		backgroundColor: 'rgba(255,0,0,0.3)',
		isWholeLine: true,
		overviewRulerColor: 'rgba(255,0,0,0.3)'
	})

	constructor(workspace: string, context: vscode.ExtensionContext) {
		this.workspace = workspace
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			this.updateErrorMarkers();
		}, null, context.subscriptions);
	}

	public handle(event: TestEvent) {
		if (event.state === 'running') {
			this.store.remove(event);
		}
		if (event.state === 'passed') {
			this.store.remove(event);
		}
		if (event.state === 'failed' &&
			event.message) {
			const failures = TestFailure.failures(event, this.workspace);
			failures.forEach((error) => this.store.add(error));
		}
		this.updateErrorMarkers();
	}

	private updateErrorMarkers() {
		const decorations = this.store.all((error) => {
			return error.file === vscode.window.activeTextEditor!.document.uri.fsPath;
		}).map((err) => {
			const options: vscode.DecorationOptions = {
				range: new vscode.Range(new vscode.Position(err.line-1,0), new vscode.Position(err.line-1, 0)),
				hoverMessage: err.message
			};
			return options;
		});
		vscode.window.activeTextEditor!.setDecorations(this.failedTestDecoration, decorations);
	}

	provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
		const error = this.store.get(document.fileName, position.line + 1);
		if (!error) { return; }
		return new vscode.Hover(`**${error.message}**`, new vscode.Range(position, position));
	}
}


