# Taylored

[![npm version](https://badge.fury.io/js/taylored.svg)](https://badge.fury.io/js/taylored) (Full package: `taylored`)

[![npm version](https://badge.fury.io/js/taylo.svg)](https://badge.fury.io/js/taylo) (Lite package: `taylo`)


**Transform branch changes into manageable plugins. Taylored is a command-line tool to expertly manage and apply `.taylored` plugins, enabling conditional and atomic source code modifications with full Git integration.**

## Overview

Taylored helps you streamline source code modifications by treating them as "plugins" or "patches." These are stored in `.taylored` files, which essentially capture `git diff` outputs.

A key feature is Taylored's intelligent plugin generation:
* The `--save` command creates a `.taylored` file **only if** the changes between a specified branch and `HEAD` consist *exclusively* of line additions or *exclusively* of line deletions. This ensures plugins are atomic and well-defined, simplifying application and management.
* The `--automatic` command can scan your codebase for special markers, extract these blocks, and generate `.taylored` files for them, even supporting dynamic content generation via a `compute` attribute.

Taylored also provides robust tools for patch lifecycle management:
* `--offset`: Updates patch offsets to keep them applicable as your codebase evolves.

## Why Taylored?

* **Atomic Changes**: Ensure that applied modifications are clean and focused, either purely additive or purely deletive.
* **Versionable Modifications**: Treat complex or conditional code snippets as versionable plugins.
* **Git-Powered**: Leverages Git's robust diffing and applying capabilities.
* **Automation**: Automatically extract and manage tagged code blocks as individual patches.
* **Dynamic Content**: Generate parts of your patches dynamically using executable script blocks.
* **Monetization (only in the full `taylored` package)**: Easily package and sell your `.taylored` plugins, or acquire plugins from others to enhance your projects, leveraging the Taysell backend integration.

## Installation

### Quick Install (for Users)

Taylored is available in two versions:

*   **`taylored` (Full Version)**: Includes all features, including monetization functionalities (`setup-backend`, `create-taysell`, `taylored --buy`).
```bash
npm install -g taylored
```
*   **`taylo` (Lite Version)**: A more essential version focusing on core patch management, excluding monetization features. Ideal for users needing only the fundamental code manipulation capabilities.
```bash
npm install -g taylo
```
Ensure you have Node.js and npm installed. After installation, run `taylored` or `taylo` for a list of commands.


## Project Templates

Taylored can be used to manage various project templates. One such template is:

*   **Backend-in-a-Box**: A Node.js Express application template designed for selling digital patches. It now includes PayPal integration for payment processing, allowing developers to easily monetize their creations. Features include secure patch delivery, webhook handling, and database integration for purchase tracking. Taylored now includes direct CLI support for monetizing these patches through the `setup-backend`, `create-taysell`, and `taylored --buy` commands, streamlining the process from server setup to patch sales and acquisition.
    *   **Key Setup**: Requires configuration of PayPal API credentials, a webhook, and a patch encryption key via environment variables. Encrypted patch files must be placed in the `patches/` directory.
    *   These backend interaction features are available in the full `taylored` package.

For more detailed information on Taylored commands, advanced usage, development setup, and contributing, please see our [Comprehensive Documentation](DOCUMENTATION.md).
