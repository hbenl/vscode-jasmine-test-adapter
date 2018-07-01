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

	public remove(test: string) {
		const originalError = this.errorsByName[test];
		if (!originalError) { return; }
		if (!this.errors[originalError.file]) { return; }
		Object.keys(this.errors[originalError.file]).forEach((key) => {
			const error = this.errors[originalError.file][key];
			if (error.originalEvent.test === test) {
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

class DecorationStore {
	private decorations: {[id: string]: vscode.Disposable[]} = {}

	generateErrorDecoration(error: TestFailure): vscode.TextEditorDecorationType {
		const decoration = vscode.window.createTextEditorDecorationType({
			backgroundColor: 'rgba(255,0,0,0.3)',
			isWholeLine: true,
			overviewRulerColor: 'rgba(255,0,0,0.3)',
			after: {
				contentText: ` // ${error.message}`
			}
		});
		const file = error.file;
		if (!this.decorations[file]) {
			this.decorations[file] = [];
		}
		this.decorations[file].push(decoration);
		return decoration
	}

	disposeInlineErrorDecorations(path: string) {
		const decorations = this.decorations[path];
		if (!decorations) { return }
		decorations.forEach((decoration) => {
			decoration.dispose();
		});
		delete this.decorations[path];
	}
}

export class TestResultsManager {
	private store: FailuresStore = new FailuresStore()
	private decorations = new DecorationStore();
	private workspace: string

	failedTestDecoration = vscode.window.createTextEditorDecorationType({
		backgroundColor: 'rgba(255,0,0,0.3)',
		isWholeLine: true,
		overviewRulerColor: 'rgba(255,0,0,0.3)'
	})

	constructor(workspace: string, context: vscode.ExtensionContext) {
		this.workspace = workspace
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (!editor) { return; }
			this.updateErrorMarkers(editor);
		}, null, context.subscriptions);
	}

	public handle(event: TestEvent) {
		if (event.state === 'running') {
			this.store.remove(event.test.toString());
		}
		if (event.state === 'passed') {
			this.store.remove(event.test.toString());
		}
		if (event.state === 'failed' &&
			event.message) {
			TestFailure.failures(event, this.workspace)
				.forEach((error) => this.store.add(error));
		}
		vscode.window.visibleTextEditors.forEach((editor) => {
			this.updateErrorMarkers(editor);
		});
	}

	private updateErrorMarkers(editor: vscode.TextEditor) {
		const currentFile = editor.document.uri.fsPath;
		this.decorations.disposeInlineErrorDecorations(currentFile);
		this.store.all((error) => {
			return error.file === currentFile;
		}).forEach((err) => {
			const options: vscode.DecorationOptions = {
				range: new vscode.Range(new vscode.Position(err.line-1,0), new vscode.Position(err.line-1, 0)),
				hoverMessage: err.message
			};
			const decoration = this.decorations.generateErrorDecoration(err);
			editor.setDecorations(decoration, [options]);
		});
	}
}
