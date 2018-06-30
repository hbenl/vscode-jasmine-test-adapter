import * as vscode from 'vscode';
import { TestExplorerExtension, testExplorerExtensionId, TestEvent } from 'vscode-test-adapter-api';
import { JasmineAdapter } from './adapter';
import { TestResultsManager } from './testStateManager';

export async function activate(context: vscode.ExtensionContext) {

	const testExplorerExtension = vscode.extensions.getExtension<TestExplorerExtension>(testExplorerExtensionId);
	const channel = vscode.window.createOutputChannel('Jasmine Tests');
	if (testExplorerExtension) {
		
		if (!testExplorerExtension.isActive) {
			await testExplorerExtension.activate();
		}

		const registeredAdapters = new Map<vscode.WorkspaceFolder, JasmineAdapter>();

		if (vscode.workspace.workspaceFolders) {
			for (const workspaceFolder of vscode.workspace.workspaceFolders) {
				const adapter = new JasmineAdapter(workspaceFolder, channel);
				const resultsManager = new TestResultsManager(workspaceFolder.uri.fsPath, context);
				adapter.testStates((event) => {
					resultsManager.handle(event as TestEvent)
				}, null, context.subscriptions);
				registeredAdapters.set(workspaceFolder, adapter);
				testExplorerExtension.exports.registerAdapter(adapter);

				// Hover provider
				vscode.languages.registerHoverProvider({ language: 'javascript', scheme: 'file' }, resultsManager);
			}
		}
	
		vscode.workspace.onDidChangeWorkspaceFolders((event) => {
	
			for (const workspaceFolder of event.removed) {
				const adapter = registeredAdapters.get(workspaceFolder);
				if (adapter) {
					testExplorerExtension.exports.unregisterAdapter(adapter);
					registeredAdapters.delete(workspaceFolder);
				}
			}
	
			for (const workspaceFolder of event.added) {
				const adapter = new JasmineAdapter(workspaceFolder, channel);
				registeredAdapters.set(workspaceFolder, adapter);
				testExplorerExtension.exports.registerAdapter(adapter);
			}
		}, null, context.subscriptions);
	}
}
