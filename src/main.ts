import * as vscode from 'vscode';
import { TestExplorerExtension, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';
import { JasmineAdapter } from './adapter';

function getWorkspaceRegistrar(
	testExplorerExtension:vscode.Extension<TestExplorerExtension>,
	log: Log
) {

	const registeredAdapters = new Map<vscode.WorkspaceFolder, JasmineAdapter>();
	const channel = vscode.window.createOutputChannel('Jasmine Tests');

	function add(workspaces: vscode.WorkspaceFolder[]) {
		for (const workspaceFolder of workspaces) {
			const adapter = new JasmineAdapter(workspaceFolder, channel, log);
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
				adapter.dispose();
			}
		}
	}

	return { add, remove };
}

export async function activate(context: vscode.ExtensionContext) {

	const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0];
	const log = new Log('jasmineExplorer', workspaceFolder, 'Jasmine Explorer Log');

	const testExplorerExtension = vscode.extensions.getExtension<TestExplorerExtension>(testExplorerExtensionId);
	if (log.enabled) log.info(`Test Explorer ${testExplorerExtension ? '' : 'not '}found`);

	if (testExplorerExtension) {
		
		if (!testExplorerExtension.isActive) {
			log.warn('Test Explorer is not active - trying to activate');
			await testExplorerExtension.activate();
		}

		const { add, remove } = getWorkspaceRegistrar(testExplorerExtension, log);

		if (vscode.workspace.workspaceFolders) {
			add(vscode.workspace.workspaceFolders);
		}
	
		vscode.workspace.onDidChangeWorkspaceFolders((event) => {
			remove(event.removed);
			add(event.added);
		});
	}
}
