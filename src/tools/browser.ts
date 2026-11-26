import { chromium, type Browser } from "playwright";
import { z } from "zod";

let browser: Browser | undefined;

export function registerBrowserTools(server: any): void {
  server.tool("browser_open_page", "Open an HTTP or HTTPS page in headless Chromium and return its title and visible text.", {
    url: z.string().url()
  }, async ({ url }: { url: string }) => {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only HTTP and HTTPS URLs are allowed.");
    browser ??= await chromium.launch({ headless: true });
    const page = await browser.newPage({ acceptDownloads: false });
    try {
      await page.goto(parsed.toString(), { waitUntil: "domcontentloaded", timeout: 20000 });
      const title = await page.title();
      const text = (await page.locator("body").innerText({ timeout: 10000 })).slice(0, 15000);
      return { content: [{ type: "text", text: "Title: " + title + "\nURL: " + page.url() + "\n\n" + text }] };
    } finally { await page.close(); }
  });
}