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
    *   [`taylored --automatic <EXTENSIONS> <branch_name> [--exclude <DIR_LIST>]`](#taylored---automatic-extensions-branch_name---exclude-dir_list)
        *   [Purpose](#purpose-automatic)
        *   [Arguments](#arguments-automatic)
        *   [Core Concept: Taylored Blocks](#core-concept-taylored-blocks)
        *   [Marker Syntax](#marker-syntax)
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

### `taylored --automatic <EXTENSIONS> <branch_name> [--exclude <DIR_LIST>]`

#### Purpose (`--automatic`)

The `taylored --automatic` command is a powerful feature for **automatically discovering specially marked blocks of code within your files, extracting each block, and generating an individual `.taylored` plugin file for it.** This process uses a Git workflow, comparing against a specified `<branch_name>` to create diff-based patches.

This command is particularly useful for managing numerous small, self-contained code snippets, configurations, or features that you want to treat as optional or conditional plugins. It also supports dynamic content generation for these plugins through an executable `compute` attribute within the markers.

**Key Prerequisites**:
*   **Clean Git Repository**: The command requires a clean Git working directory (no uncommitted changes or untracked files) because it performs many Git operations like creating temporary branches, committing, and diffing.
*   **No Conflicting Temporary Files**: The file `.taylored/main.taylored` must not exist as it's used temporarily during the operation.
*   **Target Output Files**: The numbered output files (e.g., `.taylored/1.taylored`, `.taylored/42.taylored`) must not already exist, as the command will create them.

#### Arguments (`--automatic`)

*   **`<EXTENSIONS>` (Required)**:
    *   **Description**: A comma-separated list of file extensions to scan for Taylored blocks. The search is recursive through directories.
    *   **Format**: String of extensions, e.g., `ts`, `js,jsx`, `py,html,css`. Leading dots are optional (e.g., `js` is the same as `.js`).
    *   **Example**: `ts,tsx`, `py`, `java,xml`.

*   **`<branch_name>` (Required)**:
    *   **Description**: The base Git branch against which the diffs for each extracted block will be generated. For each block found, Taylored simulates its absence on a temporary branch and then diffs that state against this `<branch_name>` to create a patch that *adds* the block.
    *   **Format**: A valid Git branch name.
    *   **Example**: `main`, `develop`, `release/v3.0`.

*   **`--exclude <DIR_LIST>` (Optional)**:
    *   **Description**: A comma-separated list of directory names to exclude from the scan. This is useful for ignoring directories like `node_modules`, `dist`, `build`, etc. Subdirectories of excluded directories are also ignored.
    *   **Format**: String of directory names, e.g., `node_modules,dist,build_output`.
    *   **Default Exclusions**: `.git` and the `.taylored` directory itself are always excluded by default.
    *   **Example**: `--exclude node_modules,venv,target`.

#### Core Concept: Taylored Blocks

Taylored blocks are segments of code or text within your source files that are demarcated by special start and end markers. The `taylored --automatic` command searches for these blocks.

#### Marker Syntax

*   **Start Marker**:
    *   Format: `<taylored number="NUMERO" [compute="CHARS_TO_STRIP_PATTERNS"] [async="true|false"]>`
    *   `number="NUMERO"`: (Required attribute) An integer that specifies the number for the output plugin file. For example, `number="1"` will generate `.taylored/1.taylored`. This attribute is mandatory. The older positional syntax (e.g., `<taylored 123>`) is no longer supported.
    *   `[compute="CHARS_TO_STRIP_PATTERNS"]`: (Optional attribute) See [Dynamic Content with `compute`](#dynamic-content-with-compute).
    *   `[async="true|false"]`: (Optional attribute, only relevant with `compute`) See [Dynamic Content with `compute`](#dynamic-content-with-compute).
    *   Example: `<taylored number="15">`, `<taylored number="3" compute="/*,*/">`, `<taylored number="7" compute="#!--,!--#" async="true">`

*   **End Marker**:
    *   Format: `</taylored>`

*   **Important Note on Line Coverage**: Taylored markers (both start and end) affect the **entire line** they are on. Any other code, comments, or text on the same line as a marker will be considered part of the Taylored block and included in the generated plugin.
    *Example (marker on the same line):*
    ```javascript
    function specialProcess() { /* Some logic */ } // <taylored number="30"> Special Comment Block </taylored>
    ```
    In this case, block `30` will include the entire line: `function specialProcess() { /* Some logic */ } // <taylored number="30"> Special Comment Block </taylored>`. For clarity, it's often better to place markers on their own lines unless you intentionally want to capture the whole line content along with the markers.

#### Dynamic Content with `compute`

The `compute` attribute in the start marker enables dynamic generation of the content for a Taylored block. The content within such a block is treated as a script.

*   **`compute="CHARS_TO_STRIP_PATTERNS"` attribute**:
    *   **Purpose**: Signals that the block's content is a script. The value of this attribute is an optional comma-separated string of patterns.
    *   **Stripping Patterns**: Before execution, Taylored removes **all occurrences** of each specified pattern from the script content. This is extremely useful for embedding executable scripts within comment structures of the host language.
        *   Example: `compute="/*,*/"` would remove all instances of `/*` and `*/` from the script body.
        *   Example: `compute="#!--,!--#"` (if your comments are `<!--` and `-->`) would remove `<!--` and `-->`.
        *   If `compute` is present but has an empty string value (e.g., `compute=""`), no patterns are stripped, and the raw content is executed.
    *   **Shebang**: It's good practice to start your script with a shebang (e.g., `#!/usr/bin/env node`, `#!/usr/bin/python3`) if you want it to be runnable standalone or to specify the interpreter.

*   **`async="true|false"` attribute** (Optional, only used if `compute` is present):
    *   **`async="false"` or attribute omitted (Default)**: The script is executed **synchronously**. The `taylored --automatic` process will wait for this script to complete before processing the next Taylored block.
    *   **`async="true"`**: The script is executed **asynchronously**. Taylored will initiate the script execution but will not wait for it to complete before processing other blocks (including other async blocks, which may run in parallel). The overall `taylored --automatic` command will wait for all initiated async scripts to finish before it finally exits.
    *   **Use Case for `async="true"`**: Speeds up the `taylored --automatic` process if you have multiple `compute` blocks with scripts that perform time-consuming operations (e.g., I/O, network requests, complex calculations).
    *   **Caution for `async="true"`**:
        *   Resource intensive if many heavy scripts run in parallel.
        *   Scripts should be self-contained and not rely on the side effects or completion order of other concurrently running async scripts.

*   **Script Execution Details**:
    *   The processed script content (after stripping patterns) is executed.
    *   If the script begins with a shebang (e.g., `#!/usr/bin/env node`, `#!/usr/bin/python3`, `#!/bin/bash`), Taylored will attempt to use the specified interpreter. Ensure this interpreter is available in the system's `PATH`.
    *   If no shebang is present, or if direct execution via shebang fails, Taylored may default to executing the script with Node.js (if available). **It's best practice to include a shebang for non-Node.js scripts to ensure correct interpreter selection.**
    *   The **standard output (stdout)** from the script execution replaces the *entire* original Taylored block (i.e., from the start marker line to the end marker line, inclusive) in the generated patch.
    *   The script runs in a child process. It has access to environment variables. Its current working directory is typically the root of the Git repository.

*   **Error Handling (Sync and Async)**:
    *   **Synchronous Scripts**: If a synchronous script (or a script where `async` is not specified or `async="false"`) fails (e.g., exits with a non-zero status code, throws an unhandled exception), an error will be logged. The `.taylored` plugin file for that specific block will **not** be created. The `taylored --automatic` command will generally continue to process other blocks.
    *   **Asynchronous Scripts (`async="true"`)**: If an asynchronous script fails, the error will be logged, and a `.taylored` plugin file for that specific block will **not** be created. This failure will **not** stop other synchronous or asynchronous blocks from being processed or initiated. The overall `taylored --automatic` command will still wait for all other pending async operations before exiting.

#### Exclusion Mechanism (`--exclude`)

*   The `--exclude <DIR_LIST>` option allows you to specify a comma-separated list of directory names to ignore during the file scan.
*   This is essential for preventing Taylored from scanning directories like `node_modules/`, `dist/`, `build/`, `.venv/`, `target/`, etc., which can significantly slow down the process and lead to unwanted results.
*   The exclusion applies to the named directory and all its subdirectories.
*   **Default Exclusions**: `.git/` and the `.taylored/` directory itself are always excluded.

#### Workflow (How `taylored --automatic` Works)

For each Taylored block found in the scanned files:

1.  **Isolate Block**: Identifies the start and end markers and the content within.
2.  **Handle `compute` (if present)**:
    a.  Strips patterns from the script content if `CHARS_TO_STRIP_PATTERNS` is defined.
    b.  Executes the script (synchronously or asynchronously), respecting the shebang if present.
    c.  Captures the `stdout` of the script. This `stdout` becomes the effective content of the block. If script execution fails, this block is skipped.
3.  **Temporary Git Operations**:
    a.  A temporary Git branch is created (e.g., based on `<branch_name>`).
    b.  On this temporary branch, the entire original Taylored block (from the `<taylored ...>` start marker line to the `</taylored>` end marker line, inclusive) is *removed* from the source file. If it was a `compute` block, it's the original script/markers that are removed, not the `stdout`.
    c.  This removal is committed on the temporary branch.
4.  **Generate Diff**: A Git diff is generated by comparing this temporary branch (where the block is absent) against the original `<branch_name>` (where the block, or its dynamic `stdout` equivalent, is conceptually present). This diff effectively represents the "addition" of the block's content (either static or computed).
5.  **Save Plugin**: This diff is saved to `.taylored/NUMERO.taylored`, where `NUMERO` is from the `number="NUMERO"` attribute in the start marker.
6.  **Cleanup**: The temporary Git branch is deleted, and your repository is restored to its original branch and state. The source files on your original branch remain untouched by the `taylored --automatic` operation itself.

The `taylored --automatic` command will wait for all synchronous scripts and all initiated asynchronous scripts to complete before it finishes.

#### Examples (`--automatic`)

**Example 1: Basic Static Block Extraction**

*   **File**: `src/feature.js` (on `main` branch)
    ```javascript
    // src/feature.js
    function existingCode() { /* ... */ }

    // <taylored number="15">
    function newFeaturePart() {
      console.log("This is a new, self-contained feature snippet.");
    }
    // </taylored>

    console.log("End of file.");
    ```
*   **Command**:
    ```bash
    taylored --automatic js main --exclude node_modules,dist
    ```
*   **Prerequisites for this example**:
    *   Git repository is clean.
    *   `.taylored/main.taylored` does not exist.
    *   `.taylored/15.taylored` does not exist.
*   **Result**:
    *   `.taylored/15.taylored` is created.
    *   This file contains a Git diff that, when applied to the `main` branch's version of `src/feature.js`, would add the `newFeaturePart` function block.
    *   Your `src/feature.js` on your current branch remains unchanged by this operation.

**Example 2: Using `compute` for Dynamic Data (Synchronous, Node.js)**

*   **File**: `src/dynamicModule.js` (on `develop` branch)
    ```javascript
    // File: src/dynamicModule.js
    console.log("Module starting...");

    // <taylored number="1" compute="/*,*/">
    /*
    #!/usr/bin/env node
    // This script generates dynamic content.
    const randomNumber = Math.floor(Math.random() * 100);
    console.log(`export const dynamicValue = ${randomNumber}; // Generated at ${new Date().toISOString()}`);
    */
    // </taylored>

    console.log("Module ending.");
    ```
*   **Command**:
    ```bash
    taylored --automatic js develop --exclude node_modules
    ```
*   **Result**:
    *   `.taylored/1.taylored` is created.
    *   The content of this plugin, when applied, would replace the entire `<taylored number="1" ...>` block with the output of the script. For example, it might patch in:
        ```javascript
        export const dynamicValue = 42; // Generated at 2023-10-27T10:20:30.123Z
        ```
        (The actual random number and timestamp will vary).
    *   The script is executed synchronously using Node.js (due to the shebang or by default if Node.js is the fallback).

**Example 3: Using `compute` with `async="true"` (Node.js)**

*   **File**: `src/slowDataFetcher.js`
    ```javascript
    // <taylored number="2" compute="//!--,//--!" async="true">
    //!--
    #!/usr/bin/env node
    // Simulate a slow network request
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
    console.log("const fetchedData = { info: 'Data from async source' };");
    //--!
    // </taylored>

    // <taylored number="3" compute="//!--,//--!" async="false">
    //!--
    #!/usr/bin/env node
    console.log("const syncData = 'This came quickly';");
    //--!
    // </taylored>
    ```
*   **Command**:
    ```bash
    taylored --automatic js main
    ```
*   **Result**:
    *   Taylored will start processing block `2` (async) and block `3` (sync).
    *   Block `3`'s script will execute and complete quickly. `.taylored/3.taylored` will be generated.
    *   Block `2`'s script will start, and Taylored will continue other work (if any). After about 2 seconds, its script will complete. `.taylored/2.taylored` will be generated.
    *   The overall `taylored --automatic` command finishes only after both scripts (and any others) have completed.
    *   This can be faster than running them sequentially if there were many such async blocks.

**Example 4: Complex Scripting and `CHARS_TO_STRIP_PATTERNS` (Node.js)**

*   **File**: `src/config.xml.js-like` (using Node.js to generate XML-like content, extension changed for clarity)
    ```xml
    <!-- src/config.xml.js-like -->
    <config>
        <static_value>true</static_value>
        <!-- <taylored number="10" compute="<!--taylored-script,taylored-script-->"> -->
        <!--taylored-script
        #!/usr/bin/env node
        const items = ["alpha", "beta", "gamma"];
        items.forEach(item => {
            console.log(`    <item name="${item}">${item.toUpperCase()}</item>`);
        });
        taylored-script-->
        <!-- </taylored> -->
    </config>
    ```
*   **Command**:
    ```bash
    taylored --automatic xml.js-like main --exclude target
    ```
*   **Result**:
    *   The `compute` attribute `<!--taylored-script,taylored-script-->` would cause `<!--taylored-script` and `taylored-script-->` to be stripped from the script content.
    *   The script executes using Node.js, printing:
        ```text
            <item name="alpha">ALPHA</item>
            <item name="beta">BETA</item>
            <item name="gamma">GAMMA</item>
        ```
    *   `.taylored/10.taylored` is created. When applied, it would insert the generated XML lines into `src/config.xml.js-like`, replacing the original commented-out Taylored block.

**Example 5: Excluding Directories**

*   **Project Structure**:
    ```
    my_project/
    ├── .git/
    ├── .taylored/
    ├── src/
    │   └── main.ts
    │   └── utils.ts // Contains <taylored number="1">...</taylored>
    ├── node_modules/
    │   └── some_dependency/
    │       └── index.ts // Also contains <taylored number="99">...</taylored> (unwanted)
    └── dist/
        └── main.js
    ```
*   **Command (Incorrect - without exclude)**:
    ```bash
    taylored --automatic ts,js main
    ```
    This would scan `node_modules/` and `dist/` as well, potentially finding unwanted blocks or taking a long time.
*   **Command (Correct - with exclude)**:
    ```bash
    taylored --automatic ts,js main --exclude node_modules,dist
    ```
*   **Result**:
    *   Only `.taylored/1.taylored` from `src/utils.ts` would be generated.
    *   The block in `node_modules/` would be ignored.

**Example 6: Using `compute` with Python**

*   **File**: `data/report.txt` (on `main` branch)
    ```
    Report Generated:
    <!-- <taylored number="20" compute="<!--,-->"> -->
    <!--
    #!/usr/bin/python3
    import datetime
    import os

    user = os.getenv('USER', 'anonymous')
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"User: {user}")
    print(f"Timestamp: {now}")
    print("Report Content: Processed item_count=123.")
    -->
    <!-- </taylored> -->
    ```
*   **Command**:
    ```bash
    taylored --automatic txt main
    ```
*   **Prerequisites**: `python3` must be installed and in the system's `PATH`.
*   **Result**:
    *   `.taylored/20.taylored` is created.
    *   The `compute` attribute `<!--,-->` strips the XML-style comment markers.
    *   The Python script is executed using the `python3` interpreter found via its shebang. Its `stdout`, for example:
        ```text
        User: myuser
        Timestamp: 2023-10-28 14:30:00
        Report Content: Processed item_count=123.
        ```
        replaces the original Taylored block in the generated patch.

**Example 7: Using `compute` with a Shell Script**

*   **File**: `scripts/deploy-info.sh-template` (on `main` branch, note the `.sh-template` extension)
    ```bash
    # Deployment Information
    # <taylored number="25" compute="#<--S,E-->#">
    #<--S
    #!/bin/bash
    # This script generates deployment details.
    echo "Deployed By: $(whoami)"
    echo "Deployment Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "Hostname: $(hostname)"
    #E-->#
    # </taylored>
    ```
*   **Command**:
    ```bash
    taylored --automatic sh-template main
    ```
*   **Prerequisites**: A POSIX-compliant shell (like `bash`) must be available in the system's `PATH`.
*   **Result**:
    *   `.taylored/25.taylored` is created.
    *   The `compute` attribute `#<--S,E-->#` strips the custom comment markers.
    *   The shell script is executed using the interpreter specified in its shebang (`#!/bin/bash`). Its `stdout`, for example:
        ```text
        Deployed By: testuser
        Deployment Date: 2023-10-28T15:00:00Z
        Hostname: my-build-server
        ```
        replaces the original Taylored block in the generated patch.

The `taylored --automatic` command is a sophisticated feature that combines code scanning, Git automation, and optional dynamic content generation to provide a flexible way of managing code as plugins. Careful use of markers, the `compute` attribute, and exclusions is key to leveraging its full potential.

---

### `taylored setup-backend`
**Note: This command is part of the full `taylored` package and is not available in `taylored-lite`.**


#### Purpose (`setup-backend`)<a name="purpose-setup-backend"></a>

The `taylored setup-backend` command initializes the "Backend-in-a-Box" server, a prerequisite for using the Taysell commercial patch distribution system. This server handles payment processing (via PayPal) and secure patch delivery.

#### Process (`setup-backend`)<a name="process-setup-backend"></a>

1.  **Docker Check**: Verifies if Docker is installed and accessible on the system, as Docker is required to run the backend server.
2.  **Copy Template Files**: Copies the `templates/backend-in-a-box` directory from the Taylored installation into a new `taysell-server` directory in the current working directory.
3.  **Interactive Configuration**: Prompts the user for necessary configuration details. In non-interactive environments (like test suites), it may use predefined default values. The prompts include:
    *   **PayPal Environment**: `sandbox` or `production`.
    *   **PayPal Client ID**: Your PayPal application's Client ID.
    *   **PayPal Client Secret**: Your PayPal application's Client Secret.
    *   **Public Server URL**: The publicly accessible URL where your Taysell server will be hosted (e.g., `https://your-taysell-server.com`).
    *   **Patch Encryption Key**: A strong secret key (recommended 32+ characters) used to encrypt your commercial patches. This key is critical for security.
    *   **Local Server Port**: The local port on which the Dockerized server will run (e.g., `3000`).
4.  **Create `.env` File**: Generates a `.env` file within the `taysell-server` directory, populating it with the configuration values provided by the user. This file is used by Docker Compose to configure the server environment.
5.  **Instructions**: Provides the user with instructions on how to start the server:
    *   **Using Docker (Recommended)**:
        ```bash
        cd taysell-server
        docker-compose up --build -d
        ```
    *   **Manually (Alternative)**:
        While Docker is recommended for ease of use and consistency, you can also run the server manually:
        1.  Navigate to the `taysell-server` directory: `cd taysell-server`
        2.  Install dependencies: `npm install`
        3.  Ensure all environment variables defined in the `.env` file are set in your current shell session (you might need to source the file or set them manually).
        4.  Start the server: `npm start` (or `node index.js`, depending on the `package.json` scripts).

#### Usage Example (`setup-backend`)<a name="usage-example-setup-backend"></a>

```bash
taylored setup-backend
```
Follow the interactive prompts to configure your backend server.

---

### `taylored create-taysell <file.taylored> [--price <price>] [--desc "description"]`
**Note: This command is part of the full `taylored` package and is not available in `taylored-lite`.**


#### Purpose (`create-taysell`)<a name="purpose-create-taysell"></a>

The `taylored create-taysell <file.taylored>` command is used to package an existing non-commercial `.taylored` patch file for commercial distribution through the Taysell system. It encrypts the patch content and generates a corresponding `.taysell` metadata file that your customers will use with the `taylored --buy` command.

#### Arguments (`create-taysell`)<a name="arguments-create-taysell"></a>

*   **`<file.taylored>` (Required)**:
    *   **Description**: The path to the source (non-commercial) `.taylored` patch file that you want to prepare for sale.
    *   **Example**: `my-feature.taylored`, `../patches/another-fix.taylored`

*   **`--price <price>` (Optional)**:
    *   **Description**: Specifies the price for the patch. If not provided, you will be prompted for it.
    *   **Format**: A string representing the price, e.g., `"9.99"`, `"0.50"`.
    *   **Example**: `--price "19.95"`

*   **`--desc "description"` (Optional)**:
    *   **Description**: Provides a description for the patch. If not provided, or if an empty string is given, you will be prompted for it.
    *   **Format**: A string, typically enclosed in quotes if it contains spaces.
    *   **Example**: `--desc "This patch adds advanced analytics capabilities."`

#### Process (`create-taysell`)<a name="process-create-taysell"></a>

1.  **Input Validation**: Checks if the input `<file.taylored>` exists and is a valid Taylored patch file.
2.  **Backend Configuration Retrieval**:
    *   Attempts to read `SERVER_BASE_URL` and `PATCH_ENCRYPTION_KEY` from the `.env` file located at `taysell-server/.env` (relative to the current working directory). This assumes you have already run `taylored setup-backend`.
    *   If `taysell-server/.env` is not found or these variables are missing, it will prompt the user to enter them. The `PATCH_ENCRYPTION_KEY` is crucial for encrypting the patch.
3.  **Interactive Prompts**: Gathers necessary metadata for the commercial patch. Uses command-line arguments (`--price`, `--desc`) as defaults if provided. In non-interactive environments, it may use predefined defaults.
    *   **Commercial Name**: A user-friendly name for the patch (e.g., "Advanced Data Exporter").
    *   **Description**: A detailed description of the patch's functionality (uses `--desc` value if available).
    *   **Unique Patch ID**: A unique identifier for this patch (e.g., `adv-data-export-v1`). Allows auto-generation based on the name or manual input. This ID will be part of the URLs and filenames.
    *   **Required `taylored` CLI Version**: The minimum version of the `taylored` CLI required to apply this patch (e.g., `>=6.8.21`).
    *   **Price**: The selling price of the patch (uses `--price` value if available).
    *   **Currency Code**: The currency for the price (e.g., "USD", "EUR", "GBP").
    *   **Seller Information**:
        *   Seller Name (e.g., "My Company LLC")
        *   Seller Website (e.g., "https://www.mycompany.com")
        *   Seller Contact Email (e.g., "support@mycompany.com")
4.  **Patch Encryption**:
    *   Reads the content of the input `<file.taylored>`.
    *   Encrypts this content using AES-256-GCM with the `PATCH_ENCRYPTION_KEY`.
    *   Saves the encrypted content to a new file named `<file_basename>.taylored.encrypted` (e.g., if input was `my-feature.taylored`, output is `my-feature.taylored.encrypted`).
5.  **Generate `.taysell` Metadata File**:
    *   Creates a JSON metadata file named `<file_basename>.taysell` (e.g., `my-feature.taysell`). This file contains:
        *   `taysellVersion`: The version of the Taysell metadata format (e.g., "1.0").
        *   `patchId`: The unique patch ID provided by the user.
        *   `sellerInfo`: An object with `name`, `website`, and `contact` for the seller.
        *   `metadata`: An object with `name` (commercial name), `description`, and `tayloredVersion` (required CLI version).
        *   `endpoints`:
            *   `initiatePaymentUrl`: Constructed as `${SERVER_BASE_URL}/pay/${patchId}`.
            *   `getPatchUrl`: Constructed as `${SERVER_BASE_URL}/get-patch`.
        *   `payment`: An object with `price` and `currency`.
6.  **User Instructions**:
    *   Informs the user that the encrypted patch (e.g., `my-feature.taylored.encrypted`) needs to be uploaded to their Taysell server's `patches/` directory. The filename on the server should match `<patchId>.patch.enc` (e.g., `adv-data-export-v1.patch.enc`).
    *   Advises the user to distribute the generated `.taysell` metadata file (e.g., `my-feature.taysell`) to their customers. This is the file customers will use with `taylored --buy`.

#### Usage Example (`create-taysell`)<a name="usage-example-create-taysell"></a>

```bash
taylored create-taysell my-super-feature.taylored --price "4.99" --desc "This patch adds an amazing new super feature to the application."
```
This command will then interactively ask for other details like Patch ID, seller info, etc., using the provided price and description as defaults.

---

### `taylored --buy <file.taysell> [--dry-run]`
**Note: This command is part of the full `taylored` package and is not available in `taylored-lite`.**


#### Purpose (`--buy`)<a name="purpose-buy"></a>

The `taylored --buy <file.taysell>` command initiates the purchase process for a commercial patch defined in a `.taysell` metadata file. Upon successful payment verification, it securely downloads the patch from the seller's Taysell server and applies it to the user's local Git repository.

#### Arguments (`--buy`)<a name="arguments-buy"></a>

*   **`<file.taysell>` (Required)**:
    *   **Description**: Path to the `.taysell` metadata file received from the patch seller. This file contains all necessary information to initiate the purchase and download the patch.
    *   **Example**: `awesome-feature.taysell`, `../downloads/plugin-for-x.taysell`

*   **`--dry-run` (Optional)**:
    *   **Description**: If this flag is provided, the command will simulate the entire purchase and download process, including fetching the patch content from the server after successful payment polling. However, it will **not** save the patch to the local `.taylored/` directory and will **not** apply it to the repository. Instead, it will print the received patch content to the console. This is useful for inspecting the patch content or testing the purchase flow without making changes to the local project.
    *   **Example**: `taylored --buy awesome-feature.taysell --dry-run`

#### Process (`--buy`)<a name="process-buy"></a>

1.  **Input Validation**:
    *   Checks if the input `<file.taysell>` exists and is a valid JSON file.
    *   Validates the content of the `.taysell` file, ensuring required fields like `patchId`, `endpoints.initiatePaymentUrl`, and `endpoints.getPatchUrl` are present.
    *   Critically, verifies that `endpoints.getPatchUrl` uses `https://` for security.
2.  **User Confirmation**: Prompts the user to confirm if they want to proceed with purchasing the patch, displaying details like the patch name and seller information from the `.taysell` file.
3.  **Session ID Generation**: Generates a cryptographically strong unique `cliSessionId` (UUID v4). This ID is used to link the CLI session with the web browser payment session.
4.  **Browser Interaction**:
    *   Constructs the payment initiation URL: `${endpoints.initiatePaymentUrl}?cliSessionId=<generated_cliSessionId>`.
    *   Opens the user's default web browser to this URL. The user then completes the payment process on the seller's Taysell server (which typically redirects to PayPal).
    *   If the browser cannot be opened automatically, it prints the URL to the console and instructs the user to copy-paste it.
5.  **Payment Polling**:
    *   While the user is interacting with the browser, the CLI starts polling a `/check-purchase/<cliSessionId>` endpoint on the seller's Taysell server (the base URL is derived from `endpoints.initiatePaymentUrl`).
    *   It polls periodically (e.g., every 2.5 seconds) for a predefined timeout period (e.g., 10 minutes).
    *   The server endpoint will return a `purchaseToken` and verify the `patchId` once the payment is successfully approved and processed via PayPal webhook on the server side.
6.  **Patch Download**:
    *   Once the `purchaseToken` (and matching `patchId`) is received from the polling endpoint, the CLI makes a secure POST request to the `endpoints.getPatchUrl` specified in the `.taysell` file.
    *   The request body includes the `patchId` and the received `purchaseToken`.
    *   The seller's server validates these details and, if correct, responds with the decrypted patch content.
7.  **Patch Handling**:
    *   **If `--dry-run` is specified**:
        *   The received patch content is printed to the console.
        *   The patch is **not** saved to disk.
        *   The patch is **not** applied to the repository.
    *   **If `--dry-run` is NOT specified (default behavior)**:
        *   The received patch content is saved into the local `.taylored/` directory. The filename is derived from the `patchId` (e.g., `<patchId_sanitized>.taylored`).
        *   The command then automatically calls the equivalent of `taylored --add <saved_patch_file>` to apply the newly downloaded and saved patch to the user's current working directory.
        *   The user is informed of the successful purchase, download, and application.
8.  **Error Handling**: If any step fails (e.g., polling times out, payment is not confirmed, download fails, `.taysell` file is invalid), the command exits with an appropriate error message.

#### Usage Example (`--buy`)<a name="usage-example-buy"></a>

To purchase and download a patch:
```bash
taylored --buy professional-exporter.taysell
```

To test the purchase flow and view patch content without applying:
```bash
taylored --buy professional-exporter.taysell --dry-run
```

## 5. How It Works (Under the Hood)

This section delves into the technical details of how Taylored performs its operations, primarily by orchestrating various Git commands. Understanding these underlying mechanisms can be helpful for advanced users and for troubleshooting. All operations are expected to be run from the root of a Git repository.

### `--save <branch_name>`

*   **Core Git Command**: `git diff HEAD <branch_name> --patch --no-color --no-ext-diff --no-textconv` (or similar options to get a clean, applicable patch).
*   **Process**:
    1.  Taylored executes `git diff` to get the changes between the current `HEAD` and the specified `<branch_name>`.
    2.  It then analyzes this diff:
        *   It checks if the diff contains *only* line additions (lines starting with `+` in the diff, excluding the `+++` header) or *only* line deletions (lines starting with `-`, excluding the `---` header), or no textual changes.
        *   Lines that are modified (changed) typically appear as a deletion of the old line and an addition of the new line in a Git diff.
    3.  **Outcome**:
        *   If the diff is purely additive, purely deletive, or empty (no textual changes), the raw diff output is saved into a new file: `.taylored/<sanitized_branch_name>.taylored`. The branch name is sanitized to remove characters that are problematic for filenames.
        *   If the diff contains a mix of additions and deletions, Taylored reports an error and does not save the file, enforcing its "atomic change" principle.

### `--add <taylored_file_name>` / `--remove <taylored_file_name>`

*   **Core Git Command**: `git apply`
    *   For `taylored --add`: `git apply --unsafe-paths --whitespace=nowarn <path_to_taylored_file>` (options may vary).
    *   For `taylored --remove`: `git apply -R --unsafe-paths --whitespace=nowarn <path_to_taylored_file>` (options may vary). The `-R` flag stands for "reverse".
*   **Process**:
    1.  Taylored locates the specified `.taylored` plugin file in the `.taylored/` directory.
    2.  It then invokes `git apply` to patch the files in the current working directory.
        *   `taylored --add` applies the patch directly.
        *   `taylored --remove` applies the patch in reverse, effectively undoing the changes.
    3.  `git apply` attempts to match the context lines in the patch file with the content of the target files. If successful, it modifies the target files.
*   **Error Handling**: If `git apply` encounters issues (e.g., context lines don't match, leading to a "patch does not apply" error, or conflicts occur), it will report an error. Taylored relays this information. Files might be left in a partially patched state or with `.rej` (rejection) files if conflicts are severe, though `git apply` often tries to be all-or-nothing unless specific flags force it otherwise.

### `--verify-add <taylored_file_name>` / `--verify-remove <taylored_file_name>`

*   **Core Git Command**: `git apply --check`
    *   For `taylored --verify-add`: `git apply --check --unsafe-paths --whitespace=nowarn <path_to_taylored_file>`
    *   For `taylored --verify-remove`: `git apply --check -R --unsafe-paths --whitespace=nowarn <path_to_taylored_file>`
*   **Process**:
    1.  Similar to `taylored --add`/`taylored --remove`, but the `--check` flag tells `git apply` to only report if the patch *would* apply cleanly, without actually modifying any files.
    2.  Taylored uses the exit status of `git apply --check` to determine success or failure.
*   **Outcome**: Reports whether the patch can be applied/removed cleanly or not. No files in the working directory are altered.

### `--list`

*   **Core Operation**: Filesystem directory listing.
*   **Process**:
    1.  Taylored scans the `.taylored/` directory.
    2.  It lists all files that end with the `.taylored` extension.
    3.  The output is typically a simple list of these filenames.

### `--offset <taylored_file_name> [BRANCH_NAME]`

This is a more complex Git orchestration. The exact sequence can vary, but the conceptual workflow is:

1.  **Prerequisite Check**: Verifies the Git working directory is clean (no uncommitted changes). This is crucial because the command will perform checkouts and commits.
2.  **Setup**:
    *   Determines the target branch: `[BRANCH_NAME]` if provided, otherwise a default like `main`.
    *   Creates a temporary working branch, often based on the target branch. Let's call it `temp-offset-branch`.
3.  **Attempt to Materialize Patch Changes**:
    *   The goal is to get the *effect* of the `<taylored_file_name>` applied onto `temp-offset-branch`.
    *   This might involve:
        *   Trying to `git apply` the patch.
        *   If that fails, it might try more advanced strategies, potentially involving committing the patch to a diverging temporary branch and then trying to re-generate a diff from there, or using `git patch -p1 --three-way` if the patch allows. The aim is to get the code changes (even if context is messy) onto `temp-offset-branch`.
4.  **Commit Changes**: The changes from the patch are committed onto `temp-offset-branch`.
5.  **Generate New Diff**:
    *   A new diff is generated using `git diff <target_branch> temp-offset-branch --patch ...` (with appropriate options). This diff represents the changes from the patch, but now with line numbers and context relevant to the `<target_branch>`.
6.  **Update Plugin File**: The content of the original `<taylored_file_name>` in the `.taylored/` directory is overwritten with this newly generated diff.
7.  **Cleanup**:
    *   Restores the original branch that was checked out before the command started.
    *   Deletes `temp-offset-branch` and any other temporary artifacts.
*   **Error Handling**: If at any stage the Git operations fail critically (e.g., the patch is so divergent it can't be sensibly applied even temporarily, or commits fail), the command will report an error, attempt to clean up, and leave the original `.taylored` plugin file untouched or provide guidance.

### `--automatic <EXTENSIONS> <branch_name> [--exclude <DIR_LIST>]`

This is the most Git-intensive command. For *each* Taylored block found:

1.  **Prerequisite Check**: Ensures the Git working directory is clean and specific temporary filenames (like `.taylored/main.taylored`) are not present.
2.  **Block Identification**: Scans files matching `<EXTENSIONS>` (respecting `--exclude`) for `<taylored number="N">...</taylored>` blocks.
3.  **Handle `compute` (if present)**:
    *   If the block has a `compute` attribute, the embedded script is processed first.
    *   The script's `stdout` is captured. This output becomes the effective content that will be part of the generated patch. If the script fails, this specific block is usually skipped, and an error is logged.
4.  **Git Workflow per Block**:
    a.  **Store Original Branch**: Notes the current Git branch.
    b.  **Create Temporary Branch**: A unique temporary branch (e.g., `_taylored_temp_N`) is created from `<branch_name>`. This temporary branch initially mirrors `<branch_name>`.
    c.  **Switch to Temporary Branch**: `git checkout _taylored_temp_N`.
    d.  **Modify File on Temporary Branch**:
        *   The *entire original Taylored block* (from the `<taylored ...>` start marker line to the `</taylored>` end marker line, inclusive) is deleted from the source file(s) on this temporary branch.
        *   If it was a `compute` block, it's the original script/markers that are deleted, not the `stdout`. The `stdout` is used in the next step.
    e.  **Commit Deletion**: The change (file with block removed) is committed on `_taylored_temp_N`.
    f.  **Generate Diff**:
        *   If it was a **static block** (no `compute`): A `git diff _taylored_temp_N <branch_name> --patch ...` is performed. This compares the state where the block is *deleted* (`_taylored_temp_N`) with the state where the block *exists* (`<branch_name>`). The resulting diff, when applied, effectively *adds* the block.
        *   If it was a **`compute` block**: The captured `stdout` from the script is used. Taylored constructs a diff that represents changing the file state (as on `<branch_name>` but with the original Taylored block markers removed) to a state that includes the script's `stdout` in place of the original markers. This often involves creating a version of the file with the `stdout` injected, committing it, and then diffing against the state where the block was just markers.
    g.  **Save Plugin**: The generated diff is saved to `.taylored/N.taylored`.
    h.  **Cleanup**:
        *   `git checkout <original_branch>` (restores the user's original branch).
        *   `git branch -D _taylored_temp_N` (deletes the temporary branch).
5.  **Loop**: This process repeats for every Taylored block found.
6.  **Finalization**: Waits for any asynchronous `compute` scripts to finish before the command exits.

The use of Git for these operations ensures robustness and leverages Git's powerful diffing and patching capabilities. However, it also means that a clean Git state and a valid Git repository context are essential for Taylored to function correctly.

## 6. Contributing

Contributions to Taylored are highly welcome and appreciated! Whether you're fixing a bug, proposing a new feature, improving documentation, or submitting other enhancements, your help makes Taylored better for everyone.

This section provides some general guidelines for contributing to the project.

### Reporting Issues

If you encounter a bug, have a feature request, or find an issue with the documentation, please check the project's GitHub repository issue tracker to see if it has already been reported.

*   **GitHub Issues**: [https://github.com/tailot/taylored/issues](https://github.com/tailot/taylored/issues)

When reporting a new issue, please include:
*   A clear and descriptive title.
*   A detailed description of the issue or feature request.
*   The version of Taylored you are using (`taylored --version`).
*   Your operating system and Node.js version.
*   Steps to reproduce the bug (if applicable), including any relevant code snippets or `.taylored` plugin files.
*   Expected behavior and actual behavior.

### Submitting Pull Requests

If you'd like to contribute code or documentation changes, please follow these general steps:

1.  **Fork the Repository**:
    Create your own fork of the Taylored repository on GitHub.

2.  **Clone Your Fork**:
    Clone your forked repository to your local machine.
    ```bash
    git clone git@github.com:YOUR_USERNAME/taylored.git
    cd taylored
    ```

3.  **Create a Feature Branch**:
    Create a new branch for your changes. Choose a descriptive branch name (e.g., `feature/add-new-command`, `bugfix/resolve-offset-issue`, `docs/update-contributing-guide`).
    ```bash
    git checkout -b feature/your-amazing-feature
    ```

4.  **Set Up Development Environment**:
    Ensure you have followed the [Development Setup from Source](#development-setup-from-source) instructions to install dependencies and be able to build the project.
    ```bash
    npm install
    npm run build # Run after making TypeScript changes
    ```

5.  **Make Your Changes**:
    Implement your feature, fix the bug, or make your documentation updates.
    *   Adhere to the existing code style and conventions if possible.
    *   If adding new functionality, consider if unit tests are needed. (Details on running tests would ideally be in a `CONTRIBUTING.md` file in the repo, or a development guide).
    *   Ensure your changes are well-commented where necessary.

6.  **Test Your Changes**:
    *   Run `npm run build` if you made TypeScript changes.
    *   Test the functionality thoroughly. If tests are part of the project, run them (e.g., `npm test` - check `package.json` for the actual test script).

7.  **Commit Your Changes**:
    Commit your changes with a clear and descriptive commit message. Follow standard commit message conventions (e.g., a concise subject line, followed by a more detailed body if needed).
    ```bash
    git add .
    git commit -m "feat: Add YourAmazingFeature with X and Y capabilities"
    # Or for a fix:
    # git commit -m "fix: Resolve issue Z in --automatic command"
    ```

8.  **Push to Your Fork**:
    Push your feature branch to your fork on GitHub.
    ```bash
    git push origin feature/your-amazing-feature
    ```

9.  **Open a Pull Request (PR)**:
    Go to the original Taylored repository on GitHub and open a Pull Request from your feature branch to the main development branch of the Taylored project (e.g., `main` or `develop`).
    *   Provide a clear description of your changes in the PR.
    *   Reference any relevant issues (e.g., "Closes #123").

10. **Address Feedback**:
    Project maintainers will review your PR. Be prepared to discuss your changes and address any feedback or requested modifications.

**Code Style and Linting**:
*   This project may use a linter (like ESLint or Prettier) to maintain code style consistency. Check `package.json` for linting scripts (e.g., `npm run lint`) and try to ensure your code conforms to the project's style.

Thank you for considering contributing to Taylored!

## 7. License

Taylored is open-source software licensed under the MIT License.

The MIT License is a permissive free software license originating at the Massachusetts Institute of Technology (MIT). It puts very limited restriction on reuse and has, therefore, high license compatibility.

**Summary of the MIT License terms:**

*   **Permissions**:
    *   Commercial use
    *   Modification
    *   Distribution
    *   Private use
*   **Conditions**:
    *   License and copyright notice (The original copyright notice and a copy of the license itself must be included with the software).
*   **Limitations**:
    *   Liability
    *   Warranty (The software is provided "as is", without warranty of any kind).

You can find the full text of the license in the [LICENSE](LICENSE) file in the root of the Taylored repository.

By contributing to Taylored, you agree that your contributions will be licensed under its MIT License.

## 8. Project Templates

This section describes official project templates that can be used with or are provided by Taylored.

### Backend-in-a-Box

#### Overview <a name="bib-overview"></a>

"Backend-in-a-Box" is a Node.js Express application template designed to provide a ready-to-use server for selling digital patches or similar small digital goods. It features a secure download mechanism and has recently been enhanced with PayPal integration for payment processing.

It's intended to be a quick-start solution for developers looking to monetize their digital creations with minimal backend setup. The backend handles payment intent, webhook verification, and secure delivery of patch files.

   **Note: The Taylored CLI commands for interacting with this backend for monetization purposes (`setup-backend`, `create-taysell`, `taylored --buy`) are available exclusively in the full `taylored` package, not in `taylored-lite`.**

#### PayPal Integration for Patch Monetization <a name="bib-paypal-integration"></a>

The Backend-in-a-Box template now includes a comprehensive PayPal integration to manage the sale of patches. The general flow is as follows:

1.  **Payment Initiation**: A user requests to buy a patch via the `GET /pay/:patchId` endpoint. The backend creates an order with PayPal and redirects the user to PayPal's checkout page.
2.  **User Approval**: The user approves the payment on PayPal.
3.  **Webhook Notification**: PayPal sends a webhook event (e.g., `CHECKOUT.ORDER.APPROVED`) to the backend's `POST /paypal/webhook` endpoint.
4.  **Webhook Verification**: The backend verifies the authenticity of the webhook using the PayPal SDK and the configured `WEBHOOK_ID`.
5.  **Purchase Record Update**: Upon successful verification and event processing, a unique `purchase_token` is generated and stored in the database, marking the purchase as complete.
6.  **Patch Retrieval**: The user can then use their `purchase_token` and the `patchId` with the `POST /get-patch` endpoint to download the encrypted patch file. The backend decrypts the patch on-the-fly using `PATCH_ENCRYPTION_KEY`.

#### Environment Variables <a name="bib-env-vars"></a>

The following environment variables are crucial for configuring the Backend-in-a-Box template, especially its PayPal integration:

*   `DB_PATH`: Path to the SQLite database file (e.g., `./db/taysell.sqlite`).
*   `PORT`: The port on which the Node.js application will listen (defaults to `3000`).
*   `PAYPAL_ENVIRONMENT`: Set to `sandbox` for testing or `live` for production.
*   `PAYPAL_CLIENT_ID`: Your PayPal application Client ID.
*   `PAYPAL_CLIENT_SECRET`: Your PayPal application Client Secret.
*   `SERVER_BASE_URL`: The public base URL of your server (e.g., `https://yourdomain.com`). This is used for constructing PayPal return URLs.
*   `PATCH_ENCRYPTION_KEY`: A 32-byte hex-encoded string used to encrypt and decrypt your patch files. This key is vital for securing your digital goods.
*   `WEBHOOK_ID`: Your PayPal Webhook ID. This is obtained from your PayPal developer dashboard when you set up a webhook. **Important:** The `index.js` file contains a placeholder value (`"YOUR_PAYPAL_WEBHOOK_ID_HERE"`) that **must be replaced** with your actual Webhook ID from PayPal for webhook verification to succeed.

#### API Endpoints <a name="bib-api-endpoints"></a>

The Backend-in-a-Box template exposes the following key API endpoints:

*   **`GET /pay/:patchId`**: Initiates the payment process for a given `patchId`. Redirects the user to PayPal.
*   **`POST /paypal/webhook`**: Handles incoming webhook notifications from PayPal to confirm payment status and update purchase records.
*   **`GET /paypal/success`**: The URL users are redirected to after successfully approving a payment on PayPal.
*   **`GET /paypal/cancel`**: The URL users are redirected to if they cancel the payment process on PayPal.
*   **`POST /get-patch`**: Allows users to download a patch file using a valid `patchId` and `purchaseToken`. Expects a JSON body with `patchId` and `purchaseToken`.

#### The `patches/` Directory <a name="bib-patches-dir"></a>

*   **Purpose**: This directory, located at the root of the Backend-in-a-Box project (`./patches`), is used to store your encrypted patch files.
*   **Naming Convention**: Patch files should be named `<patchId>.patch.enc`. For example, if a patch is identified by `feature-abc`, its encrypted file should be `patches/feature-abc.patch.enc`.
*   **Encryption**: You are responsible for encrypting these patches using AES-256-GCM with the key specified in the `PATCH_ENCRYPTION_KEY` environment variable before placing them in this directory. The backend will decrypt them for users upon valid purchase.

#### Key Dependencies <a name="bib-dependencies"></a>

The PayPal integration introduces the following key Node.js dependencies to the Backend-in-a-Box template:

*   `axios`: Used for making HTTP requests (though direct use in the final PayPal integration might be minimal if the SDK handles all communication).
*   `@paypal/checkout-server-sdk`: The official PayPal SDK for Node.js to interact with the PayPal v2 API.
*   `sqlite3`: For database operations to store purchase information.
*   `express`: The web framework used.

#### Docker Configuration <a name="bib-docker-config"></a>

The Docker setup for the Backend-in-a-Box template has been updated to support the new features:

*   **`docker-compose.yml`**:
    *   Includes a volume mapping for the `patches/` directory: `- ./patches:/usr/src/app/patches`. This ensures that your local encrypted patch files are available inside the container.
*   **`Dockerfile`**:
    *   The exposed port and `PORT` environment variable are now aligned to `3000` (previously `80`).
    *   A `patches/` directory is created within the container image, and appropriate permissions are set for `appuser`.

These details should help users understand and configure the Backend-in-a-Box template with its PayPal monetization features.
