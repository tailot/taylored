# Taylored

**Transform branch changes into manageable plugins. Taylored is a command-line tool to expertly manage and apply `.taylored` plugins, enabling conditional and atomic source code modifications with full Git integration.**

## Overview

Taylored helps you streamline source code modifications by treating them as "plugins" or "patches." These are stored in `.taylored` files, which essentially capture `git diff` outputs.

A key feature is Taylored's intelligent plugin generation:
* The `--save` command creates a `.taylored` file **only if** the changes between a specified branch and `HEAD` consist *exclusively* of line additions or *exclusively* of line deletions. This ensures plugins are atomic and well-defined, simplifying application and management.
* The `--automatic` command can scan your codebase for special markers, extract these blocks, and generate `.taylored` files for them, even supporting dynamic content generation via a `compute` attribute.

Taylored also provides robust tools for patch lifecycle management:
* `--offset`: Updates patch offsets to keep them applicable as your codebase evolves. It can embed a custom `Subject:` line in the updated `.taylored` file.

## Table of Contents

1.  [Why Taylored?](#why-taylored)
2.  [Installation](#installation)
    * [Quick Install (for Users)](#quick-install-for-users)
    * [Development Setup](#development-setup)
3.  [Usage](#usage)
    * [Prerequisites](#prerequisites)
    * [Available Commands](#available-commands)
4.  [How It Works (Under the Hood)](#how-it-works-under-the-hood)
5.  [Contributing](#contributing)
6.  [License](#license)

## Why Taylored?

* **Atomic Changes**: Ensure that applied modifications are clean and focused, either purely additive or purely deletive.
* **Versionable Modifications**: Treat complex or conditional code snippets as versionable plugins.
* **Git-Powered**: Leverages Git's robust diffing and applying capabilities.
* **Automation**: Automatically extract and manage tagged code blocks as individual patches.
* **Dynamic Content**: Generate parts of your patches dynamically using executable script blocks.

## Installation

### Quick Install (for Users)

The recommended way to install Taylored is globally via npm, making the `taylored` command available system-wide:

```bash
npm install -g taylored
```

Ensure you have Node.js and npm installed. After installation, run `taylored` for a list of commands.

### Development Setup

If you plan to contribute to Taylored or run it from a local source:

1.  **Clone the repository:**
    ```bash
    git clone git@github.com:tailot/taylored.git
    cd taylored
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Build the project (if modifying TypeScript files):**
    ```bash
    npm run build
    ```
    This compiles TypeScript to JavaScript in the `dist/` directory.

You can then run your local version:
* **Directly with Node.js (after `npm run build`):**
    ```bash
    node dist/index.js <command>
    # Example: node dist/index.js --list
    ```
* **Using `npm link` (for using `taylored` command directly):**
    ```bash
    npm link
    ```
    This might require administrator privileges. After linking, `taylored <command>` will use your local build. Remember to run `npm run build` after any TypeScript changes.

## Usage

### Prerequisites

* Taylored **must be run from the root directory** of a Git repository.
* Plugin files (`.taylored`) are stored and managed within a `.taylored/` directory at the root of your project.

### Available Commands

#### Save Changes: `taylored --save <branch_name>`
Creates a diff file between the specified `<branch_name>` and `HEAD`.
* **Output**: `.taylored/<sanitized_branch_name>.taylored`
* **Condition**: The file is created *only if* the diff contains exclusively line additions, exclusively line deletions, or no textual line changes. Mixed changes (both additions and deletions) will prevent file generation.

    *Example:*
    ```bash
    taylored --save feature/new-ui
    ```

#### Apply Changes: `taylored --add <taylored_file_name>`
Applies changes from the specified `.taylored` file (located in `.taylored/`) to your working directory. The `.taylored` extension is optional.

    *Example:*
    ```bash
    taylored --add feature_new-ui
    # or
    taylored --add feature_new-ui.taylored
    ```

#### Remove Changes: `taylored --remove <taylored_file_name>`
Reverts changes from the specified `.taylored` file.

    *Example:*
    ```bash
    taylored --remove feature_new-ui
    ```

#### Verify Application: `taylored --verify-add <taylored_file_name>`
Performs a dry-run to check if the patch can be applied cleanly. Does not modify files.

    *Example:*
    ```bash
    taylored --verify-add feature_new-ui
    ```

#### Verify Removal: `taylored --verify-remove <taylored_file_name>`
Performs a dry-run to check if the patch can be reverted cleanly.

    *Example:*
    ```bash
    taylored --verify-remove feature_new-ui
    ```

#### List Plugins: `taylored --list`
Displays all `.taylored` files found in the `.taylored/` directory.

    *Example:*
    ```bash
    taylored --list
    ```

#### Update Offsets: `taylored --offset <taylored_file_name> [BRANCH_NAME]`
Updates line number offsets within the specified `.taylored` file to ensure it applies cleanly to the current repository state.
* **Prerequisite**: No uncommitted changes in the Git working directory.
* Optionally, a `[BRANCH_NAME]` can be specified to calculate the offset against a branch other than `main`.
* The file is updated in place.

    *Example:*
    ```bash
    taylored --offset my_feature_patch
    taylored --offset my_feature_patch.taylored develop
    ```

#### Automatic Extraction: `taylored --automatic <EXTENSIONS> <branch_name> [--exclude <DIR_LIST>]`
Scans files with specified `<EXTENSIONS>` for taylored blocks and creates individual, diff-based `.taylored` files using a Git workflow, comparing against `<branch_name>`.

* **Arguments**:
    * `<EXTENSIONS>`: Comma-separated file extensions to scan (e.g., `ts` or `ts,js,py`). Leading dot is optional.
    * `<branch_name>`: Base branch for comparison when generating diffs.
    * `--exclude <DIR_LIST>` (Optional): Comma-separated list of directory names to exclude (e.g., `node_modules,dist,build`).

* **Prerequisites**:
    * Clean Git repository (no uncommitted changes or untracked files).
    * The file `.taylored/main.taylored` must not exist (used temporarily).
    * Target output files (e.g., `.taylored/1.taylored`) must not already exist.

* **Workflow**: For each identified block:
    1.  A temporary Git branch is created.
    2.  On this branch, the block (including markers) is removed from the source file and committed.
    3.  A diff is generated by comparing this temporary state against the specified `<branch_name>`. This diff represents the "addition" of the block.
    4.  This diff is saved as `.taylored/NUMERO.taylored`.
    5.  The temporary branch is deleted, and the original branch is restored. Source files on the original branch remain untouched.

##### Dynamic Content with `compute`
The `--automatic` mode allows dynamic content generation within taylored blocks using the `compute` attribute. You can also control whether these scripts are executed synchronously or asynchronously.

```html
<taylored number="NUMERO" compute="CHARS_TO_STRIP_PATTERNS" [async="true|false"]>
  <!-- Executable Node.js script content -->
</taylored>
```

* **`compute="CHARS_TO_STRIP_PATTERNS"`**:
    * Signals that the block's content is an executable Node.js script.
    * `CHARS_TO_STRIP_PATTERNS` is an optional comma-separated string of patterns (e.g., `/*,*/`). Before execution, Taylored removes **all occurrences** of each specified pattern from the script content. This is useful for embedding scripts within comment structures.
        For example, `compute="/*,*/"` would remove all `/*` and all `*/` sequences from the script.
* **`async="true|false"`** (Optional):
    * `async="true"`: If specified, the Node.js script for this block will be processed asynchronously. If multiple blocks are marked `async="true"`, their script executions may run in parallel. This can speed up the `--automatic` process if scripts involve time-consuming operations (e.g., I/O, network requests).
    * `async="false"` or attribute omitted: The script will be executed synchronously (default behavior). The `--automatic` process will wait for each such script to complete before moving to the next block.
* **Script Execution**: The processed script content is executed via Node.js. Taylored waits for all scripts (synchronous and asynchronous) to complete before finishing the `--automatic` command.
* **Patch Generation**: The standard output (stdout) from the script replaces the *entire* original `<taylored ... compute="..." [async="..."]>...</taylored>` block in the generated patch.
* **Error Handling for Async Scripts**: If a script running with `async="true"` fails (e.g., exits with a non-zero status code), the error will be logged, and a `.taylored` file for that specific block will not be created. However, this will not stop other synchronous or asynchronous blocks from being processed.

This enables dynamic code or text generation that becomes part of a standard Taylored patch, versionable and manageable like any other code change.

**Considerations for `async="true"`:**
* Running a large number of computationally intensive scripts in parallel might be resource-heavy on your system.
* Asynchronous scripts should ideally be self-contained. Their execution order relative to other asynchronous scripts is not guaranteed, so they should not depend on the side effects of other concurrently running async scripts.

**Example with `compute` (and optional `async`)**:
```javascript
// File: src/dynamicModule.js
// <taylored number="1" compute="/*,*/" async="true"> // This script will run asynchronously
/*
#!/usr/bin/env node
// This script generates dynamic content (potentially slowly)
await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async work
const randomNumber = Math.floor(Math.random() * 100);
console.log(\`const dynamicValue = \${randomNumber}; // Generated at \${new Date().toISOString()}\`);
*/
// </taylored>
```

Running `taylored --automatic js main` would:
1.  Extract the script content between the markers.
2.  Remove `/*` and `*/` due to `compute="/*,*/"`.
3.  Execute the script (asynchronously if `async="true"` is present).
4.  Capture its stdout (e.g., `const dynamicValue = 42; // Generated at ${new Date().toISOString()}`).
5.  Create `.taylored/1.taylored` containing a diff that replaces the original `<taylored...>` block with this stdout.

The `#!/usr/bin/env node` shebang makes the script directly executable if Node.js is in the system's PATH.

##### Markers and Exclusions
* **Start Marker**: `<taylored number="NUMERO" [compute="..."]>` (e.g., `<taylored number="1">`, `<taylored number="42" compute="stripThis">`). `NUMERO` is an integer used for the output filename (e.g., `1.taylored`). The previous positional format for specifying the number (e.g., `<taylored 123>`) is no longer supported; the `number` attribute is now required.
* **End Marker**: `</taylored>`
* **Important**: Taylored markers affect the **entire line** they are on. Any code or comments on the same line as a marker will be included in the taylored block.

    *Example (marker on the same line):*
    ```javascript
    function specialProcess() { /* Some logic */ } // <taylored 30> Special Comment Block </taylored>
    ```
    Block `30` will include the entire line.

* **Exclusions**:
    * The search is recursive.
    * By default, `.git` and the `.taylored` directory are excluded.
    * Use `--exclude <DIR_LIST>` to specify additional comma-separated directories to ignore (e.g., `node_modules,dist,build_output`). Subdirectories of excluded directories are also ignored.

**Example: `--automatic` Workflow**

Given `src/feature.js` on your `main` branch:
```javascript
// src/feature.js
function existingCode() { /* ... */ }

// <taylored 15>
function newFeaturePart() {
  console.log("This is a new, self-contained feature snippet.");
}
// </taylored>

console.log("End of file.");
```

To create `.taylored/15.taylored`:
1.  Ensure your Git working directory is clean.
2.  Ensure `.taylored/main.taylored` and `.taylored/15.taylored` do not exist.
3.  Run:
    ```bash
    taylored --automatic js main
    ```
    Or, to scan multiple extensions (e.g., JavaScript and TypeScript) against the `develop` branch, excluding `node_modules` and `dist`:
    ```bash
    taylored --automatic js,ts develop --exclude node_modules,dist
    ```

This process creates `.taylored/15.taylored` containing a Git diff. Applying this patch (e.g., `taylored --add 15`) would add the block to `src/feature.js` relative to the state of the `<branch_name>` used during extraction. Your `src/feature.js` on the original branch remains unchanged by the `--automatic` operation itself.

## How It Works (Under the Hood)

* **`--save`**: Runs `git diff HEAD <branch_name>`. If the diff is purely additive or deletive (or empty), it's saved. Mixed changes are rejected.
* **`--add`/`--remove`**: Uses `git apply` (with `-R` for remove).
* **`--verify-add`/`--verify-remove`**: Uses `git apply --check` (with `-R` for verify-remove).
* **`--list`**: Lists `*.taylored` files in the `.taylored/` directory.
* **`--offset`**: Operates on a temporary branch. It attempts to apply/revert the patch, then generates a new diff against the `main` branch (or specified branch), replacing the original `.taylored` file. Requires a clean working directory.
* **`--automatic`**: Requires a clean Git state. For each block:
    1.  Creates a temporary branch.
    2.  Removes the block and commits this change on the temporary branch.
    3.  Generates a diff by comparing `HEAD` of the temporary branch (block removed) to the user-specified `<branch_name>`.
    4.  Saves this diff to `.taylored/NUMERO.taylored`.
    5.  Cleans up by deleting the temporary branch and restoring the original branch.

## Contributing

Contributions are highly welcome! Please feel free to submit pull requests or open issues on the GitHub repository.

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/YourAmazingFeature`).
3.  Commit your changes (`git commit -m 'Add YourAmazingFeature'`).
4.  Push to the branch (`git push origin feature/YourAmazingFeature`).
5.  Open a Pull Request.

## License

This project is licensed under the MIT License.