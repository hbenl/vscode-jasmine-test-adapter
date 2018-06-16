# Jasmine Test Explorer for Visual Studio Code

This extension allows you to run your Jasmine tests using the 
[Test Explorer UI](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer).

## Configuration

* `jasmineExplorer.config`: The location of the Jasmine config file (relative to the workspace folder) (default: `spec/support/jasmine.json`)
* `testExplorer.codeLens`: Show a CodeLens above each test or suite for running or debugging the tests
* `testExplorer.gutterDecoration`: Show the state of each test in the editor using Gutter Decorations
* `testExplorer.onStart`: Retire or reset all test states whenever a test run is started
* `testExplorer.onReload`: Retire or reset all test states whenever the test tree is reloaded
