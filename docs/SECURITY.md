# Security model and limitations

## Project boundary
File tools canonicalize paths and reject traversal and symlink escapes outside PROJECT_ROOT. This boundary applies to the file tools only.

## Terminal is not sandboxed
PowerShell and WSL2 commands execute as the current OS user. A command can read or modify other locations, use the network, or start child processes. The server's cwd check does not restrict those capabilities. For sensitive work, use a dedicated low-privilege account and an isolated container or VM with restricted mounts and network access.

## Approval and destructive operations
Terminal is off by default and each invocation requires approved=true. A denylist blocks several destructive command patterns, but denylist filtering is not a complete security control. Review every command before approval.

## Secrets
Keep .env out of version control. Use a fine-grained GitHub token restricted to required repositories and permissions. Never paste credentials into prompts or commit them.

## Browser
Browser navigation accepts public HTTP and HTTPS destinations only. The server blocks loopback, private, link-local, reserved IP ranges, and common local hostnames. It resolves hostnames before navigation and checks browser HTTP requests, redirects, subresources, and WebSocket destinations. This is defense in depth, not a network sandbox: DNS rebinding and platform-specific routing cannot be ruled out completely. Use an OS/container network policy for strong isolation.

Browser sessions are isolated, in-memory contexts and do not load your personal Chrome profile or saved credentials. Console and network diagnostics are kept in a bounded in-memory buffer and omit URL query strings. File uploads and downloads are restricted to PROJECT_ROOT; uploads are capped at 25 MB and downloads at 100 MB. Screenshots are returned to the MCP client and are not automatically saved to disk.

The browser exposes page JavaScript evaluation and a restricted Chrome DevTools Protocol allowlist for runtime evaluation, DOM inspection, page metrics/capture, network diagnostics, performance metrics, and accessibility inspection. JavaScript evaluation can perform actions as the current page and must only be used on websites you trust. The allowlist deliberately does not expose unrestricted browser-internal DevTools commands. Treat page content and downloaded files as untrusted.

## Audit
The server writes .supertools-audit.log in the project root. The log is best-effort operational trace data, not tamper-proof evidence.
