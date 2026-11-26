# Claude Desktop setup

1. Run npm install and npm run build in this repository.
2. Create a local .env file from .env.example and set PROJECT_ROOT to the absolute path of the project folder you want to manage.
3. Keep ALLOW_TERMINAL=false initially.
4. Add an MCP server entry to Claude Desktop's configuration, adjusting both paths for your machine:

{
  "mcpServers": {
    "supertools": {
      "command": "node",
      "args": ["C:\\path\\to\\Super-claude-extension\\dist\\index.js"],
      "env": {
        "PROJECT_ROOT": "C:\\path\\to\\your\\chosen\\project",
        "ALLOW_TERMINAL": "false"
      }
    }
  }
}

Restart Claude Desktop after editing the configuration. Do not put GitHub tokens in the JSON configuration; use a protected environment or secret manager.
