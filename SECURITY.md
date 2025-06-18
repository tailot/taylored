# Security Policy for Taylored

The security of the 'taylored' project is a priority. I appreciate the help of the security community and developers in keeping this software secure.

## Supported Versions

Currently, only the latest version of 'taylored' is officially supported with security patches. I encourage you to always use the most recent version available.

## Reporting a Vulnerability

I take all security bugs in 'taylored' very seriously. If you discover a vulnerability, I ask that you report it responsibly.

**DO NOT create a public GitHub issue.**

Instead, send an email to the project author at **\`tailot@gmail.com\`**.

Please include in your report:
* A clear and detailed description of the vulnerability.
* The necessary steps to reproduce the issue.
* The potential impact of the vulnerability.
* Any suggested mitigation or fixes (if applicable).

Reports will be analyzed and addressed as quickly as possible, in a time frame directly proportional to the severity and complexity of the identified issue.

## Scope

This security policy applies to the following project components:

* **The \`taylored\` Command-Line Tool (CLI)**: Includes all commands such as \`--save\`, \`--add\`, \`--remove\`, \`--offset\`, \`--automatic\`, \`setup-backend\`, \`create-taysell\`, and \`--buy\`.
* **The "Backend-in-a-Box" Template**: Includes the source code of the Express server provided in \`templates/backend-in-a-box/\`, its Docker configuration, and the payment handling logic with PayPal.

### Out of Scope

The following items are considered out of scope for this security policy:

* **Vulnerabilities in third-party dependencies**: Vulnerabilities found in packages such as the PayPal SDK, Express, \`fs-extra\`, etc., should be reported directly to their respective projects.
* **Seller's Environment Configuration**: The security of the server environment where the "Backend-in-a-Box" is run is the responsibility of the user (the seller). This includes the proper management of API keys, environment variables, and general server hardening.
