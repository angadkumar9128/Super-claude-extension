import { Octokit } from "@octokit/rest";
import { z } from "zod";

export function registerGitHubTools(server: any, token?: string): void {
  if (!token) return;
  const octokit = new Octokit({ auth: token });
  server.tool("github_get_repository", "Get metadata for a GitHub repository accessible to the configured token.", {
    owner: z.string(), repo: z.string()
  }, async ({ owner, repo }: { owner: string; repo: string }) => {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    return { content: [{ type: "text", text: JSON.stringify({
      full_name: data.full_name, private: data.private, default_branch: data.default_branch,
      html_url: data.html_url, description: data.description
    }, null, 2) }] };
  });
  server.tool("github_read_file", "Read a text file from a GitHub repository and branch.", {
    owner: z.string(), repo: z.string(), path: z.string(), ref: z.string().optional()
  }, async ({ owner, repo, path, ref }: { owner: string; repo: string; path: string; ref?: string }) => {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ...(ref ? { ref } : {}) });
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) throw new Error("The requested path is not a regular file.");
    const content = Buffer.from(data.content, data.encoding as BufferEncoding).toString("utf8");
    return { content: [{ type: "text", text: content.slice(0, 100000) }] };
  });
}