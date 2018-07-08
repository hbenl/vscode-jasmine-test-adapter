# Jasmine Test Explorer for Visual Studio Code

Run your Jasmine tests using the 
[Test Explorer UI](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer).

![Screenshot](img/screenshot.png)

## Features
* Shows a Test Explorer in the Test view in VS Code's sidebar with all detected tests and suites and their state
* Adds CodeLenses to your test files for starting and debugging tests
* Adds Gutter decorations to your test files showing the tests' state
* Shows a failed test's log when the test is selected in the explorer
* Lets you choose test suites or individual tests in the explorer that should be run automatically after each file change
* Forwards the console output from Jasmine to a VS Code output channel

## Getting started
* Install the extension
* Restart VS Code and open the Test view
* Run / Debug your tests using the ![Run](img/run.png) / ![Debug](img/debug.png) icons in the Test Explorer or the CodeLenses in your test file

## Configuration
* `jasmineExplorer.config`: The location of the Jasmine config file (relative to the workspace folder) (default: `spec/support/jasmine.json`)
* `jasmineExplorer.env`: Environment variables to be set when running the tests
* `jasmineExplorer.nodePath`: The path to the node executable to use. By default it will attempt to find it on your PATH, if it can't find it or if this option is set to `null`, it will use the one shipped with VS Code
* `jasmineExplorer.debuggerPort`: The port for running the debug sessions (default: `9229`)
* `jasmineExplorer.breakOnFirstLine`: Setting to `true` injects a breakpoint at the first line of your test, (default: `false`)
* `testExplorer.codeLens`: Show a CodeLens above each test or suite for running or debugging the tests
* `testExplorer.gutterDecoration`: Show the state of each test in the editor using Gutter Decorations
* `testExplorer.onStart`: Retire or reset all test states whenever a test run is started
* `testExplorer.onReload`: Retire or reset all test states whenever the test tree is reloaded
