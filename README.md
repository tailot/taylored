# Taylored

**Transform branch changes into manageable plugins. Taylored is a command-line tool to expertly manage and apply `.taylored` plugins, enabling conditional and atomic source code modifications with full Git integration.**

## Overview

Taylored helps you streamline source code modifications by treating them as "plugins" or "patches." These are stored in `.taylored` files, which essentially capture `git diff` outputs.

A key feature is Taylored's intelligent plugin generation:
* The `--save` command creates a `.taylored` file **only if** the changes between a specified branch and `HEAD` consist *exclusively* of line additions or *exclusively* of line deletions. This ensures plugins are atomic and well-defined, simplifying application and management.
* The `--automatic` command can scan your codebase for special markers, extract these blocks, and generate `.taylored` files for them, even supporting dynamic content generation via a `compute` attribute.

Taylored also provides robust tools for patch lifecycle management:
* `--offset`: Updates patch offsets to keep them applicable as your codebase evolves. It can embed a custom `Subject:` line in the updated `.taylored` file.

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

For more detailed information on commands, advanced usage, development setup, and contributing, please see our [Comprehensive Documentation](DOCUMENTATION.md).
