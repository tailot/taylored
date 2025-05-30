# taylored

Make changes to a branch a plugin. A command-line tool to manage and apply '\''.taylored'\'' plugins. It supports applying, removing, verifying plugins, and generating them from a branch (GIT).

## What is Taylored?
a
a
a

Taylored is a tool that helps you manage source code changes in the form of "plugins" or "patches". These plugins are represented by files with the `.taylored` extension, which contain the differences (diffs) compared to a specific version of the code.

A distinctive feature of Taylored is its ability to generate these `.taylored` files conditionally: a plugin is created using the `--save` command only if the changes between the specified branch and HEAD consist *exclusively* of line additions or *exclusively* of line deletions. This ensures that plugins represent atomic and well-defined changes, making them easier to apply and manage.

The tool also provides an `--upgrade` command that attempts to update existing `.taylored` files. It re-calculates the diff for each file (assuming the filename corresponds to a branch name) against the current HEAD. If the new diff remains "pure" (all additions or all deletions), the file is updated. Otherwise, it'\''s flagged as potentially obsolete or conflicted, indicating that the relationship between the original branch and HEAD has changed in a way that no longer produces a simple, atomic patch.

## Installation

### Recommended Method (for Users)

The easiest way to install Taylored is globally via npm. This will make the `taylored` command available in your system:

```bash
npm install -g taylored
```

Make sure you have Node.js and npm installed. After installation, you can run `taylored --help` to see the available commands.

### For Developers and Contributors

If you want to contribute to Taylored'\''s development, modify its code, or run it from a local copy:

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

* Directly with Node.js (if you'\''ve run `npm run build`):
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

* #### Upgrade existing `.taylored` files
    ```bash
    taylored --upgrade
    ```
    Attempts to upgrade all existing `.taylored` files in the `.taylored/` directory. For each file, it assumes the filename (minus the `.taylored` extension) is the name of a branch. It then re-calculates the diff