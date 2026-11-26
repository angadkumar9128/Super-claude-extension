# SuperTools MCP

A local MCP server that gives a compatible MCP client tools for working inside one selected project folder on Windows.

## What it can do

- List, read, and write files inside the configured project folder.
- Run approved commands using **Windows PowerShell** or **WSL2 Bash**.
- Automate a headless Chromium browser with Playwright: tabs, navigation, clicks, forms, keyboard, scrolling, screenshots, downloads, PDF export, console/network diagnostics, accessibility inspection, and a restricted DevTools Protocol interface.
- Read GitHub repository metadata and repository files when a GitHub token is configured.

## Requirements

- Windows 10 or 11
- Node.js 20 or newer
- PowerShell (included with Windows; PowerShell 7 is recommended)
- WSL2 only if you want to use the WSL shell option
- A compatible MCP client, such as Claude Desktop
- Chromium for browser tools (installed with `npx playwright install chromium`)

## 1. Download the project

Open PowerShell and run:

```powershell
git clone https://github.com/angadkumar9128/Super-claude-extension.git
cd Super-claude-extension
npm install
npx playwright install chromium
```

## 2. Choose the project folder the tools may manage

Create your local environment file:

```powershell
Copy-Item .env.example .env
notepad .env
```

In .env, set PROJECT_ROOT to the full path of the project you want the MCP server to work with. Example:

```env
PROJECT_ROOT=C:\Users\YourName\Documents\MyApp
ALLOW_TERMINAL=false
TERMINAL_TIMEOUT_MS=30000
TERMINAL_MAX_OUTPUT_CHARS=20000
```

Use a real folder path on your computer. Do not use the SuperTools MCP repository path unless that is the project you intend to manage.

## 3. Build and test

Run these commands from the SuperTools MCP repository folder:

```powershell
npm test
npm run build
```

Start the server manually to check that it launches:

```powershell
npm start
```

The MCP server uses standard input/output for its client connection. When testing manually, it may appear to wait silently; that is normal. Press Ctrl+C to stop it.

## 4. Connect it to Claude Desktop

Open docs/CLAUDE-DESKTOP.md and follow its configuration example. Replace the example paths with the actual absolute paths on your computer, save the configuration, and restart Claude Desktop.

After connecting, ask the MCP client to list the files in your selected project. The available tools include:

- `list_project_files`
- `read_project_file`
- `write_project_file`
- `run_project_command`
- `browser_start_session`, `browser_close_session`
- `browser_open_page`, `browser_new_tab`, `browser_list_tabs`, `browser_close_tab`
- `browser_navigate`, `browser_navigate_history`
- `browser_click`, `browser_fill`, `browser_type`, `browser_press_key`, `browser_select_option`, `browser_set_checked`, `browser_hover`, `browser_scroll`, `browser_wait_for`
- `browser_get_page_content`, `browser_get_element_info`, `browser_screenshot`
- `browser_get_console_logs`, `browser_get_network_events`, `browser_clear_diagnostics`
- `browser_evaluate`, `browser_devtools_command`, `browser_get_accessibility_tree`
- `browser_set_viewport`, `browser_set_dialog_action`, `browser_upload_file`, `browser_download_file`, `browser_save_pdf`
- `github_get_repository` and `github_read_file` (only when GITHUB_TOKEN is configured)

## 5. Use PowerShell or WSL2

Terminal access is **off by default**. First test file tools and browser tools without enabling it.

When you are ready to enable terminal commands, change this in your local .env:

```env
ALLOW_TERMINAL=true
```

Restart the MCP client/server. For each command, the client must pass explicit approval (`approved=true`). Choose:

- `powershell` to run a Windows PowerShell command, such as `npm test`.
- `wsl` to run a Bash command through WSL2, such as `pwd && ls`.

The command's working directory must be inside PROJECT_ROOT. Review every command before approving it.

## 6. Optional GitHub read access

Create a fine-grained GitHub token limited to only the repositories and read permissions needed. Put it in your local .env file:

```env
GITHUB_TOKEN=your_token_here
```

Restart the MCP server after changing .env. Never commit .env or paste your token into source code. Without a token, the GitHub tools are not registered.

## Important security limitations

PROJECT_ROOT confines the server's **file tools**, but it does not sandbox PowerShell or WSL2. Terminal commands run with the permissions of your Windows or WSL user and may access other files, use the network, or start other processes. The command denylist is not a complete security boundary.

For sensitive work, use a dedicated low-privilege OS account or a properly isolated container/VM with restricted mounts and network access. Keep terminal disabled until you understand this limitation. See docs/SECURITY.md.

## Current integration scope

This repository includes a Claude Desktop setup example. Other MCP clients must support connecting to a local stdio MCP server and have their own local-server configuration mechanism. Do not assume the server is automatically connected to ChatGPT just because the code is on GitHub.

## Browser automation capabilities

Start with `browser_start_session`, then use the returned `sessionId` and `pageId` with the browser tools. The browser runs headlessly in Chromium. Sessions are isolated and in-memory; cookies and browser storage are not persisted after the session closes.

The browser toolset supports page and tab management, navigation history, CSS/text locator actions, form filling, keyboard input, scrolling, selector waits, visible text and HTML extraction, element inspection, PNG/JPEG screenshots returned as image content, console and page-error logs, request/response/failure diagnostics, a restricted Chrome DevTools Protocol command allowlist, accessibility-tree inspection, JavaScript expression evaluation, file upload from inside PROJECT_ROOT, file download to PROJECT_ROOT, and PDF export.

Important limits:
- Browser sessions are not logged into your personal Chrome profile and do not reuse its cookies.
- DevTools Protocol commands are intentionally allowlisted; this is not unrestricted access to every Chromium internal command.
- JavaScript evaluation can execute code in the page and should only be used on websites you trust.
- Downloads and uploads are restricted to PROJECT_ROOT; uploads are limited to 25 MB and downloads to 100 MB.
- The network guard blocks many private/local destinations, but is defense in depth, not a replacement for OS-level network isolation.

This is an initial development version. Build and test it locally before relying on it for important work.
