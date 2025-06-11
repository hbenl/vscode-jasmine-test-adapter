import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";
import { Location } from "./patchJasmine";

// Extend the TestSuiteInfo type to include our custom property
interface ExtendedTestSuiteInfo extends TestSuiteInfo {
	isFileSuite?: boolean;
}

export class LoadTestsReporter implements jasmine.CustomReporter {

	private readonly rootSuite: TestSuiteInfo;
	private readonly suiteStack: TestSuiteInfo[];
	private currentFile: string | undefined;

	private get currentSuite(): TestSuiteInfo {
		return this.suiteStack[this.suiteStack.length - 1];
	}

	constructor(
		private readonly done: (result: TestSuiteInfo) => void,
		private readonly locations: Map<string, Location>,
		private readonly groupByDescribe: boolean = false
	) {
		this.rootSuite = {
			type: 'suite',
			id: 'root',
			label: '',
			children: [],
		};

		this.suiteStack = [ this.rootSuite ];

		// we use process on exit as jasmineDone may not be called
		process.on('exit', () => {
			this.emitLastSuite();
		});
	}

	makeFileSuite(file: string): ExtendedTestSuiteInfo {
		return {
			type: 'suite',
			id: file,
			file: file,
			label: file,
			children: [],
			isFileSuite: true,
		};
	}

	suiteStarted(result: jasmine.CustomReporterResult): void {
		const suite: TestSuiteInfo = {
			type: 'suite',
			id: result.fullName,
			label: result.description,
			children: []
		};

		const location = this.locations.get(result.id);
		if (location) {
			// When grouping by describe, we still need to track files
			// but we don't create file suites
			if (!this.groupByDescribe) {
				this.processCurrentLocation(location);
			} else if (location.file !== this.currentFile) {
				// For describe grouping, emit previous file's suites
				this.emitLastSuite();
				this.currentFile = location.file;
				// Don't create a file suite, just track the file
			}
			suite.file = location.file;
			suite.line = location.line;
		}

		this.currentSuite.children.push(suite);
		this.suiteStack.push(suite);
	}

	suiteDone() {
		this.suiteStack.pop();
	}

	specStarted(result: jasmine.CustomReporterResult): void {
		const test: TestInfo = {
			type: 'test',
			id: result.fullName,
			label: result.description,
			skipped: !!result.pendingReason
		}

		const location = this.locations.get(result.id);
		if (location) {
			if (!this.groupByDescribe) {
				this.processCurrentLocation(location);
			} else if (location.file !== this.currentFile) {
				// For describe grouping, emit previous file's suites
				this.emitLastSuite();
				this.currentFile = location.file;
			}
			test.line = location.line;
			test.file = location.file;
		} else {
			console.log('Could not find location for spec', result.fullName);
		}

		this.currentSuite.children.push(test);
	}

	// This method will add a file suite if we changed
	// The current file we're currenlty processing and push it
	// On to the stack
	// It will also emit through this.done() the last file
	// This way we emit one suite per file, which keeps things manageable
	// and small enough for IPC
	private processCurrentLocation(location: Location) {
		if (location.file != this.currentFile) {
			const fileSuite = this.makeFileSuite(location.file);
			this.emitLastSuite();
			this.currentFile = location.file;
			this.suiteStack.push(fileSuite);
		}
	}

	private emitLastSuite() {
		if (!this.currentFile) { return; }
		
		if (this.groupByDescribe) {
			// For describe grouping, emit the root suite with file info
			if (this.rootSuite.children.length > 0) {
				const fileInfo: ExtendedTestSuiteInfo = {
					type: 'suite',
					id: this.currentFile,
					file: this.currentFile,
					label: this.currentFile,
					children: [...this.rootSuite.children],
					isFileSuite: true
				};
				this.done(fileInfo);
				this.rootSuite.children = [];
			}
		} else {
			// Original file-based emission
			const doneSuite = this.suiteStack.pop();
			if (doneSuite) {
				this.done(doneSuite);
			}
		}
	}
}