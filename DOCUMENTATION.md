# Taylored: Comprehensive Documentation

## Table of Contents

1.  [Introduction](#introduction)
    *   [What is Taylored?](#what-is-taylored)
    *   [Core Purpose and Philosophy](#core-purpose-and-philosophy)
    *   [Key Benefits](#key-benefits)
2.  [Installation](#installation)
    *   [Quick Install via npm (Recommended)](#quick-install-via-npm-recommended)
    *   [Development Setup from Source](#development-setup-from-source)
        *   [Cloning the Repository](#cloning-the-repository)
        *   [Installing Dependencies](#installing-dependencies)
        *   [Building the Project](#building-the-project)
        *   [Running Locally](#running-locally)
    *   [Troubleshooting Common Installation Issues](#troubleshooting-common-installation-issues)
3.  [Usage Prerequisites](#usage-prerequisites)
    *   [Running from Git Repository Root](#running-from-git-repository-root)
    *   [The `.taylored/` Directory](#the-taylored-directory)
4.  [Commands](#commands)
    *   [Overview of Command Structure](#overview-of-command-structure)
    *   [`taylored --save <branch_name>`](#taylored---save-branch_name)
        *   [Purpose](#purpose-save)
        *   [Arguments](#arguments-save)
        *   [Use Cases](#use-cases-save)
        *   [Examples](#examples-save)
    *   [`taylored --add <taylored_file_name>`](#taylored---add-taylored_file_name)
        *   [Purpose](#purpose-add)
        *   [Arguments](#arguments-add)
        *   [Use Cases](#use-cases-add)
        *   [Examples](#examples-add)
    *   [`taylored --remove <taylored_file_name>`](#taylored---remove-taylored_file_name)
        *   [Purpose](#purpose-remove)
        *   [Arguments](#arguments-remove)
        *   [Use Cases](#use-cases-remove)
        *   [Examples](#examples-remove)
    *   [`taylored --verify-add <taylored_file_name>`](#taylored---verify-add-taylored_file_name)
        *   [Purpose](#purpose-verify-add)
        *   [Arguments](#arguments-verify-add)
        *   [Use Cases](#use-cases-verify-add)
        *   [Examples](#examples-verify-add)
    *   [`taylored --verify-remove <taylored_file_name>`](#taylored---verify-remove-taylored_file_name)
        *   [Purpose](#purpose-verify-remove)
        *   [Arguments](#arguments-verify-remove)
        *   [Use Cases](#use-cases-verify-remove)
        *   [Examples](#examples-verify-remove)
    *   [`taylored --list`](#taylored---list)
        *   [Purpose](#purpose-list)
        *   [Use Cases](#use-cases-list)
        *   [Examples](#examples-list)
    *   [`taylored --offset <taylored_file_name> [BRANCH_NAME]`](#taylored---offset-taylored_file_name-branch_name)
        *   [Purpose](#purpose-offset)
        *   [Arguments](#arguments-offset)
        *   [Use Cases](#use-cases-offset)
        *   [Examples](#examples-offset)
    *   [`taylored --upgrade <taylored_file_name> [BRANCH_NAME]`](#taylored---upgrade-taylored_file_name-branch_name)
        *   [Purpose](#purpose-upgrade)
        *   [Arguments](#arguments-upgrade)
        *   [Use Cases](#use-cases-upgrade)
        *   [Important Considerations](#important-considerations-upgrade)
        *   [Examples](#examples-upgrade)
    *   [`taylored --automatic <EXTENSIONS> <branch_name> [--exclude <DIR_LIST>]`](#taylored---automatic-extensions-branch_name---exclude-dir_list)
        *   [Purpose](#purpose-automatic)
        *   [Arguments](#arguments-automatic)
        *   [Core Concept: Taylored Blocks](#core-concept-taylored-blocks)
        *   [Marker Syntax](#marker-syntax)
        *   [JSON Block Syntax](#json-block-syntax)
        *   [Dynamic Content with `compute`](#dynamic-content-with-compute)
            *   [`compute="CHARS_TO_STRIP_PATTERNS"` attribute](#computecharstostrippatterns-attribute)
            *   [`async="true|false"` attribute](#asynctruefalse-attribute)
            *   [Script Execution Details](#script-execution-details)
            *   [Error Handling (Sync and Async)](#error-handling-sync-and-async)
        *   [Exclusion Mechanism (`--exclude`)](#exclusion-mechanism---exclude)
        *   [Use Cases](#use-cases-automatic)
        *   [Examples (`--automatic`)](#examples-automatic)
            *   [Basic Block Extraction](#basic-block-extraction)
            *   [Using `compute` for Dynamic Data](#using-compute-for-dynamic-data)
            *   [Using `compute` with `async="true"`](#using-compute-with-asynctrue)
            *   [Complex Scripting and `CHARS_TO_STRIP_PATTERNS`](#complex-scripting-and-charstostrippatterns)
            *   [Excluding Directories](#excluding-directories)
            *   [Example 6: Using `compute` with Python](#example-6-using-compute-with-python)
            *   [Example 7: Using `compute` with a Shell Script](#example-7-using-compute-with-a-shell-script)
    *   [`taylored setup-backend`](#taylored-setup-backend)
        *   [Purpose](#purpose-setup-backend)
        *   [Process](#process-setup-backend)
        *   [Usage Example](#usage-example-setup-backend)
    *   [`taylored create-taysell <file.taylored> [--price <price>] [--desc "description"]`](#taylored-create-taysell-filetaylored---price-price---desc-description)
        *   [Purpose](#purpose-create-taysell)
        *   [Arguments](#arguments-create-taysell)
        *   [Process](#process-create-taysell)
        *   [Usage Example](#usage-example-create-taysell)
    *   [`taylored --buy <file.taysell> [--dry-run]`](#taylored---buy-filetaysell---dry-run)
        *   [Purpose](#purpose-buy)
        *   [Arguments](#arguments-buy)
        *   [Process](#process-buy)
        *   [Usage Example](#usage-example-buy)
5.  [How It Works (Under the Hood)](#how-it-works-under-the-hood)
    *   [`--save`](#how-save-works)
    *   [`--add` / `--remove`](#how-add-remove-works)
    *   [`--verify-add` / `--verify-remove`](#how-verify-works)
    *   [`--list`](#how-list-works)
    *   [`--offset`](#how-offset-works)
    *   [`--automatic`](#how-automatic-works)
6.  [Contributing](#contributing)
    *   [Reporting Issues](#reporting-issues)
    *   [Submitting Pull Requests](#submitting-pull-requests)
7.  [License](#license)
8.  [Project Templates](#project-templates)
    *   [Backend-in-a-Box](#backend-in-a-box)
        *   [Overview](#bib-overview)
        *   [PayPal Integration for Patch Monetization](#bib-paypal-integration)
        *   [Environment Variables](#bib-env-vars)
        *   [API Endpoints](#bib-api-endpoints)
        *   [The `patches/` Directory](#bib-patches-dir)
        *   [Key Dependencies](#bib-dependencies)
        *   [Docker Configuration](#bib-docker-config)

## 1. Introduction

Welcome to the comprehensive guide for Taylored! This document aims to provide an exhaustive overview of Taylored, from its foundational concepts to advanced command usage. Whether you're a new user or looking to deepen your understanding, this guide is for you.

### What is Taylored?

Taylored is a powerful command-line tool (CLI) designed to revolutionize how developers manage and apply source code modifications. It operates by treating changesets as portable "plugins" or "patches." These Taylored plugins are stored in special `.taylored` files, which are essentially structured `git diff` outputs.

At its core, Taylored provides a systematic way to isolate, store, and apply specific code alterations, making it easier to handle conditional features, experimental code, or version-specific customizations across different branches or states of a project.

### Core Purpose and Philosophy

The primary goal of Taylored is to bring precision and atomicity to the management of code changes. Its philosophy centers around a few key principles:

*   **Atomic Changes**: Taylored encourages modifications that are either purely additive or purely deletive. For instance, the `taylored --save` command will only generate a `.taylored` plugin if the changes between a specified branch and `HEAD` consist *exclusively* of line additions or *exclusively* of line deletions. This ensures that plugins are clean, well-defined, and less prone to conflicts, simplifying their application and management.
*   **Versionable Modifications**: By encapsulating changes into files, Taylored allows complex or conditional code snippets to be versioned and managed as distinct entities within your project's `.taylored/` directory.
*   **Git-Powered Reliability**: Taylored leverages Git's robust and mature diffing and patching capabilities for its core operations. This means you're benefiting from the same underlying technology that powers modern version control.
*   **Automation for Efficiency**: With features like the `taylored --automatic` command, Taylored can scan your codebase for specially marked blocks of code, extract them, and generate `.taylored` plugins. This is particularly useful for managing numerous small features or configurations embedded within your code.
*   **Dynamic Content Generation**: Taylored isn't limited to static patches. The `taylored --automatic` command, via its `compute` attribute, allows for the execution of scripts (e.g., Node.js, Python, shell scripts) to dynamically generate the content of a patch. This opens up possibilities for creating patches that adapt to different contexts or include up-to-date information.

### Key Benefits

Adopting Taylored into your development workflow can offer several advantages:

*   **Streamlined Feature Flagging**: Manage features that are not yet ready for production by keeping their code in `.taylored` plugins, applying them only when needed in specific environments or branches.
*   **Simplified Customization**: For projects that require slight variations for different clients or deployments, Taylored allows you to maintain a core codebase and apply specific customizations as plugins.
*   **Enhanced Code Modularity**: Break down large features or refactors into smaller, manageable patches that can be applied and tested independently.
*   **Improved Collaboration**: Share specific changes or experimental features with team members easily through `.taylored` plugins without immediately merging them into main development lines.
*   **Reduced Merge Conflicts**: By keeping certain changes isolated, Taylored can help reduce the complexity of merges, especially when dealing with long-lived feature branches.
*   **Clearer History**: While Git provides a commit history, Taylored provides a history of "features" or "modifications" that can be applied or removed, offering a different lens through which to view project evolution.

By transforming branch changes into manageable and conditional plugins, Taylored offers a sophisticated yet intuitive approach to source code modification.

## 2. Installation

This section guides you through installing Taylored, whether you want a quick setup for immediate use or a development environment to contribute or run from source.

### Quick Install via npm (Recommended)

For most users, the recommended way to install Taylored is globally via npm (Node Package Manager). This makes the `taylored` command readily available in your system's terminal.
Taylored is available in two versions:

*   **`taylored` (Full Version)**: Includes all features, including monetization functionalities (`setup-backend`, `create-taysell`, `taylored --buy`).
    ```bash
    npm install -g taylored
    ```
*   **`taylo` (Lite Version)**: A more essential version focusing on core patch management, excluding monetization features. Ideal for users needing only the fundamental code manipulation capabilities.
    ```bash
    npm install -g taylo
    ```

**Prerequisites:**
*   Node.js (which includes npm). If you don't have Node.js installed, download it from [nodejs.org](https://nodejs.org/). It's advisable to use a Long Term Support (LTS) version.

**Installation Steps:**
1.  Choose your preferred version and open your terminal or command prompt.
2.  Run the corresponding installation command (see above).
    The `-g` flag ensures the package is installed globally, making the `taylored` (or `taylo`) CLI accessible from any directory.

3.  **Verify Installation:** After the installation completes, you can verify it by running:
    ```bash
    taylored
    ```
    This should display the installed version of Taylored or a list of available commands, confirming the installation was successful.

### Development Setup from Source

If you plan to contribute to Taylored, modify its source code, or run a specific version not yet published on npm, you'll need to set it up from source.

**Prerequisites:**
*   Git: For cloning the repository.
*   Node.js and npm: For managing dependencies and running/building the project.

#### Cloning the Repository

1.  Navigate to the directory where you want to store the project.
2.  Clone the Taylored repository from GitHub:
    ```bash
    git clone git@github.com:tailot/taylored.git
    ```
    Alternatively, you can use HTTPS:
    ```bash
    git clone https://github.com/tailot/taylored.git
    ```
3.  Change into the project directory:
    ```bash
    cd taylored
    ```

#### Installing Dependencies

Once you have cloned the repository, you need to install the project's dependencies (libraries and tools it relies on).

1.  From the root directory of the `taylored` project, run:
    ```bash
    npm install
    ```
    This command reads the `package.json` file and downloads the required packages into the `node_modules` directory.

#### Building the Project

Taylored is written in TypeScript. To run it, you need to compile the TypeScript code into JavaScript.

1.  From the project's root directory, run the build script:
    ```bash
    npm run build
    ```
    This command executes the build process defined in `package.json` (typically using `tsc`, the TypeScript compiler), which compiles the TypeScript files (usually from a `lib/` or `src/` directory) into JavaScript files in a `dist/` directory.

#### Running Locally

After building the project, you can run your local version of Taylored in a couple of ways:

*   **Directly with Node.js:**
    You can execute the compiled entry point (usually `dist/index.js`) directly using Node.js:
    ```bash
    node dist/index.js <command>
    # Example: node dist/index.js --list
    # Example: node dist/index.js --save my-feature
    ```

*   **Using `npm link`:**
    To use the `taylored` command globally but have it point to your local development version, you can use `npm link`. This is very convenient for testing your changes as if the tool were installed globally.
    1.  From the project's root directory, run:
        ```bash
        npm link
        ```
        This might require administrator/sudo privileges depending on your system configuration.
    2.  Now, when you run `taylored <command>` anywhere on your system, it will use your local development build.
    3.  **Important**: If you make changes to the TypeScript source code, remember to run `npm run build` again to recompile the code. `npm link` automatically uses the updated build output in the `dist/` directory.

    To unlink your local version and revert to a globally installed npm version (or remove the link if no other version is installed), navigate back to the project's root directory and run:
    ```bash
    npm unlink
    ```

### Troubleshooting Common Installation Issues

*   **Permission Errors (EACCES) with `npm install -g`:**
    If you get permission errors when installing globally, it means npm doesn't have the rights to write to the global `node_modules` directory.
    *   **Solution 1 (Recommended):** Configure npm to use a different directory. See the npm documentation on [fixing EACCES permissions errors](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).
    *   **Solution 2 (Use with caution):** Prefix the command with `sudo`: `sudo npm install -g taylored`. This is generally discouraged as it can create security risks if you install malicious packages.

*   **`taylored: command not found`:**
    This usually means the global npm binary directory is not in your system's `PATH`.
    *   **Solution:** Find your npm global binary directory (usually `npm bin -g` can help identify it) and add it to your shell's `PATH` environment variable. The method varies depending on your operating system and shell (e.g., editing `.bashrc`, `.zshrc`, or Environment Variables on Windows).

*   **Node.js or npm Not Found:**
    Ensure Node.js and npm are correctly installed and accessible. You can check their versions with `node -v` and `npm -v`. If not found, reinstall Node.js from [nodejs.org](https://nodejs.org/).

*   **Build Failures (Development Setup):**
    If `npm run build` fails:
    *   Ensure all dependencies were installed correctly with `npm install`.
    *   Check for any error messages from the TypeScript compiler (`tsc`). They often provide clues about syntax errors or type mismatches in the code (though this is more relevant if you've modified the source).
    *   Ensure your Node.js version is compatible with the project's requirements (check `package.json` for an `engines` field if present).

## 3. Usage Prerequisites

Before you start using Taylored commands, it's important to understand a couple of fundamental prerequisites related to your project structure and environment. Adhering to these ensures Taylored functions as expected.

### Running from Git Repository Root

**Taylored is designed to be run from the root directory of a Git repository.**

*   **Why?** Taylored heavily relies on Git commands (like `git diff`, `git apply`, `git checkout`, `git commit`) to perform its operations. These Git commands operate in the context of a Git repository. Running Taylored from outside a Git repository, or from a subdirectory, will likely lead to errors or unexpected behavior because it won't be able to find the `.git` directory and correctly interpret repository information.

*   **How to ensure:** Always navigate to the main root folder of your project (the one containing the `.git` subdirectory) in your terminal before executing any `taylored` commands.

    ```bash
    # Example:
    # Assuming your project 'my-git-project' is in your home directory
    cd ~/my-git-project

    # Now you can run taylored commands
    taylored --list
    taylored --save new-feature
    ```

### The `.taylored/` Directory

**Taylored stores and manages its plugin files (the `.taylored` files) in a dedicated directory named `.taylored/` located at the root of your Git repository.**

*   **Creation:** If this directory doesn't exist when you run a command that needs it (like `taylored --save` or `taylored --automatic`), Taylored will attempt to create it for you.
*   **Purpose:** This directory acts as a centralized store for all your Taylored plugins. Each `.taylored` file within this directory represents a specific set of changes (a patch).
*   **Version Control:** It is highly recommended to **commit the `.taylored/` directory and its contents to your Git repository.** This allows you to version your Taylored plugins, share them with your team, and ensure that everyone has access to the same set of modifications.
    ```bash
    # After generating some .taylored files:
    git add .taylored/
    git commit -m "Add initial Taylored plugins for feature X and Y"
    ```

*   **Structure:**
    ```
    my-git-project/
    ├── .git/
    ├── .taylored/  <-- Taylored's directory
    │   ├── feature-A.taylored
    │   ├── bugfix-B.taylored
    │   └── 1.taylored
    ├── src/
    │   └── ...
    └── package.json
    ```

By understanding and respecting these prerequisites, you'll have a smoother experience using Taylored to manage your source code modifications.

## 4. Commands

Taylored's functionalities are accessed through a series of command-line flags. This section provides an exhaustive reference for each available command, including its purpose, arguments, common and advanced use cases, and practical examples.

### Overview of Command Structure

Most Taylored commands follow a simple structure:

```bash
taylored <command_flag> [arguments...]
```

*   `taylored`: The executable name.
*   `<command_flag>`: A flag that specifies the operation to perform (e.g., `--save`, `--add`). Each command typically corresponds to one primary flag.
*   `[arguments...]`: One or more arguments that provide necessary information for the command, such as branch names or filenames. Argument order usually matters.

**Note:** All commands should be executed from the root of your Git repository.

---

### `taylored --save <branch_name>`

#### Purpose (`--save`)

The `taylored --save <branch_name>` command is used to **capture the difference between a specified Git branch and your current `HEAD` (your current working commit) and save it as a `.taylored` plugin file.**

A crucial condition for this command is its emphasis on **atomicity**:
*   The `.taylored` plugin file is created **only if** the diff (the set of changes) between `<branch_name>` and `HEAD` consists *exclusively* of line additions, *exclusively* of line deletions, or no textual line changes at all.
*   If the changes involve a mix of both added and deleted lines (a "mixed diff"), Taylored will refuse to create the plugin file and will output an error message. This strictness ensures that Taylored plugins represent clean, atomic operations, making them easier to understand, apply, and manage.

The generated file is named after the `<branch_name>` (sanitized to be filesystem-friendly) and stored in the `.taylored/` directory.

#### Arguments (`--save`)

*   **`<branch_name>` (Required)**:
    *   **Description**: The name of the Git branch you want to compare against your current `HEAD`. Taylored will calculate the changes that are present in `<branch_name>` but not in `HEAD`.
    *   **Format**: A valid Git branch name existing in your local repository.
    *   **Example**: `feature/new-ui`, `develop`, `topic/data-model-update`

#### Use Cases (`--save`)

*   **Capturing a New Feature**: You've developed a new feature on a branch (e.g., `feature/dark-mode`). Before merging it, or if you want to distribute it as an optional plugin, you can save it:
    1.  Ensure `HEAD` is on the base branch (e.g., `main` or `develop`).
    2.  Run `taylored --save feature/dark-mode`. If `feature/dark-mode` only adds new lines compared to `HEAD`, a plugin like `feature_dark-mode.taylored` is created.
*   **Extracting a Refactor for Conditional Application**: You've refactored a module on a branch `refactor/cleanup-module`. If this refactor only involves adding new helper functions and updating calls (effectively, only additions at a line level if old calls are removed in a separate step/branch or if it's a pure addition of utility), you can save this refactor to apply it conditionally.
*   **Saving a Set of Deletions**: Suppose you have a branch `cleanup/remove-old-api` where you've only deleted code related to a deprecated API. Running `taylored --save cleanup/remove-old-api` (while `HEAD` is on the base branch) would create a Taylored plugin that, when applied, removes that API. This is useful for temporarily backing out a feature or code segment.
*   **Creating an "Undo" Plugin for an Unmerged Feature**: If `HEAD` is on `feature/experimental-feature` and you want to create a plugin that represents the *removal* of this feature relative to `main`:
    1.  `git checkout feature/experimental-feature` (so `HEAD` is `feature/experimental-feature`).
    2.  `taylored --save main`.
    If `main` is behind `feature/experimental-feature`, this diff will primarily show deletions (the lines *added* in `feature/experimental-feature`). This would create a plugin that effectively removes the feature when applied to `feature/experimental-feature`.
*   **Automated Plugin Generation in CI/CD**: As part of a CI process, after a feature branch passes tests, you could automatically try to save it as a Taylored plugin. If it fails due to mixed changes, it might indicate the feature isn't "atomic" enough by Taylored's standards and might need refactoring or a different approach.

#### Examples (`--save`)

**Scenario 1: Saving a purely additive feature**

1.  **Initial state**: You are on the `main` branch.
    ```javascript
    // main branch: src/app.js
    function coreLogic() {
      console.log("Core logic running");
    }
    coreLogic();
    ```

2.  **Create and checkout a feature branch**:
    ```bash
    git checkout -b feature/add-greeting
    ```

3.  **Make additions on the feature branch**:
    ```javascript
    // feature/add-greeting branch: src/app.js
    function greet(name) {
      console.log(`Hello, ${name}!`);
    }

    function coreLogic() {
      console.log("Core logic running");
    }

    greet("TayloredUser");
    coreLogic();
    ```

4.  **Switch back to `main` (this is where `HEAD` needs to be for the comparison)**:
    ```bash
    git checkout main
    ```

5.  **Run `taylored --save`**:
    ```bash
    taylored --save feature/add-greeting
    ```

6.  **Result**:
    *   A file named `feature_add-greeting.taylored` (or similar, depending on sanitization) is created in the `.taylored/` directory.
    *   This file contains the diff representing the addition of the `greet` function and its call.
    *   Output message: `Successfully saved patch to .taylored/feature_add-greeting.taylored` (or similar).

**Scenario 2: Attempting to save mixed changes (will fail)**

1.  **Initial state**: You are on the `main` branch.
    ```javascript
    // main branch: src/config.js
    const settingA = true;
    const settingB = false;
    ```

2.  **Create and checkout a feature branch**:
    ```bash
    git checkout -b feature/update-config
    ```

3.  **Make mixed changes (additions and deletions) on the feature branch**:
    ```javascript
    // feature/update-config branch: src/config.js
    const settingA = false; // Line modified (effectively a delete + add)
    // const settingB = false; // Line deleted
    const settingC = true;  // Line added
    ```
    (Note: Modifying a line is often seen by `git diff` as a deletion of the old line and an addition of the new line.)

4.  **Switch back to `main`**:
    ```bash
    git checkout main
    ```

5.  **Run `taylored --save`**:
    ```bash
    taylored --save feature/update-config
    ```

6.  **Result**:
    *   No `.taylored` plugin file is created.
    *   An error message is displayed: `Error: Diff contains mixed additions and deletions. Patch not saved.` (or similar).

**Scenario 3: Saving a purely deletive change**

1.  **Initial state**: `main` has code that will be removed.
    ```javascript
    // main branch: src/utils.js
    function oldFunction() {
      console.log("This is an old function.");
    }
    function keepFunction() {
      console.log("This function is kept.");
    }
    oldFunction();
    keepFunction();
    ```
2.  **Create a branch where the deletion occurs**:
    ```bash
    git checkout -b cleanup/remove-old
    # Edit src/utils.js to remove oldFunction and its call:
    # function keepFunction() {
    #   console.log("This function is kept.");
    # }
    # keepFunction();
    git add src/utils.js
    git commit -m "Remove oldFunction"
    ```
3.  **Ensure `HEAD` is on the base branch (e.g., `main`)**:
    ```bash
    git checkout main
    ```
4.  **Run `taylored --save` targeting the branch with deletions**:
    ```bash
    taylored --save cleanup/remove-old
    ```
    This compares `HEAD` (on `main`) with `cleanup/remove-old`. The changes in `cleanup/remove-old` relative to `main` are purely deletive.
5.  **Result**:
    *   A file `cleanup_remove-old.taylored` (or similar) is created in `.taylored/`.
    *   This file contains a diff that, when applied, will delete `oldFunction` and its call.
    *   Output message: `Successfully saved patch to .taylored/cleanup_remove-old.taylored`.

**Scenario 4: No textual changes**

1.  **State**: `main` and `feature/no-text-changes` are identical in terms of tracked file content.
    ```bash
    git checkout -b feature/no-text-changes
    # Make no textual changes.
    git checkout main
    ```
2.  **Run `taylored --save`**:
    ```bash
    taylored --save feature/no-text-changes
    ```
3.  **Result**:
    *   A file `feature_no-text-changes.taylored` (or similar) is created.
    *   The file will essentially be an empty patch.
    *   Output: `Successfully saved patch to .taylored/feature_no-text-changes.taylored (no textual changes detected)`.

This detailed explanation should give users a solid understanding of the `taylored --save` command.

---

### `taylored --add <taylored_file_name>`

#### Purpose (`--add`)

The `taylored --add <taylored_file_name>` command is used to **apply the changes defined in a specified `.taylored` plugin file to your current working directory.**

This command takes a plugin file (generated by `taylored --save` or `taylored --automatic`) and attempts to apply the patch it contains. It's the primary way to activate a Taylored plugin. The underlying mechanism typically uses `git apply`.

#### Arguments (`--add`)

*   **`<taylored_file_name>` (Required)**:
    *   **Description**: The name of the Taylored plugin file you want to apply. Taylored will look for this file within the `.taylored/` directory.
    *   **Format**: The filename of the plugin. You can include the `.taylored` extension, or omit it; Taylored will typically resolve it.
    *   **Example**: `feature_new-ui`, `feature_new-ui.taylored`, `1.taylored`, `my-patch`.

#### Use Cases (`--add`)

*   **Activating a Feature**: You have a `feature_dark-mode.taylored` plugin. To enable dark mode in your current checkout:
    ```bash
    taylored --add feature_dark-mode
    ```
*   **Applying a Customization**: For a client-specific build, you might apply a `client_X_branding.taylored` plugin.
*   **Temporarily Testing an Experimental Change**: If an experimental feature is in `experimental_feature.taylored`, you can apply it to your working branch to test, then remove it later if needed.
*   **Applying Patches in a Specific Order**: If a larger change is broken down into multiple Taylored plugins (e.g., `01-setup.taylored`, `02-add-models.taylored`, `03-add-controllers.taylored`), you can apply them sequentially:
    ```bash
    taylored --add 01-setup
    taylored --add 02-add-models
    taylored --add 03-add-controllers
    ```
*   **Automated Application in CI/CD**: A CI/CD pipeline could apply certain `.taylored` plugins based on the build environment or configuration (e.g., apply `debug_logging.taylored` for a debug build).

#### Examples (`--add`)

**Scenario 1: Applying a simple additive plugin**

1.  **Initial state**: Your `src/app.js` looks like this:
    ```javascript
    // src/app.js
    function coreLogic() {
      console.log("Core logic running");
    }
    coreLogic();
    ```
2.  **Plugin file**: You have `.taylored/add_greeting.taylored` which was created to add a greeting function (similar to the `taylored --save` example). Its content might conceptually look like this (simplified patch format):
    ```diff
    --- a/src/app.js
    +++ b/src/app.js
    @@ -1,3 +1,7 @@
    +function greet(name) {
    +  console.log(`Hello, ${name}!`);
    +}
    +
     function coreLogic() {
       console.log("Core logic running");
     }
    -coreLogic();
    +greet("TayloredUser");
    +coreLogic();
    ```
3.  **Run `taylored --add`**:
    ```bash
    taylored --add add_greeting
    # or
    taylored --add add_greeting.taylored
    ```
4.  **Result**:
    *   The changes from `add_greeting.taylored` are applied to `src/app.js`.
    *   `src/app.js` now looks like:
        ```javascript
        // src/app.js
        function greet(name) {
          console.log(`Hello, ${name}!`);
        }

        function coreLogic() {
          console.log("Core logic running");
        }

        greet("TayloredUser");
        coreLogic();
        ```
    *   Output message: `Successfully applied patch from .taylored/add_greeting.taylored` (or similar).
    *   Your working directory will show `src/app.js` as modified. You'll typically want to commit these changes:
        ```bash
        git add src/app.js
        git commit -m "Enable greeting feature via Taylored plugin"
        ```

**Scenario 2: Applying a purely deletive plugin**

1.  **Initial state**: Your `src/utils.js` has an old function:
    ```javascript
    // src/utils.js
    function oldFunction() {
      console.log("This is an old function.");
    }
    function keepFunction() {
      console.log("This function is kept.");
    }
    oldFunction();
    keepFunction();
    ```
2.  **Plugin file**: You have `.taylored/remove_old_function.taylored` which contains a diff to delete `oldFunction` and its call.
3.  **Run `taylored --add`**:
    ```bash
    taylored --add remove_old_function
    ```
4.  **Result**:
    *   `oldFunction` and its call are removed from `src/utils.js`.
    *   `src/utils.js` now looks like:
        ```javascript
        // src/utils.js
        function keepFunction() {
          console.log("This function is kept.");
        }
        keepFunction();
        ```
    *   Output message: `Successfully applied patch from .taylored/remove_old_function.taylored`.
    *   Commit the changes:
        ```bash
        git add src/utils.js
        git commit -m "Remove old function using Taylored plugin"
        ```

**Scenario 3: Attempting to apply a patch that doesn't apply cleanly (conflict)**

1.  **Initial state**: `src/config.js`:
    ```javascript
    // src/config.js
    const version = "1.0.0";
    ```
2.  **Plugin file**: `.taylored/update_version.taylored` expects to change `version = "1.0.0"` to `version = "1.1.0"`.
    ```diff
    --- a/src/config.js
    +++ b/src/config.js
    @@ -1 +1 @@
    -const version = "1.0.0";
    +const version = "1.1.0";
    ```
3.  **Manual change**: Before applying, you manually edit `src/config.js` to:
    ```javascript
    // src/config.js
    const version = "2.0.0"; // Changed manually
    ```
4.  **Run `taylored --add`**:
    ```bash
    taylored --add update_version
    ```
5.  **Result**:
    *   The patch will likely fail to apply because the context (`const version = "1.0.0";`) is no longer present.
    *   Taylored will output an error message from `git apply`, possibly indicating patch failure or conflicts (e.g., `error: patch failed to apply`, or it might create `.rej` files).
    *   `src/config.js` will remain unchanged or partially changed with conflict markers if `git apply` attempts a merge.
    *   **Note**: To avoid such issues, ensure your working directory is clean and matches the state the patch expects. The `taylored --verify-add` command is useful for checking this beforehand. If a patch is outdated, `taylored --offset` might be needed.

This provides a comprehensive look at the `taylored --add` command.

---

### `taylored --remove <taylored_file_name>`

#### Purpose (`--remove`)

The `taylored --remove <taylored_file_name>` command is used to **revert the changes previously applied by a specified `.taylored` plugin file from your current working directory.**

This command effectively "undoes" a `taylored --add` operation for a given plugin. It applies the inverse of the patch contained in the `.taylored` plugin file. The underlying mechanism typically uses `git apply -R`.

#### Arguments (`--remove`)

*   **`<taylored_file_name>` (Required)**:
    *   **Description**: The name of the Taylored plugin file whose changes you want to revert. Taylored will look for this file within the `.taylored/` directory.
    *   **Format**: The filename of the plugin. You can include the `.taylored` extension or omit it.
    *   **Example**: `feature_new-ui`, `feature_new-ui.taylored`, `1.taylored`.

#### Use Cases (`--remove`)

*   **Deactivating a Feature**: If `feature_dark-mode.taylored` was previously applied, you can disable it:
    ```bash
    taylored --remove feature_dark-mode
    ```
*   **Removing a Customization**: Reverting client-specific changes to go back to a standard version.
    ```bash
    taylored --remove client_X_branding
    ```
*   **Backing Out an Experimental Change**: If an experimental feature applied via `taylored --add experimental_feature` causes issues or is no longer needed.
*   **Undoing Patches in Reverse Order**: If multiple Taylored plugins were applied, you generally remove them in the reverse order of application for cleanest results, especially if they touch overlapping areas.
    ```bash
    taylored --remove 03-add-controllers
    taylored --remove 02-add-models
    taylored --remove 01-setup
    ```
*   **Automated Reversion in CI/CD**: A CI/CD pipeline could remove certain `.taylored` plugins if specific conditions are met or a build failed after their application.

#### Examples (`--remove`)

**Scenario 1: Removing a previously added feature**

1.  **Initial state**: `src/app.js` has the greeting feature applied (from the `taylored --add add_greeting` example):
    ```javascript
    // src/app.js
    function greet(name) {
      console.log(`Hello, ${name}!`);
    }

    function coreLogic() {
      console.log("Core logic running");
    }

    greet("TayloredUser");
    coreLogic();
    ```
2.  **Plugin file**: `.taylored/add_greeting.taylored` exists.
3.  **Run `taylored --remove`**:
    ```bash
    taylored --remove add_greeting
    # or
    taylored --remove add_greeting.taylored
    ```
4.  **Result**:
    *   The changes from `add_greeting.taylored` are reverted from `src/app.js`.
    *   `src/app.js` now looks like its original state:
        ```javascript
        // src/app.js
        function coreLogic() {
          console.log("Core logic running");
        }
        coreLogic();
        ```
    *   Output message: `Successfully removed patch from .taylored/add_greeting.taylored` (or similar).
    *   Your working directory will show `src/app.js` as modified. Commit these changes:
        ```bash
        git add src/app.js
        git commit -m "Disable greeting feature by removing Taylored plugin"
        ```

**Scenario 2: Removing a deletive plugin (i.e., re-adding the code)**

1.  **Initial state**: `src/utils.js` has `oldFunction` removed by applying `remove_old_function.taylored`:
    ```javascript
    // src/utils.js
    function keepFunction() {
      console.log("This function is kept.");
    }
    keepFunction();
    ```
2.  **Plugin file**: `.taylored/remove_old_function.taylored` exists (this plugin's effect was to *delete* code).
3.  **Run `taylored --remove`**:
    ```bash
    taylored --remove remove_old_function
    ```
4.  **Result**:
    *   Removing a "deletion plugin" means re-applying the deleted code. The `oldFunction` and its call are restored.
    *   `src/utils.js` now looks like:
        ```javascript
        // src/utils.js
        function oldFunction() {
          console.log("This is an old function.");
        }
        function keepFunction() {
          console.log("This function is kept.");
        }
        oldFunction();
        keepFunction();
        ```
    *   Output message: `Successfully removed patch from .taylored/remove_old_function.taylored`.
    *   Commit the changes:
        ```bash
        git add src/utils.js
        git commit -m "Restore old function by removing Taylored deletion plugin"
        ```

**Scenario 3: Attempting to remove a patch that doesn't apply cleanly in reverse**

1.  **Initial state**: `src/config.js` is:
    ```javascript
    // src/config.js
    const version = "1.1.0"; // Assume update_version.taylored was applied
    ```
    And `.taylored/update_version.taylored` was designed to change `1.0.0` to `1.1.0`.
2.  **Manual change**: You manually edit `src/config.js` again *after* the plugin was applied:
    ```javascript
    // src/config.js
    const version = "1.2.0"; // Changed manually after plugin application
    ```
3.  **Run `taylored --remove`**:
    ```bash
    taylored --remove update_version
    ```
4.  **Result**:
    *   The reverse patch will likely fail because the context (`const version = "1.1.0";`) it expects to revert is no longer present as `1.1.0`.
    *   Taylored will output an error message from `git apply -R`.
    *   `src/config.js` will remain unchanged or partially changed with conflict markers.
    *   **Note**: Similar to `taylored --add`, ensure your working directory reflects the state expected by the reverse patch. `taylored --verify-remove` can check this. `taylored --offset` might be needed if the codebase has evolved significantly since the patch was applied.

Understanding `taylored --remove` is key to managing the lifecycle of your Taylored plugins.

---

### `taylored --verify-add <taylored_file_name>`

#### Purpose (`--verify-add`)

The `taylored --verify-add <taylored_file_name>` command performs a **dry run** to check if the specified `.taylored` plugin file can be applied cleanly to the current working directory. **It does not modify any files.**

This command is crucial for anticipating potential issues before actually applying a patch. It uses `git apply --check` (or a similar mechanism) to determine if the patch would apply without errors or conflicts.

#### Arguments (`--verify-add`)

*   **`<taylored_file_name>` (Required)**:
    *   **Description**: The name of the Taylored plugin file you want to test for clean application. Taylored looks for this file in the `.taylored/` directory.
    *   **Format**: The filename of the plugin. The `.taylored` extension is optional.
    *   **Example**: `feature_new-ui`, `feature_new-ui.taylored`.

#### Use Cases (`--verify-add`)

*   **Pre-flight Check Before Applying**: Before running `taylored --add`, use `taylored --verify-add` to ensure the patch will apply smoothly. This is especially important in automated scripts or CI/CD pipelines.
*   **Diagnosing Application Failures**: If `taylored --add` fails, `taylored --verify-add` can confirm if the issue is due to patch conflicts or other problems (though `git apply` itself usually gives good error messages).
*   **Checking Patch Relevance**: If your codebase has changed significantly, you can use this command to see if an old patch is still applicable or if it needs updating (e.g., with `taylored --offset`).
*   **Validating Patches in a Set**: If you have a set of patches to apply, you can verify each one before starting the application process.

#### Examples (`--verify-add`)

**Scenario 1: Verification succeeds**

1.  **Initial state**: `src/app.js` is in a state where `.taylored/add_greeting.taylored` can be applied cleanly (e.g., the state before `add_greeting` was ever applied).
2.  **Run `taylored --verify-add`**:
    ```bash
    taylored --verify-add add_greeting
    ```
3.  **Result**:
    *   No files in the working directory are changed.
    *   Output message: `Patch .taylored/add_greeting.taylored can be applied cleanly.` (or similar).
    *   The command exits with a success status code (usually 0).

**Scenario 2: Verification fails due to conflicts**

1.  **Initial state**: `src/config.js` is `const version = "2.0.0";`.
2.  **Plugin file**: `.taylored/update_version.taylored` expects to change `version = "1.0.0";` to `version = "1.1.0";`.
3.  **Run `taylored --verify-add`**:
    ```bash
    taylored --verify-add update_version
    ```
4.  **Result**:
    *   No files in the working directory are changed.
    *   Output message indicating failure: `Error: Patch .taylored/update_version.taylored cannot be applied cleanly.` (or similar, possibly including details from `git apply --check`).
    *   The command exits with a non-success status code.

---

### `taylored --verify-remove <taylored_file_name>`

#### Purpose (`--verify-remove`)

The `taylored --verify-remove <taylored_file_name>` command performs a **dry run** to check if the changes from a specified `.taylored` plugin file can be cleanly reverted from the current working directory. **It does not modify any files.**

This is the counterpart to `taylored --verify-add`. It uses `git apply --check -R` (or similar) to determine if the reverse patch would apply without errors.

#### Arguments (`--verify-remove`)

*   **`<taylored_file_name>` (Required)**:
    *   **Description**: The name of the Taylored plugin file you want to test for clean removal.
    *   **Format**: The filename of the plugin. The `.taylored` extension is optional.
    *   **Example**: `feature_new-ui`, `feature_new-ui.taylored`.

#### Use Cases (`--verify-remove`)

*   **Pre-flight Check Before Removing**: Before running `taylored --remove`, use `taylored --verify-remove` to ensure the reversion will be clean.
*   **Diagnosing Removal Failures**: If `taylored --remove` fails.
*   **Ensuring Reversibility**: Especially important if a Taylored plugin has been applied for a while and the surrounding code has changed. This check can indicate if the "undo" operation is still straightforward.

#### Examples (`--verify-remove`)

**Scenario 1: Verification succeeds**

1.  **Initial state**: `src/app.js` currently has the `add_greeting.taylored` plugin applied.
2.  **Run `taylored --verify-remove`**:
    ```bash
    taylored --verify-remove add_greeting
    ```
3.  **Result**:
    *   No files are changed.
    *   Output: `Patch .taylored/add_greeting.taylored can be removed cleanly.` (or similar).
    *   Exits with a success status code.

**Scenario 2: Verification fails due to conflicts**

1.  **Initial state**: `add_greeting.taylored` was applied. Then, lines of code *around* where `add_greeting.taylored` made its changes were manually altered significantly, or lines that the patch *would restore* were further modified or deleted.
2.  **Run `taylored --verify-remove`**:
    ```bash
    taylored --verify-remove add_greeting
    ```
3.  **Result**:
    *   No files are changed.
    *   Output: `Error: Patch .taylored/add_greeting.taylored cannot be removed cleanly.` (or similar).
    *   Exits with a non-success status code.

These verification commands are invaluable for maintaining a stable and predictable workflow when managing multiple Taylored plugins.

---

### `taylored --list`

#### Purpose (`--list`)

The `taylored --list` command **displays all available `.taylored` plugin files found in the `.taylored/` directory.**

This command provides a quick and easy way to see which Taylored plugins are currently stored and managed within your project. It does not take any arguments and does not modify any files.

#### Arguments (`--list`)

This command does not take any arguments.

#### Use Cases (`--list`)

*   **Viewing Available Plugins**: The most straightforward use case is to simply see a list of all Taylored plugins you have created or pulled into your project.
*   **Checking Plugin Names**: Before running `taylored --add`, `taylored --remove`, or other commands that require a plugin filename, you can use `taylored --list` to confirm the exact name of the plugin, especially if you're unsure about sanitization (e.g., `feature/new-plugin` becoming `feature_new-plugin.taylored`).
*   **Scripting and Automation**: The output of `taylored --list` can be parsed by scripts if you need to programmatically iterate over available plugins.
*   **Quick Project Overview**: For a project that uses Taylored extensively, `taylored --list` can give a contributor a quick idea of the modularized features or customizations present.

#### Examples (`--list`)

**Scenario 1: Listing available plugins**

1.  **Initial state**: Your `.taylored/` directory contains the following files:
    *   `feature_dark-mode.taylored`
    *   `bugfix_login-issue.taylored`
    *   `experimental_api-v2.taylored`
    *   `1.taylored`
    *   `README.txt` (This file will be ignored as it doesn't end with `.taylored`)

2.  **Run `taylored --list`**:
    ```bash
    taylored --list
    ```

3.  **Result**:
    *   The command will print a list of `.taylored` plugin filenames to standard output. The exact formatting might vary but could look like:
        ```text
        Available Taylored Plugins:
        - feature_dark-mode.taylored
        - bugfix_login-issue.taylored
        - experimental_api-v2.taylored
        - 1.taylored
        ```
    *   Or simply:
        ```text
        feature_dark-mode.taylored
        bugfix_login-issue.taylored
        experimental_api-v2.taylored
        1.taylored
        ```
    *   Files not ending with `.taylored` (like `README.txt`) are typically ignored.

**Scenario 2: No plugins in the `.taylored/` directory**

1.  **Initial state**: The `.taylored/` directory exists but is empty, or it doesn't exist at all.

2.  **Run `taylored --list`**:
    ```bash
    taylored --list
    ```

3.  **Result**:
    *   The command will indicate that no Taylored plugins were found.
        ```text
        No Taylored plugins found in .taylored/
        ```
    *   Or it might output nothing, depending on the implementation.

The `taylored --list` command is a simple yet essential utility for interacting with your collection of Taylored plugins.

---

### `taylored --offset <taylored_file_name> [BRANCH_NAME]`

#### Purpose (`--offset`)

The `taylored --offset <taylored_file_name> [BRANCH_NAME]` command is designed to **update the line number offsets within a specified `.taylored` plugin file to ensure it can apply cleanly to the current state of your repository, or optionally, against a specific branch.**

As a codebase evolves, the original line numbers referenced in a `.taylored` patch file can become outdated. This means the patch might no longer apply cleanly because the surrounding context lines have shifted. The `taylored --offset` command attempts to resolve this by:

1.  Temporarily applying (or trying to apply and then revert) the patch in a clean/temporary Git state.
2.  Generating a new diff based on the current file content against a target branch (usually `main` or the specified `[BRANCH_NAME]`).
3.  Replacing the content of the original `.taylored` plugin file with this newly generated, offset-updated diff.

**Key Prerequisite**: This command requires that your Git working directory is clean (no uncommitted changes or untracked files) because it performs Git operations like checkout and commit on temporary branches.

#### Arguments (`--offset`)

*   **`<taylored_file_name>` (Required)**:
    *   **Description**: The name of the Taylored plugin file whose line number offsets need updating. Taylored looks for this file in the `.taylored/` directory.
    *   **Format**: The filename of the plugin. The `.taylored` extension is optional.
    *   **Example**: `my_feature_patch`, `my_feature_patch.taylored`.

*   **`[BRANCH_NAME]` (Optional)**:
    *   **Description**: The name of the Git branch against which the new offset should be calculated. If omitted, Taylored typically defaults to `main` or a primary branch configured in the tool. The patch is updated to apply cleanly onto this `[BRANCH_NAME]`.
    *   **Format**: A valid Git branch name.
    *   **Example**: `develop`, `release/v2.1`, `main`.

#### Use Cases (`--offset`)

*   **Updating Old Plugins**: You have a `.taylored` plugin file for a feature created months ago. The `main` branch has received many updates since then, and the plugin no longer applies with `taylored --add`. Running `taylored --offset my_feature_patch main` can make it applicable again.
*   **Rebasing a Plugin**: Similar to `git rebase` for branches, `taylored --offset` can "rebase" a plugin onto a different branch. For example, if a plugin `fix.taylored` was made against `main` but you now want to apply it to `release/v1.0`, you could run `taylored --offset fix.taylored release/v1.0`.
*   **Maintaining a Library of Plugins**: If you maintain a set of optional features or customizations as Taylored plugins, you'll need to periodically run `taylored --offset` on them as your core application evolves to keep them usable.
*   **CI/CD Maintenance Tasks**: A CI job could periodically attempt to run `taylored --offset` on all plugins in `.taylored/` against the latest `main` or `develop` branch to catch and fix outdated plugins proactively.

#### How It Works (Conceptual Workflow)

The exact Git machinations can be complex, but here's a simplified idea:

1.  **Validation**: Checks for a clean Git working directory.
2.  **Setup**: May create a temporary branch from `[BRANCH_NAME]` (or `main`).
3.  **Apply Attempt**: Tries to apply the existing `<taylored_file_name>` to this temporary branch.
    *   If it applies cleanly: Good.
    *   If it doesn't apply cleanly: It might try to force apply, use `git patch -p1 --three-way` if the patch format allows, or employ other strategies to get the *intended changes* onto the temporary branch. The goal is to reflect the *effect* of the patch.
4.  **Diff Generation**: Once the changes represented by the patch are on the temporary branch, it generates a new diff by comparing this temporary branch (with the patch's changes) against the original `[BRANCH_NAME]` (or `main`) that *doesn't* have the patch's changes. This new diff effectively has updated line numbers.
5.  **Update Plugin**: The content of `<taylored_file_name>` is replaced with this new diff.
6.  **Cleanup**: Deletes any temporary branches and restores your original Git state.

The command may also embed a custom `Subject:` line (like a commit message summary) in the updated `.taylored` plugin file if the original had one or if one is generated.

#### Examples (`--offset`)

**Scenario 1: Updating a simple additive plugin**

1.  **Initial State**:
    *   `main` branch: `src/app.js` contains:
        ```javascript
        // Line 1
        // Line 2
        // Line 3
        function original() { console.log("original"); }
        // Line 5
        original(); // Line 6
        ```
    *   `.taylored/add_new_function.taylored` was created when `src/app.js` had fewer lines at the top. It intends to add `newFunction` after `original()`:
        ```diff
        --- a/src/app.js
        +++ b/src/app.js
        @@ -2,3 +2,6 @@
         // Line 3
         function original() { console.log("original"); }
         // Line 5
        +function newFunction() { console.log("new"); }
        +newFunction();
         original(); // Line 6
        ```
        (Assume the line numbers in this patch are now incorrect for the current `main`.)
    *   Your working directory is clean, and you are on some branch (e.g., `main`).

2.  **Run `taylored --offset`**:
    ```bash
    taylored --offset add_new_function main
    # Or, if main is the default target branch:
    taylored --offset add_new_function
    ```

3.  **Result**:
    *   `add_new_function.taylored` is updated in place. Its content will now be a diff that correctly applies to the *current* `src/app.js` on `main`. The line numbers in the patch (e.g., `@@ -X,Y +A,B @@`) will be adjusted.
    *   For instance, the patch might now look like:
        ```diff
        --- a/src/app.js
        +++ b/src/app.js
        @@ -4,3 +4,6 @@
         // Line 3
         function original() { console.log("original"); }
         // Line 5
        +function newFunction() { console.log("new"); }
        +newFunction();
         original(); // Line 6
        ```
        (Notice the `@@ -2,3` might change to `@@ -4,3` if, for example, two lines were added at the start of the file.)
    *   Output: `Successfully updated offsets for .taylored/add_new_function.taylored against branch main.` (or similar).
    *   You would then typically commit the changed `.taylored/add_new_function.taylored` file.

**Scenario 2: Plugin is too divergent or causes conflicts**

1.  **Initial State**:
    *   `main` branch has changed drastically.
    *   `.taylored/complex_patch.taylored` makes many changes, and the code it targets has been heavily refactored or removed.

2.  **Run `taylored --offset`**:
    ```bash
    taylored --offset complex_patch main
    ```

3.  **Result (Potential Outcome)**:
    *   The command might fail if Git cannot automatically resolve how to apply the old changes in the new context, even with its advanced patching strategies.
    *   Output: `Error: Failed to update offsets for .taylored/complex_patch.taylored. Manual intervention may be required.` (or similar).
    *   In such cases, you might need to:
        *   Manually recreate the plugin: Apply the conceptual change on a branch and use `taylored --save` again.
        *   Edit the `.taylored` file by hand if you understand the diff format and the required changes (this is an advanced operation).

**Important Considerations for `taylored --offset`:**

*   **Clean Working Directory**: This is critical. Uncommitted changes can interfere with the temporary Git operations and lead to errors or a corrupted Git state.
*   **Default Branch**: Be aware of the default branch (`main`, `master`, etc.) Taylored uses if `[BRANCH_NAME]` is not specified. It's often best to be explicit.
*   **Backup**: For very critical plugins, you might consider backing up the `.taylored` file before running `taylored --offset`, just in case the process doesn't yield the desired outcome.
*   **Review Changes**: After running `taylored --offset`, it's good practice to inspect the updated `.taylored` file (e.g., using `git diff .taylored/your_plugin.taylored`) to understand what changed, or try `taylored --verify-add` on it.

The `taylored --offset` command is a powerful tool for maintaining the longevity of your Taylored plugins in an evolving codebase.

---

### `taylored --upgrade <taylored_file_name> [BRANCH_NAME]`

#### Purpose (`--upgrade`)<a name="purpose-upgrade"></a>

The `taylored --upgrade <taylored_file_name> [BRANCH_NAME]` command is a specialized tool for **surgically updating an existing `.taylored` patch file.** It is designed for scenarios where a patch is conceptually still valid, but the specific content of lines it intended to modify (primarily lines being added) has changed in the target source file.

The core principles of this command are:

1.  **Contextual Frame Integrity**: It first verifies that the "contextual frame" of each hunk in the patch (the lines of code immediately preceding and succeeding the changed lines, which start with a space in the patch file) are still present and identical in the target file (either in the local file system or a specified branch).
2.  **Surgical Modification**: If the contextual frames are intact, the command inspects the lines that the original patch intended to add (`+` lines). If the corresponding lines in the target file have different content, the `+` lines within the patch file are updated to reflect this new content.
3.  **Preservation of Original Structure**:
    *   The command aims to modify **only** the content of the relevant `+` lines within their existing hunks.
    *   **Crucially, the `index HASH_A..HASH_B` line at the beginning of the patch file is NOT modified.** This means the patch, after upgrade, will still claim to transform the file from its original `HASH_A` to `HASH_B`, even though the actual modifications it describes have changed. (See [Important Considerations](#important-considerations-upgrade)).
    *   The original `+` or `-` signs are maintained. This version of `upgrade` primarily targets patches that were purely additive in the hunks being updated; hunks containing `-` (deletion) lines might not be modified or could cause the upgrade to report no action taken for that hunk.
    *   The command attempts to maintain the "purity" of the patch if the original hunk was purely additive.

This command is useful when `git apply` would fail due to content changes (not just offset changes) within the patch's area of effect, but the surrounding code structure remains stable. It differs from `taylored --offset`, which recalculates the entire diff and line numbers based on broader changes.

#### Arguments (`--upgrade`)<a name="arguments-upgrade"></a>

*   **`<taylored_file_name>` (Required)**:
    *   **Description**: The name of the `.taylored` plugin file to be updated. Taylored looks for this file in the `.taylored/` directory.
    *   **Format**: The filename of the plugin. The `.taylored` extension is optional.
    *   **Example**: `my_feature.taylored`, `config_update`.

*   **`[BRANCH_NAME]` (Optional)**:
    *   **Description**: The name of the Git branch to use as the reference for the "current" state of the code. If omitted, the version of the target file(s) in your local file system will be used.
    *   **Format**: A valid Git branch name.
    *   **Example**: `develop`, `staging`, `feature/new-version`.

#### Use Cases (`--upgrade`)<a name="use-cases-upgrade"></a>

*   **Updating Patches with Minor Content Drifts**:
    *   You have a patch that adds a configuration line: `+ feature_enabled = true`.
    *   In the source file, this line now needs to be `feature_enabled = false` (or `feature_enabled = "beta"`) but the surrounding configuration lines (the context) are identical.
    *   `taylored --upgrade my_config.taylored` would update the `+` line in the patch to `+ feature_enabled = false` (or the respective new value).
*   **Synchronizing Patches with a Specific Branch State**:
    *   Your local file `config.yml` has `version: LOCAL_DEV`.
    *   The `staging` branch has `version: STAGING_READY` in `config.yml`.
    *   Your patch `update_version.taylored` was originally created to add `version: OLD_VERSION`.
    *   Running `taylored --upgrade update_version.taylored staging` would inspect `config.yml` on the `staging` branch. If the context around where `version: OLD_VERSION` would apply is intact, and the line now reads `version: STAGING_READY`, the patch's `+ version: OLD_VERSION` line will be updated to `+ version: STAGING_READY`.

#### Important Considerations (`--upgrade`)<a name="important-considerations-upgrade"></a>

*   **Integrity of `index` Hashes**: Since this command **does not change the `index HASH_A..HASH_B` line** in the patch file but *does* change the patch's content (the `+` lines), the resulting patch file may become inconsistent from Git's perspective. `git apply` might behave unpredictably or fail if it strictly validates these hashes against the content changes. This command prioritizes updating the patch content based on context matching over strict Git patch format validity regarding index hashes. Users should be aware of this behavior.
*   **Focus on Additive Changes**: The "surgical update" is most reliable and predictable for patches (or hunks within patches) that are purely additive. If a hunk in the original patch contains deletion lines (`-`), this command might not modify that hunk or might report that the hunk cannot be surgically upgraded.
*   **Context is Key**: The success of this command hinges entirely on the stability of the context lines surrounding the changes in the patch. If these context lines have also changed in the target file, the upgrade will likely fail for that hunk or the entire patch.
*   **No Line Number (Offset) Changes**: This command does not attempt to change hunk header offsets (e.g., `@@ -1,5 +1,6 @@`). If line numbers have shifted such that context lines are no longer found, `taylored --offset` might be a more appropriate tool first, followed by `taylored --upgrade` if content within the (now correctly offset) hunk has also changed.

#### Examples (`--upgrade`)<a name="examples-upgrade"></a>

**Scenario 1: Updating a Configuration Value in a Patch**

*   **Original Patch (`enable_feature_X.taylored`):**
    ```diff
    diff --git a/src/config.ini b/src/config.ini
    index abc..def 100644
    --- a/src/config.ini
    +++ b/src/config.ini
    @@ -10,3 +10,4 @@
     setting1 = foo
     setting2 = bar
    +feature_X_enabled = true
     setting3 = baz
    ```

*   **Current `src/config.ini` in local filesystem:**
    ```ini
    # ... other settings ...
    setting1 = foo
    setting2 = bar
    feature_X_enabled = false
    setting3 = baz
    # ... other settings ...
    ```
    (Note: `feature_X_enabled` is present but `false` instead of `true`, context lines `setting2` and `setting3` are the same.)

*   **Command:**
    ```bash
    taylored --upgrade enable_feature_X.taylored
    ```

*   **Resulting `enable_feature_X.taylored`:**
    ```diff
    diff --git a/src/config.ini b/src/config.ini
    index abc..def 100644
    --- a/src/config.ini
    +++ b/src/config.ini
    @@ -10,3 +10,4 @@
     setting1 = foo
     setting2 = bar
    +feature_X_enabled = false
     setting3 = baz
    ```
    (The `index` line remains `abc..def`. The `+` line's content is updated.)

**Scenario 2: Upgrading Against a Specific Branch**

*   **Original Patch (`add_module_version.taylored`):**
    ```diff
    diff --git a/modules.txt b/modules.txt
    index 123..456 100644
    --- a/modules.txt
    +++ b/modules.txt
    @@ -5,2 +5,3 @@
     moduleA
     moduleB
    +moduleC_version = 1.0
    ```

*   **`modules.txt` on `staging` branch:**
    ```
    moduleA
    moduleB
    moduleC_version = 2.1
    ```

*   **`modules.txt` on local filesystem (main branch):**
    ```
    moduleA
    moduleB
    moduleC_version = 0.9-local
    ```

*   **Command:**
    ```bash
    taylored --upgrade add_module_version.taylored staging
    ```

*   **Resulting `add_module_version.taylored`:**
    ```diff
    diff --git a/modules.txt b/modules.txt
    index 123..456 100644
    --- a/modules.txt
    +++ b/modules.txt
    @@ -5,2 +5,3 @@
     moduleA
     moduleB
    +moduleC_version = 2.1
    ```
    (The patch is updated based on the `staging` branch, ignoring the local filesystem's `0.9-local`.)

---

### `taylored --automatic <EXTENSIONS> <branch_name> [--exclude <DIR_LIST>]`
>>>>>>> REPLACE
