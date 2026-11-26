# SuperTools MCP

**SuperTools MCP** is a local [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that lets an AI assistant work with a project on your computer. It provides project file tools, optional command execution, Playwright-powered Chromium browser automation, and optional read-only GitHub tools.

It is designed to run locally and connect to an MCP-compatible desktop client such as Claude Desktop.

> **Project status:** Active development. The build and automated test suite have passed on GitHub Actions for Windows and Ubuntu. Browser workflows should still be tested with your own MCP client and websites before relying on them for important tasks.

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Install on Windows](#install-on-windows)
- [Configure your project folder](#configure-your-project-folder)
- [Connect Claude Desktop](#connect-claude-desktop)
- [Use the tools](#use-the-tools)
- [Optional features](#optional-features)
- [Security and privacy](#security-and-privacy)
- [Troubleshooting](#troubleshooting)
- [Development and tests](#development-and-tests)
- [Project structure](#project-structure)

## Features

### Project files
- List and read files inside one configured project folder.
- Write files inside that folder with explicit approval.
- Reject path traversal and symlink escapes from the configured folder.

### Browser automation
Powered by **Playwright** and **headless Chromium**:
- Start and close isolated browser sessions.
- Open, navigate, reload, and manage multiple tabs.
- Click elements, fill forms, type text, press keys, select options, hover, and scroll.
- Wait for elements and inspect page content and element attributes.
- Capture viewport or full-page PNG/JPEG screenshots.
- Collect console messages, JavaScript page errors, and network request/response diagnostics.
- Inspect the accessibility tree.
- Run JavaScript in the page and send a restricted set of Chrome DevTools Protocol commands.
- Upload project files to file inputs and save browser downloads inside the project folder.
- Export a page to PDF.

Browser sessions are temporary and isolated. They do not use your personal Chrome profile, saved passwords, or existing browser cookies.

### Optional command execution
- Run PowerShell commands on Windows.
- Run Bash commands through WSL2 when WSL2 is installed.
- Terminal access is disabled by default and requires explicit approval for each command.

### Optional GitHub access
- Read repository metadata.
- Read text files from a repository and branch.
- GitHub tools are registered only when a GitHub token is configured.

## How it works

~~~text
AI client (for example, Claude Desktop)
                 |
                 | MCP over local stdio
                 v
          SuperTools MCP
          /      |       \
    Project   Playwright  Optional
     files    + Chromium  GitHub API
                 |
             Websites
~~~

The MCP server runs as a local Node.js process. Your MCP client starts it and communicates with it over standard input/output (stdio). The server uses PROJECT_ROOT to decide which folder its file tools can access.

## Requirements

For the documented Windows setup:

- Windows 10 or Windows 11.
- Node.js 20 or newer (the current Node.js LTS release is recommended).
- npm (included with Node.js).
- Git, to clone and update the repository.
- Claude Desktop or another MCP client that supports local stdio servers.
- Internet access during installation so npm and Playwright can download dependencies and Chromium.

Optional:
- WSL2, only if you want to use the WSL shell option.
- A fine-grained GitHub personal access token, only if you want the GitHub tools.

Check your installations in PowerShell:

~~~powershell
node --version
npm --version
git --version
~~~

## Install on Windows

### 1. Clone the repository

Open PowerShell and run:

~~~powershell
git clone https://github.com/angadkumar9128/Super-claude-extension.git
cd Super-claude-extension
~~~

### 2. Install Node.js dependencies

~~~powershell
npm install
~~~

### 3. Install Chromium for Playwright

~~~powershell
npx playwright install chromium
~~~

This downloads the browser binary used by the browser tools. Installing Node.js alone does not install Chromium.

### 4. Build and run the tests

~~~powershell
npm run build
npm test
~~~

If both commands complete successfully, the TypeScript build and automated tests have passed on your computer.

## Configure your project folder

SuperTools needs an explicit folder to work in. This is the project folder the file tools can list, read, and write. It is **not automatically the SuperTools MCP source folder**.

From the SuperTools repository directory, create your local environment file:

~~~powershell
Copy-Item .env.example .env
notepad .env
~~~

Set PROJECT_ROOT to the full path of the project you want the AI assistant to work with. For example:

~~~env
PROJECT_ROOT=C:\Users\YourName\Documents\MyApp
ALLOW_TERMINAL=false
TERMINAL_TIMEOUT_MS=30000
TERMINAL_MAX_OUTPUT_CHARS=20000
GITHUB_TOKEN=
~~~

Replace the example path with a real folder on your computer. Keep ALLOW_TERMINAL=false initially. The .env file contains local settings and secrets; never commit it to GitHub or share its contents.

## Connect Claude Desktop

1. Make sure you have completed the installation and build steps above.
2. Find the full path to this repository on your computer. For example: C:\Users\YourName\Super-claude-extension.
3. Open the Claude Desktop MCP configuration file. The location and menu for opening it can vary by Claude Desktop version; use Claude Desktop's developer or MCP settings if available.
4. Add the following server entry inside the top-level mcpServers object. Replace both example paths with your actual paths.

~~~json
{
  "mcpServers": {
    "supertools": {
      "command": "node",
      "args": [
        "C:\\Users\\YourName\\Super-claude-extension\\dist\\index.js"
      ],
      "env": {
        "PROJECT_ROOT": "C:\\Users\\YourName\\Documents\\MyApp",
        "ALLOW_TERMINAL": "false"
      }
    }
  }
}
~~~

5. Save the configuration and completely restart Claude Desktop.
6. Open a new conversation and ask Claude to list files in your configured project folder. Approve any permission prompt shown by Claude Desktop.

**Important:** The paths in the JSON configuration must be absolute paths, and each Windows backslash must be doubled. If you already have an mcpServers object, add the supertools entry to it rather than replacing your other server entries.

For a shorter setup reference, see [docs/CLAUDE-DESKTOP.md](docs/CLAUDE-DESKTOP.md).

## Use the tools

After the MCP server connects, the client can call the tools below. The assistant chooses the relevant tool based on your request.

### Project files
- **list_project_files** — list files and folders in the selected project.
- **read_project_file** — read a project file.
- **write_project_file** — write a project file; requires explicit approval.

### Browser
Start with **browser_start_session**. It returns a sessionId and initial pageId; pass these identifiers to later browser calls to select the session and tab.

| Tool | Purpose |
|---|---|
| browser_start_session / browser_close_session | Start or close an isolated Chromium session |
| browser_open_page / browser_navigate | Open a URL or navigate a tab |
| browser_new_tab / browser_list_tabs / browser_close_tab | Manage tabs |
| browser_navigate_history | Go back, forward, or reload |
| browser_click / browser_fill / browser_type | Interact with page elements |
| browser_press_key / browser_select_option / browser_set_checked | Keyboard, select, checkbox, and radio interactions |
| browser_hover / browser_scroll / browser_wait_for | Hover, scroll, and wait for elements |
| browser_get_page_content / browser_get_element_info | Read page content and inspect elements |
| browser_screenshot | Capture a viewport or full-page screenshot |
| browser_get_console_logs | Read console messages and uncaught page errors |
| browser_get_network_events | Inspect request, response, failure, and blocked-request events |
| browser_clear_diagnostics | Clear stored diagnostic events |
| browser_get_accessibility_tree | Inspect the accessibility tree |
| browser_evaluate | Evaluate JavaScript in the current page |
| browser_devtools_command | Send an allowlisted Chrome DevTools Protocol command |
| browser_set_viewport / browser_set_dialog_action | Change viewport or dialog handling |
| browser_upload_file / browser_download_file | Transfer files within the configured project boundary |
| browser_save_pdf | Export the page as a PDF |

Browser file uploads and downloads use paths relative to PROJECT_ROOT. Uploads are limited to 25 MB and downloads to 100 MB. Screenshots are returned to the MCP client as image content; they are not automatically saved to disk.

### Terminal
- **run_project_command** — run a PowerShell or WSL2 command, if terminal access has been enabled.

### GitHub
- **github_get_repository** — read repository metadata.
- **github_read_file** — read a file from a repository.

GitHub tools are not available unless GITHUB_TOKEN is configured.

## Optional features

### Enable terminal commands

**Keep terminal disabled unless you genuinely need it.** To enable it, edit the local .env file:

~~~env
ALLOW_TERMINAL=true
~~~

Restart the MCP server or Claude Desktop after changing the setting. Each terminal call must also include explicit approved=true.

Choose:
- **powershell** for Windows PowerShell commands.
- **wsl** for Bash commands through WSL2.

The requested working directory must be inside PROJECT_ROOT. Review every command before approving it. Terminal commands run with your Windows or WSL user's permissions; the project-folder setting does not sandbox the shell.

### Enable GitHub read tools

1. Create a fine-grained GitHub personal access token.
2. Limit it to only the repositories you need and grant the minimum read permissions required.
3. Set the token in your local .env file:

~~~env
GITHUB_TOKEN=github_pat_your_token_here
~~~

4. Restart the MCP server.

Do not put the token in source code, commit it, or paste it into a chat. If you do not configure a token, the GitHub tools are simply not registered.

## Security and privacy

Read [docs/SECURITY.md](docs/SECURITY.md) before enabling terminal access or using browser automation on sensitive sites.

Key points:

- **File tools:** paths are restricted to PROJECT_ROOT, with traversal and symlink escape checks. This boundary applies to file tools, not terminal commands.
- **Terminal:** disabled by default. When enabled, commands run as your OS user and can access resources beyond the project folder. Approval and command filtering are not a complete sandbox.
- **Browser:** sessions are isolated and do not reuse your personal Chrome profile or saved credentials. Requests to many local/private destinations are blocked, but this network filter is defense in depth, not a substitute for OS-level network isolation.
- **JavaScript and DevTools:** page JavaScript can act with the permissions of the current website. Use these features only on sites you trust. DevTools commands are allowlisted rather than unrestricted.
- **Files transferred by the browser:** uploads and downloads are limited to the configured project folder and have size limits.
- **Secrets:** keep .env private and use least-privilege tokens.

For sensitive projects, use a dedicated low-privilege operating-system account or an appropriately isolated container/virtual machine with restricted mounts and network access.

## Troubleshooting

### Claude Desktop does not show SuperTools

- Confirm the path to dist/index.js in the configuration is correct.
- Confirm you ran npm install and npm run build.
- Confirm PROJECT_ROOT points to an existing folder.
- Check that the JSON is valid and Windows paths use doubled backslashes.
- Completely quit and restart Claude Desktop.
- Check Claude Desktop's MCP/server logs for startup errors.

### Error: PROJECT_ROOT must be set

Set PROJECT_ROOT in the MCP server's environment configuration or local .env file. It must point to an existing directory.

### Browser tools fail to launch

Run these commands from the repository folder:

~~~powershell
npx playwright install chromium
npm run build
~~~

If Chromium still fails to launch, check the error reported by Playwright and confirm your computer allows the browser binary to run.

### Terminal tool says it is disabled

Set ALLOW_TERMINAL=true in the server environment only if you understand the security implications, then restart the MCP server. Each command still requires explicit approval.

### WSL command fails

Confirm WSL2 is installed and a Linux distribution is available. PowerShell tools do not require WSL2.

## Development and tests

From the repository directory:

~~~powershell
npm install
npx playwright install chromium
npm run build
npm test
~~~

Useful scripts:

| Command | Description |
|---|---|
| npm run build | Compile TypeScript into dist/ |
| npm test | Run the Vitest test suite |
| npm start | Start the compiled MCP server |
| npm run dev | Run the TypeScript entry point with tsx |

The MCP server communicates over stdio. Running npm start directly in a terminal may appear to wait without printing a normal message; this is expected while it waits for an MCP client. Press Ctrl+C to stop the process.

Continuous integration runs the build and tests on GitHub-hosted Windows and Ubuntu runners. Passing CI is useful verification, but it does not replace testing the installation and browser workflows on your own machine.

## Project structure

~~~text
src/
  index.ts             MCP server entry point
  config.ts            Environment and project configuration
  tools/
    filesystem.ts      Project file tools
    terminal.ts        Optional PowerShell / WSL2 tool
    browser.ts         Playwright and Chromium tools
    github.ts          Optional GitHub read tools
  security/
    network.ts         Browser network destination checks
    policy.ts          Terminal command policy
    audit.ts           Operational audit logging
  utils/
    paths.ts           Project path validation
tests/                 Automated tests
docs/
  CLAUDE-DESKTOP.md    Claude Desktop setup notes
  SECURITY.md          Security model and limitations
~~~

## Contributing

Issues and pull requests are welcome. Please include clear reproduction steps for bugs and add or update tests when changing tool behavior.

## License

No license file is currently included. Unless a license is added to this repository, do not assume that the code is licensed for redistribution or commercial use.
