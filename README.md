# SuperTools MCP

A project-scoped MCP server for safe local development workflows on Windows.

## Current scope

- Project-root constrained file listing, reading, and writing.
- PowerShell and WSL2 command execution with explicit approval callback, timeout, output cap, and audit logging.
- Playwright browser navigation and page text extraction.
- GitHub repository and file read operations through a narrowly scoped token.
- Unit tests for path containment and command policy.

## Important security note

A working-directory restriction is not an operating-system sandbox. Commands run as the current Windows user and can access anything that user can access. Use a dedicated low-privilege Windows account or a container for stronger isolation. Do not expose this server to untrusted networks.

## Requirements

- Node.js 20+
- Windows 10/11
- PowerShell 7 recommended
- WSL2 optional
- Docker optional (for additional isolation)

## Setup

```powershell
npm install
Copy-Item .env.example .env
# Set PROJECT_ROOT and, optionally, GitHub credentials in .env
npm test
npm start
```

Configure the MCP client to launch `node` with the absolute path to `src/index.js`. Set `PROJECT_ROOT` to the folder the user explicitly chose.

## Safety defaults

- Terminal execution is disabled unless `ALLOW_TERMINAL=true`.
- Every terminal command requires the configured approval callback to return true.
- Destructive commands are blocked by a conservative denylist.
- File operations reject paths outside the project root, including symlink escapes.
- Secrets are read from environment variables and must never be committed.

This is an initial development version, not a certified security boundary. Review the code and threat model before using it on sensitive projects.
