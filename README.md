# taylored

Make changes to a branch a plugin. A command-line tool to manage and apply '\'''.taylored'\''' plugins. It supports applying, removing, verifying plugins, and generating them from a branch (GIT).

## What is Taylored?

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
    Attempts to upgrade all existing `.taylored` files in the `.taylored/` directory. For each file, it assumes the filename (minus the `.taylored` extension) is the name of a branch. It then re-calculates the diff against HEAD. If the new diff is still "pure" (all additions or all deletions), the file is updated. Otherwise, it is marked as obsolete/conflicted and not changed.

    *Example:*
    ```bash
    taylored --upgrade
    ```

* #### Update offsets of an existing `.taylored` file
    ```bash
    taylored --offset <taylored_file_name>
    ```
    Updates the line number offsets within the specified `.taylored` file (located in the `.taylored/` directory) so that it can be applied cleanly to the current state of the repository. This is useful if the underlying code has changed since the patch was originally created, causing the original line numbers in the patch to no longer match. The command uses the `lib/git-patch-offset-updater.js` logic to achieve this. The file is updated in place.

    *Example:*
    ```bash
    taylored --offset my_feature_patch
    # or
    taylored --offset my_feature_patch.taylored # (also valid)
    ```

## How it Works

* **Saving:** When you use `taylored --save <branch_name>`, it runs `git diff HEAD <branch_name>`. The output is parsed. If all changes are additions OR all changes are deletions (of lines), the diff is saved to `.taylored/<sanitized_branch_name>.taylored`. Otherwise, no file is created, and an error is reported.
* **Applying/Removing:** `taylored --add <file>` uses `git apply .taylored/<file>`. `taylored --remove <file>` uses `git apply -R .taylored/<file>`.
* **Verifying:** `taylored --verify-add <file>` uses `git apply --check .taylored/<file>`. `taylored --verify-remove <file>` uses `git apply --check -R .taylored/<file>`.
* **Listing:** `taylored --list` simply lists files matching `*.taylored` in the `.taylored/` directory.
* **Upgrading:** `taylored --upgrade` iterates through each file in `.taylored/`. For a file like `feature-x.taylored`, it assumes `'feature-x'` is the branch name. It then effectively re-runs the `--save` logic for that assumed branch name: `git diff HEAD feature-x`. If the new diff is "pure" (all additions or all deletions), `feature-x.taylored` is overwritten with this new diff. If the new diff is mixed, the file is reported as obsolete/conflicted and is not modified.
* **Offsetting:** `taylored --offset <file>` uses a more sophisticated approach (`lib/git-patch-offset-updater.js`). It attempts to apply the patch to a temporary branch, generate a new patch from the applied state, and then replace the original `.taylored/<file>` with this new, offset-adjusted patch. This can help when the original patch fails to apply due to context changes (lines shifted up or down).

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues on the [GitHub repository](https://github.com/tailot/taylored).

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m '\''Add some AmazingFeature'\''`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details (assuming a LICENSE file exists, if not, state "MIT Licensed").
