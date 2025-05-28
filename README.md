# taylored

Make changes to a branch a plugin. A command-line tool to manage and apply '.taylored' plugins. It supports applying, removing, verifying plugins, and generating them from a branch (GIT).

## What is Taylored?

Taylored is a tool that helps you manage source code changes in the form of "plugins" or "patches". These plugins are represented by files with the `.taylored` extension, which contain the differences (diffs) compared to a specific version of the code.

A distinctive feature of Taylored is its ability to generate these `.taylored` files conditionally: a plugin is created using the `--save` command only if the changes between the specified branch and HEAD consist *exclusively* of line additions or *exclusively* of line deletions. This ensures that plugins represent atomic and well-defined changes, making them easier to apply and manage.

The tool also provides an `--upgrade` command that attempts to update existing `.taylored` files. It re-calculates the diff for each file (assuming the filename corresponds to a branch name) against the current HEAD. If the new diff remains "pure" (all additions or all deletions), the file is updated. Otherwise, it's flagged as potentially obsolete or conflicted, indicating that the relationship between the original branch and HEAD has changed in a way that no longer produces a simple, atomic patch.

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
    **Note:** The file is created *only if* the diff contains exclusively line additions or exclusively line deletions. Mixed changes will not generate a file.

    *Example:*
    ```bash
    taylored --save feature/new-functionality
    ```

* #### Apply changes from a `.taylored` file
    ```bash
    taylored --add <filename.taylored>
    ```
    Applies the changes contained in the specified file (which must be in `.taylored/`) to your current working directory.

    *Example:*
    ```bash
    taylored --add feature_new-functionality.taylored
    ```

* #### Remove (undo) changes from a `.taylored` file
    ```bash
    taylored --remove <filename.taylored>
    ```
    Undoes the changes specified in the `.taylored` file from your current working directory.

    *Example:*
    ```bash
    taylored --remove feature_new-functionality.taylored
    ```

* #### Verify the application of a `.taylored` file (dry-run)
    ```bash
    taylored --verify-add <filename.taylored>
    ```
    Checks if the `.taylored` file can be applied without conflicts (does not actually modify files).

    *Example:*
    ```bash
    taylored --verify-add feature_new-functionality.taylored
    ```

* #### Verify the removal of a `.taylored` file (dry-run)
    ```bash
    taylored --verify-remove <filename.taylored>
    ```
    Checks if the changes specified in the `.taylored` file can be undone without conflicts (does not actually modify files).

    *Example:*
    ```bash
    taylored --verify-remove feature_new-functionality.taylored
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

* #### Upgrade existing `.taylored` files
    ```bash
    taylored --upgrade
    ```
    Attempts to upgrade all existing `.taylored` files in the `.taylored/` directory. For each file, it assumes the filename (minus the `.taylored` extension) is the name of a branch. It then re-calculates the diff between this assumed branch and the current `HEAD`.
    If the new diff consists exclusively of line additions or exclusively of line deletions (or is empty), the `.taylored` file is updated with this new diff.
    If the new diff contains a mix of additions and deletions, or if an error occurs (e.g., the assumed branch no longer exists), the file is not modified and a warning or error is reported for that specific file. This helps identify plugins that may have become "obsolete" or "conflicted" due to changes in `HEAD` or the feature branch.

    *Example:*
    ```bash
    taylored --upgrade
    ```

### Notes on Command Usage
* `<filename.taylored>`: Refers to the name of the plugin file (e.g., `my_patch.taylored`) located in the `.taylored/` directory. It must end with the `.taylored` extension.
* `<branch_name>`: Refers to the name of the Git branch to compare with HEAD for the `--save` command. The generated filename will be a "sanitized" version of the branch name (e.g., `feature/X` becomes `feature-X.taylored`).
* **Working Directory State for `--upgrade`**: The `--upgrade` command calculates diffs based on the committed state of branches (`HEAD` and the branch assumed from the filename). Uncommitted changes in your working directory will *not* be included in these diff calculations. Commit your changes first if you want them to be reflected in the upgraded `.taylored` files.

## How It Works (Behind the Scenes)

Taylored relies on standard Git commands for managing changes:

* For **generating** `.taylored` files (with the `--save` command) and for **upgrading** them (with `--upgrade`), it uses `git diff` to calculate the differences between the specified branch (or assumed branch) and HEAD. The `parse-diff` library is then used to analyze this diff to ensure it meets the "purity" criteria (all additions or all deletions).
* For **applying**, **removing**, and **verifying** `.taylored` files (commands `--add`, `--remove`, `--verify-add`, `--verify-remove`), it uses `git apply`. This command is designed to apply patches created with `git diff`.

## Contributing

Contributions are welcome! If you find bugs, have suggestions for new features, or want to contribute to the code:

* **Bug Reports:** Open a detailed issue on the [GitHub Issues](https://github.com/tailot/taylored/issues) page.
* **Improvement Proposals:** Open an issue to discuss your ideas.
* **Pull Requests:** If you wish to contribute directly to the code:
    1.  Fork the [taylored repository on GitHub](https://github.com/tailot/taylored).
    2.  Create a new branch for your changes.
    3.  Make your changes, ensuring you follow the existing code style.
    4.  Compile the code (`npm run build`) if you have modified TypeScript files.
    5.  Submit a Pull Request to the main repository.

## License

This project is released under the MIT License. See the `LICENSE` file (you would typically have a LICENSE file in your repository) for more details.