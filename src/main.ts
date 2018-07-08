import * as vscode from 'vscode';
import { TestExplorerExtension, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { JasmineAdapter } from './adapter';

function getWorkspaceRegistrar(
	testExplorerExtension:vscode.Extension<TestExplorerExtension>,
	context: vscode.ExtensionContext) {

	const registeredAdapters = new Map<vscode.WorkspaceFolder, JasmineAdapter>();
	const channel = vscode.window.createOutputChannel('Jasmine Tests');

	function add(workspaces: vscode.WorkspaceFolder[]) {
		for (const workspaceFolder of workspaces) {
			const adapter = new JasmineAdapter(workspaceFolder, channel);
			registeredAdapters.set(workspaceFolder, adapter);
			testExplorerExtension.exports.registerAdapter(adapter);
		}
	}

	function remove(workspaces: vscode.WorkspaceFolder[]) {
		for (const workspaceFolder of workspaces) {
			const adapter = registeredAdapters.get(workspaceFolder);
			if (adapter) {
				testExplorerExtension.exports.unregisterAdapter(adapter);
				registeredAdapters.delete(workspaceFolder);
			}
		}
	}

	return { add, remove };
}

export async function activate(context: vscode.ExtensionContext) {

	const testExplorerExtension = vscode.extensions.getExtension<TestExplorerExtension>(testExplorerExtensionId);

	if (testExplorerExtension) {
		
		if (!testExplorerExtension.isActive) {
			await testExplorerExtension.activate();
		}

		const { add, remove } = getWorkspaceRegistrar(testExplorerExtension, context);

		if (vscode.workspace.workspaceFolders) {
			add(vscode.workspace.workspaceFolders);
		}
	
		vscode.workspace.onDidChangeWorkspaceFolders((event) => {
			remove(event.removed);
			add(event.added);
		});
	}
}
