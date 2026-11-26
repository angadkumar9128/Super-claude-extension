# SuperTools MCP

A project-scoped MCP server for local development workflows on Windows.

## Features in this initial version

- Project-root constrained file listing, reading, and writing.
- PowerShell and WSL2 command execution with explicit approval, timeout, output cap, and audit logging.
- Playwright browser navigation and page text extraction.
- GitHub repository metadata and file-reading tools.
- Basic tests for command policy and secret redaction.

## Requirements

- Node.js 20+
- Windows 10/11
- PowerShell; WSL2 optional
- Chromium installed for Playwright browser tools

## Setup

1. Run npm install.
2. Copy .env.example to .env.
3. Set PROJECT_ROOT to the absolute path of the folder the user explicitly chose.
4. Run npm test and npm run build.
5. For browser tools, run npx playwright install chromium.
6. Run npm start.

See docs/CLAUDE-DESKTOP.md for Claude Desktop configuration.

## Security warning

A working-directory restriction is not an operating-system sandbox. Terminal commands run as the current Windows user and can access anything that user can access. Terminal execution is disabled unless ALLOW_TERMINAL=true and each command requires approved=true, but approval and a denylist are not a complete security boundary. Use a dedicated low-privilege account or an isolated container/VM for sensitive work.

File tools reject paths outside the selected project root, including resolved symlink escapes. Keep .env out of version control and use a fine-grained GitHub token with only required permissions.

This is an initial development version, not a certified security boundary. Review docs/SECURITY.md and test in a disposable project before using it on sensitive work.
