import { chromium, type Browser } from "playwright";
import { z } from "zod";
import { assertPublicHttpUrl } from "../security/network.js";

let browser: Browser | undefined;

export function registerBrowserTools(server: any): void {
  server.tool("browser_open_page", "Open a public HTTP or HTTPS page in headless Chromium and return its title and visible text. Local/private network destinations are blocked.", {
    url: z.string().url()
  }, async ({ url }: { url: string }) => {
    const parsed = new URL(url);
    await assertPublicHttpUrl(parsed.toString());
    browser ??= await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: "block" });
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      try {
        await assertPublicHttpUrl(route.request().url());
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });
    try {
      await page.goto(parsed.toString(), { waitUntil: "domcontentloaded", timeout: 20000 });
      const title = await page.title();
      const text = (await page.locator("body").innerText({ timeout: 10000 })).slice(0, 15000);
      return { content: [{ type: "text", text: "Title: " + title + "\nURL: " + page.url() + "\n\n" + text }] };
    } finally {
      await context.close();
    }
  });
}
