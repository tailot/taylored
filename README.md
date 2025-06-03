# taylored

Make changes to a branch a plugin. A command-line tool to manage and apply '''.taylored''' plugins. It supports applying, removing, verifying plugins, and generating them from a branch (GIT).

## What is Taylored?

Taylored is a tool that helps you manage source code changes in the form of "plugins" or "patches". These plugins are represented by files with the `.taylored` extension, which contain the differences (diffs) compared to a specific version of the code.

A distinctive feature of Taylored is its ability to generate these `.taylored` files conditionally: a plugin is created using the `--save` command only if the changes between the specified branch and HEAD consist *exclusively* of line additions or *exclusively* of line deletions. This ensures that plugins represent atomic and well-defined changes, making them easier to apply and manage.

Furthermore, the `--offset` command allows updating patch offsets. It can use the `--message` option to embed a custom `Subject:` line in the resulting `.taylored` file. If `--message` is not provided, Taylored attempts to preserve or extract a message from the input patch for this purpose. Note that temporary commits made by `--offset` during its internal processing use a default message. The `--data` command allows extracting this stored commit message.

## Installation

### Recommended Method (for Users)

The easiest way to install Taylored is globally via npm. This will make the `taylored` command available in your system:

```bash
npm install -g taylored
```

Make sure you have Node.js and npm installed. After installation, you can run `taylored --help` to see the available commands.

### For Developers and Contributors

If you want to contribute to Taylored's development, modify its code, or run it from a local copy:

1.  Clone the repository:
    ```bash
    git clone git@github.com:tailot/taylored.git
    ```
2.  Enter the project directory:
    ```bash
    cd taylored
    ```
3.  Install development dependencies:
    ```bash
    npm install
    ```
4.  Compile the TypeScript code (if you make changes to `.ts` files):
    ```bash
    npm run build
    ```
    This command generates the executable JavaScript files in the `dist/` directory.

After these steps, you can run your local version of Taylored:

* Directly with Node.js (if you've run `npm run build`):
    ```bash
    node dist/index.js <command>
    ```
    (Example: `node dist/index.js --list`)
* Alternatively, to use the `taylored` command directly in the terminal within this project directory (useful for development), you can create a symbolic link:
    ```bash
    npm link
    ```
    This may require administrator privileges. Once linked, `taylored <command>` will use your local copy. Remember to run `npm run build` after TypeScript changes for `npm link` to reflect them.

## Usage

**Important Prerequisite:** Taylored must be run from the root directory of a Git repository.

The plugin files (`.taylored`) generated or used by Taylored are stored in a directory called `.taylored/` within the root of your Git project.

### Available Commands

Here are the commands you can use with Taylored:

* #### Save changes to a `.taylored` file
    ```bash
    taylored --save <branch_name>
    ```
    This command creates a diff file between the specified `<branch_name>` and HEAD. The `.taylored` file is saved in `.taylored/<sanitized_branch_name>.taylored`.
    **Note:** The file is created *only if* the diff contains exclusively line additions, exclusively line deletions, or no textual line changes at all (i.e., an empty diff). Mixed changes (both additions and deletions of lines) will not generate a file.

    *Example:*
    ```bash
    taylored --save feature/new-functionality
    ```

* #### Apply changes from a `.taylored` file
    ```bash
    taylored --add <taylored_file_name>
    ```
    Applies the changes contained in the specified file (which must be in `.taylored/`) to your current working directory.

    *Example:*
    ```bash
    taylored --add feature_new-functionality
    # or
    taylored --add feature_new-functionality.taylored # (also valid)
    ```

* #### Remove (undo) changes from a `.taylored` file
    ```bash
    taylored --remove <taylored_file_name>
    ```
    Undoes the changes specified in the `.taylored` file from your current working directory.

    *Example:*
    ```bash
    taylored --remove feature_new-functionality
    # or
    taylored --remove feature_new-functionality.taylored # (also valid)
    ```

* #### Verify the application of a `.taylored` file (dry-run)
    ```bash
    taylored --verify-add <taylored_file_name>
    ```
    Checks if the `.taylored` file can be applied without conflicts (does not actually modify files).

    *Example:*
    ```bash
    taylored --verify-add feature_new-functionality
    # or
    taylored --verify-add feature_new-functionality.taylored # (also valid)
    ```

* #### Verify the removal of a `.taylored` file (dry-run)
    ```bash
    taylored --verify-remove <taylored_file_name>
    ```
    Checks if the changes specified in the `.taylored` file can be undone without conflicts (does not actually modify files).

    *Example:*
    ```bash
    taylored --verify-remove feature_new-functionality
    # or
    taylored --verify-remove feature_new-functionality.taylored # (also valid)
    ```

* #### List available `.taylored` files
    ```bash
    taylored --list
    ```
    Shows all `.taylored` files found in the `.taylored/` directory.

    *Example:*
    ```bash
    taylored --list
    ```

* #### Update offsets of an existing `.taylored` file
    ```bash
    taylored --offset <taylored_file_name> [--message "Custom commit message"]
    ```
    Updates the line number offsets within the specified `.taylored` file (located in the `.taylored/` directory) so that it can be applied cleanly to the current state of the repository. This is useful if the underlying code has changed since the patch was originally created, causing the original line numbers in the patch to no longer match.
    **Prerequisite:** This command will not run if there are uncommitted changes in your Git working directory. Please commit or stash your changes first.
    If `--message` is provided, its value is used to embed a `Subject: [PATCH] Your Custom Message` line in the *output* `.taylored` file, assuming the file is updated and the new diff content is not empty. This does *not* affect the commit messages of temporary commits made by the offset process itself, which use a default message. If no `--message` is given, Taylored attempts to carry over an existing message from the input patch for the `Subject:` line.
    The file is updated in place.

    *Example:*
    ```bash
    taylored --offset my_feature_patch
    # or
    taylored --offset my_feature_patch.taylored --message "Refactor: Adjust patch for latest changes"
    ```

* #### Extract commit message data from a `.taylored` file
    ```bash
    taylored --data <taylored_file_name>
    ```
    Reads the specified `.taylored` file and prints the extracted commit message (typically from a `Subject:` line) to standard output. If no message is found in the patch (e.g., it wasn't saved with one or the format is unexpected), it prints an empty string. This is useful for scripting or inspecting the intended purpose of a patch.

* #### Automatically find and extract taylored blocks (Git Workflow)
    ```bash
    taylored --automatic <EXTENSIONS> <branch_name> [--exclude <DIR_LIST>]
    ```
    Scans files with the specified `<EXTENSIONS>` (e.g., a single extension like `ts` or a comma-separated list like `ts,js,py`) for taylored blocks and creates individual, diff-based `.taylored` files for each block using a Git workflow, comparing against the specified `<branch_name>`.
    Optionally, specific directories can be excluded from the scan using the `--exclude` parameter.

    **Arguments**:
    *   `<EXTENSIONS>`: File extension(s) to scan (e.g., 'ts' or 'ts,js,py').
    *   `<branch_name>`: Branch name to use as the base for comparison when generating diffs.
    *   `<DIR_LIST>` (used with `--exclude`): An optional comma-separated list of directory names to exclude from scanning (e.g., `node_modules,dist,build`).

    **Prerequisites**:
    *   **Clean Git Repository**: The command must be run in a Git repository with no uncommitted changes or untracked files.
    *   **No `.taylored/main.taylored`**: The file `.taylored/main.taylored` must not exist, as it's used as a temporary name during the internal save step.
    *   **No Target File Conflict**: The specific output file (e.g., `.taylored/1.taylored` for a block numbered `1`) must not already exist.

    **Workflow Overview**:
    The command iterates through each file matching the specified `<EXTENSIONS>` and processes blocks defined by `<taylored NUMERO>` and `</taylored>` markers. For each block:
    1.  A temporary Git branch is created from the current branch.
    2.  On this temporary branch, the entire block (including the start and end markers) is removed from the source file.
    3.  This removal is committed on the temporary branch.
    4.  The tool then internally simulates `taylored --save <branch_name>` (where `<branch_name>` is the branch you provided). This compares `HEAD` (the commit on the temporary branch with the block removed) against the `<branch_name>` you specified. The resulting diff represents the changes needed to "add" the block back to the state where it was removed (relative to that branch).
    5.  This diff is initially saved as `.taylored/main.taylored` (this is a fixed intermediate name).
    6.  The file `.taylored/main.taylored` is then renamed to `.taylored/NUMERO.taylored`, where `NUMERO` is taken from the block's start marker.
    7.  Finally, the temporary Git branch is deleted, and the repository is switched back to the original branch. The source files remain untouched on the original branch.

    **Output**:
    *   For each taylored block, a file named `.taylored/NUMERO.taylored` is created (e.g., `.taylored/1.taylored`, `.taylored/42.taylored`).
    *   Each such file contains a Git diff. Applying this diff file (e.g., using `taylored --add NUMERO`) would add the taylored block (including its markers) to the source file from which it was extracted (relative to the state of the `<branch_name>` you specified at the time of extraction).

    **Markers**:
    *   Start marker: `<taylored NUMERO>` (e.g., `<taylored 1>`, `<taylored 42>`). `NUMERO` is an integer that becomes the name of the output `.taylored` file (e.g., `1.taylored`).
    *   End marker: `</taylored>`

    It's important to note that **taylored markers affect the entire line they are on.** If markers are placed on a line containing code or comments, the entire line, including the code and/or comments, will be considered part of the taylored block.

    **Example of markers on the same line:**

    Consider the following line in a JavaScript file:

    ```javascript
    function specialProcess() { /* Some specific logic */ } // <taylored 30> Special Comment Block // </taylored>
    ```

    In this case, the taylored block `30` would include the entire line: `function specialProcess() { /* Some specific logic */ } // <taylored 30> Special Comment Block // </taylored>`. When `taylored --automatic js` is run, the generated `.taylored/30.taylored` file will contain this whole line as part of the diff to be added.

    **Extensions and Exclude Arguments**:
    *   `<EXTENSIONS>` specifies which file extensions to scan. It can be a single extension (e.g., `ts`, `py`, `java`) or a comma-separated list of extensions (e.g., `ts,js,mjs,py`). The leading dot for extensions is optional (e.g., `ts` is treated the same as `.ts`).
    *   The search is recursive. By default, it excludes `.git` and the `.taylored` directory itself.
    *   The `--exclude <DIR_LIST>` parameter allows you to specify additional directories to exclude from the scan. `<DIR_LIST>` is a comma-separated string of directory names (e.g., `node_modules,dist,build_output`). If you need to exclude `node_modules`, you must now explicitly add it to this list. Subdirectories of excluded directories are also excluded.

    ### Example: Using `--automatic` (Git Workflow)

    Suppose you have a file `src/feature.js` on your `main` branch, committed with the following content:

    ```javascript
    // src/feature.js
    function existingCode() {
      // ...
    }

    // <taylored 15>
    function newFeaturePart() {
      console.log("This is a new, self-contained feature snippet.");
    }
    // </taylored>

    console.log("End of file.");
    ```

    To create a taylored diff file for block `15`:

    1.  Ensure your Git working directory is clean.
    2.  Ensure `.taylored/main.taylored` and `.taylored/15.taylored` do not exist.
    3.  Run the command (if `src/feature.js` is the target, assuming `main` is your desired base branch for the diff):
        ```bash
        taylored --automatic js main
        ```
    4.  To scan for multiple extensions (e.g., JavaScript and TypeScript) against the `develop` branch, and exclude `node_modules` and `dist` directories:
        ```bash
        taylored --automatic js,ts develop --exclude node_modules,dist
        ```

    This will:
    *   Internally perform Git operations: create a temporary branch, remove the block, commit, and generate a diff against the `main` branch (or the branch you specified).
    *   Create a file named `.taylored/15.taylored`.
    *   The content of `.taylored/15.taylored` will be a Git diff, which, if applied, would add the block to `src/feature.js`. It would look something like this:

        ```diff
        --- a/src/feature.js
        +++ b/src/feature.js

           // ...
         }
         
        +// <taylored 15>
        +function newFeaturePart() {
        +  console.log("This is a new, self-contained feature snippet.");
        +}
        +// </taylored>
        +
         console.log("End of file.");
        ```
    *   Your `src/feature.js` file on your `main` branch will remain unchanged by this operation.

## How it Works

* **Saving:** When you use `taylored --save <branch_name>`, it runs `git diff HEAD <branch_name>`. The output is parsed. If all changes are additions, all changes are deletions (of lines), or there are no textual line changes, the diff is saved to `.taylored/<sanitized_branch_name>.taylored`. Otherwise (mixed changes), no file is created, and an error is reported.
* **Applying/Removing:** `taylored --add <file>` uses `git apply .taylored/<file>`. `taylored --remove <file>` uses `git apply -R .taylored/<file>`.
* **Verifying:** `taylored --verify-add <file>` uses `git apply --check .taylored/<file>`. `taylored --verify-remove <file>` uses `git apply --check -R .taylored/<file>`.
* **Listing:** `taylored --list` simply lists files matching `*.taylored` in the `.taylored/` directory.
* **Offsetting:** `taylored --offset <file> [--message "Custom Text"]` uses a sophisticated approach (`lib/git-patch-offset-updater.js`). **It first checks for uncommitted changes in the repository; if any exist, the command will exit.** Otherwise, it attempts to apply/revert the patch on a temporary branch, generates a new patch from this state against the `main` branch, and then replaces the original `.taylored/<file>` with this new, offset-adjusted patch. If the `--message` option is used, this message is intended for the `Subject:` line of the *output* `.taylored` file. Temporary commits made during the process use a default internal message. This can help when the original patch fails to apply due to context changes (lines shifted up or down).
* **Data Extraction:** `taylored --data <file>` reads the content of the specified `.taylored` file and uses a parsing logic (similar to the one used internally by `--offset` when no custom message is given) to find and extract a commit message, typically from the "Subject:" line of a patch file. It prints this message or an empty string if no message is found.
* **Automatic Extraction (Git Workflow):** `taylored --automatic <EXTENSIONS> <branch_name> [--exclude <DIR_LIST>]` requires a clean Git state. It scans files matching the specified extensions, skipping any directories listed in `--exclude` (and their subdirectories), as well as the default exclusions (`.git`, `.taylored`). For each taylored block found (delimiters: `<taylored NUMERO>` and `</taylored>`):
    1. It creates a temporary branch.
    2. In this branch, it removes the block from the source file and commits this change.
    3. It then generates a diff by comparing `HEAD` (the temporary branch with the block removed) to the `<branch_name>` specified in the command. This diff represents the addition of the block.
    4. This diff is initially saved as `.taylored/main.taylored` (a temporary name) by an internal call that effectively performs a save operation against your specified `<branch_name>`.
    5. The file `.taylored/main.taylored` is renamed to `.taylored/NUMERO.taylored`.
    6. The temporary branch is deleted, and the original branch is restored. The source files on the original branch are not modified by this process.
    This ensures that each `.taylored/NUMERO.taylored` file is a proper Git diff.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues on the [GitHub repository](https://github.com/tailot/taylored).

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details (assuming a LICENSE file exists, if not, state "MIT Licensed").
