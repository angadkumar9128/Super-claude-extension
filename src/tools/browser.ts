import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { z } from "zod";
import { assertPublicHttpUrl } from "../security/network.js";
import { resolveProjectPath } from "../utils/paths.js";

type BrowserEvent = { time: string; kind: string; [key: string]: unknown };
type BrowserSession = {
  id: string;
  context: BrowserContext;
  pages: Map<string, Page>;
  pageIds: WeakMap<Page, string>;
  events: BrowserEvent[];
  cdp: Map<string, any>;
  dialogAction: "accept" | "dismiss";
};
let browser: Browser | undefined;
const sessions = new Map<string, BrowserSession>();
let defaultSessionId: string | undefined;
const maxEvents = 500;
const maxText = 30000;
const devtoolsMethods = new Set([
  "Runtime.evaluate",
  "DOM.getDocument",
  "DOM.querySelector",
  "DOM.getOuterHTML",
  "Page.getLayoutMetrics",
  "Page.captureScreenshot",
  "Network.enable",
  "Network.disable",
  "Performance.enable",
  "Performance.getMetrics",
  "Accessibility.getFullAXTree"
]);

function result(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function record(session: BrowserSession, kind: string, data: Record<string, unknown> = {}) {
  session.events.push({ time: new Date().toISOString(), kind, ...data });
  if (session.events.length > maxEvents) session.events.splice(0, session.events.length - maxEvents);
}
function safeUrl(input: string): string {
  try {
    const u = new URL(input);
    u.username = "";
    u.password = "";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return input.slice(0, 500);
  }
}
function attachPage(session: BrowserSession, page: Page): string {
  const existing = session.pageIds.get(page);
  if (existing) return existing;
  const id = randomUUID();
  session.pages.set(id, page);
  session.pageIds.set(page, id);
  page.on("console", (message) => record(session, "console", {
    pageId: id, level: message.type(), text: message.text().slice(0, 4000), location: message.location()
  }));
  page.on("pageerror", (error) => record(session, "pageerror", { pageId: id, message: error.message.slice(0, 4000), stack: error.stack?.slice(0, 8000) }));
  page.on("request", (request) => record(session, "request", {
    pageId: id, method: request.method(), url: safeUrl(request.url()), resourceType: request.resourceType()
  }));
  page.on("response", (response) => record(session, "response", {
    pageId: id, status: response.status(), ok: response.ok(), url: safeUrl(response.url())
  }));
  page.on("requestfailed", (request) => record(session, "requestfailed", {
    pageId: id, method: request.method(), url: safeUrl(request.url()), error: request.failure()?.errorText
  }));
  page.on("download", (download) => record(session, "download", {
    pageId: id, suggestedFilename: download.suggestedFilename()
  }));
  page.on("crash", () => record(session, "crash", { pageId: id }));
  page.on("dialog", async (dialog) => {
    record(session, "dialog", { pageId: id, dialogType: dialog.type(), message: dialog.message().slice(0, 2000) });
    try {
      if (session.dialogAction === "accept") await dialog.accept();
      else await dialog.dismiss();
    } catch { /* Page may have closed while the dialog was being handled. */ }
  });
  page.on("domcontentloaded", () => record(session, "domcontentloaded", { pageId: id, url: safeUrl(page.url()) }));
  page.on("load", () => record(session, "load", { pageId: id, url: safeUrl(page.url()) }));
  return id;
}
async function createSession(width = 1365, height = 900): Promise<{ session: BrowserSession; pageId: string }> {
  browser ??= await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width, height },
    acceptDownloads: true,
    serviceWorkers: "block"
  });
  const session: BrowserSession = {
    id: randomUUID(), context, pages: new Map(), pageIds: new WeakMap(), events: [], cdp: new Map(), dialogAction: "dismiss"
  };
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    try {
      const protocol = new URL(requestUrl).protocol;
      if (protocol === "http:" || protocol === "https:") await assertPublicHttpUrl(requestUrl);
      else if (!["data:", "blob:", "about:"].includes(protocol)) throw new Error("Unsupported browser request protocol.");
      await route.continue();
    } catch {
      record(session, "blockedrequest", { url: safeUrl(requestUrl) });
      await route.abort("blockedbyclient").catch(() => undefined);
    }
  });
  context.routeWebSocket("**/*", async (socket) => {
    try {
      const wsUrl = socket.url();
      const checkedUrl = wsUrl.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
      await assertPublicHttpUrl(checkedUrl);
      socket.connectToServer();
    } catch {
      record(session, "blockedwebsocket", { url: safeUrl(socket.url()) });
    }
  });
  context.on("page", (page) => attachPage(session, page));
  sessions.set(session.id, session);
  defaultSessionId = session.id;
  const page = await context.newPage();
  return { session, pageId: attachPage(session, page) };
}
async function getSession(sessionId?: string): Promise<BrowserSession> {
  const id = sessionId || defaultSessionId;
  if (id) {
    const found = sessions.get(id);
    if (found) return found;
    throw new Error("Unknown browser session. Start a new browser session first.");
  }
  return (await createSession()).session;
}
async function getPage(sessionId?: string, pageId?: string): Promise<{ session: BrowserSession; page: Page; pageId: string }> {
  const session = await getSession(sessionId);
  if (pageId) {
    const page = session.pages.get(pageId);
    if (!page) throw new Error("Unknown pageId for this browser session.");
    return { session, page, pageId };
  }
  const last = Array.from(session.pages.entries()).at(-1);
  if (!last) throw new Error("No open browser tab. Open a page first.");
  return { session, page: last[1], pageId: last[0] };
}
async function cdpFor(session: BrowserSession, pageId: string, page: Page): Promise<any> {
  let cdp = session.cdp.get(pageId);
  if (!cdp) {
    cdp = await session.context.newCDPSession(page);
    session.cdp.set(pageId, cdp);
  }
  return cdp;
}
function jsonText(value: unknown, limit = maxText): string {
  let serialized: string;
  try { serialized = JSON.stringify(value, null, 2); }
  catch { serialized = String(value); }
  if (serialized === undefined) serialized = String(value);
  return serialized.length > limit ? serialized.slice(0, limit) + "\n[Output truncated]" : serialized;
}
function register(server: any, name: string, description: string, schema: Record<string, unknown>, handler: (args: any) => Promise<any>) {
  server.tool(name, description, schema, handler);
}

export function registerBrowserTools(server: any, projectRoot: string): void {
  register(server, "browser_start_session", "Start an isolated headless Chromium browser session and return its sessionId and initial blank pageId.", {
    viewportWidth: z.number().int().min(320).max(3840).default(1365),
    viewportHeight: z.number().int().min(240).max(2160).default(900)
  }, async ({ viewportWidth, viewportHeight }) => {
    const { session, pageId } = await createSession(viewportWidth, viewportHeight);
    return result("Browser session started.\nsessionId: " + session.id + "\npageId: " + pageId + "\nHeadless Chromium; downloads enabled; private-network request checks enabled.");
  });

  register(server, "browser_open_page", "Open a URL in a new Chromium tab. Only public HTTP and HTTPS destinations are allowed.", {
    url: z.string().url(), sessionId: z.string().optional()
  }, async ({ url, sessionId }) => {
    await assertPublicHttpUrl(url);
    const session = await getSession(sessionId);
    const page = await session.context.newPage();
    const pageId = attachPage(session, page);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    return result("Opened page.\n" + jsonText({ sessionId: session.id, pageId, title: await page.title(), url: page.url() }));
  });

  register(server, "browser_list_tabs", "List tabs and their current titles and URLs.", {
    sessionId: z.string().optional()
  }, async ({ sessionId }) => {
    const session = await getSession(sessionId);
    const tabs = await Promise.all(Array.from(session.pages.entries()).map(async ([pageId, page]) => ({
      pageId, title: await page.title().catch(() => ""), url: page.url(), closed: page.isClosed()
    })));
    return result(jsonText({ sessionId: session.id, tabs }));
  });

  register(server, "browser_navigate", "Navigate the selected tab to a public HTTP or HTTPS URL.", {
    url: z.string().url(), sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ url, sessionId, pageId }) => {
    await assertPublicHttpUrl(url);
    const target = await getPage(sessionId, pageId);
    await target.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    return result(jsonText({ pageId: target.pageId, title: await target.page.title(), url: target.page.url() }));
  });

  register(server, "browser_new_tab", "Create a blank tab in the selected browser session.", {
    sessionId: z.string().optional()
  }, async ({ sessionId }) => {
    const session = await getSession(sessionId);
    const page = await session.context.newPage();
    return result("Created tab pageId: " + attachPage(session, page) + "\nsessionId: " + session.id);
  });

  register(server, "browser_close_tab", "Close one tab. The browser session remains open.", {
    sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    await target.page.close();
    target.session.pages.delete(target.pageId);
    const cdp = target.session.cdp.get(target.pageId);
    if (cdp) await cdp.detach().catch(() => undefined);
    target.session.cdp.delete(target.pageId);
    return result("Closed tab " + target.pageId + ".");
  });

  register(server, "browser_close_session", "Close a browser session and all its tabs.", {
    sessionId: z.string().optional()
  }, async ({ sessionId }) => {
    const session = await getSession(sessionId);
    await session.context.close();
    sessions.delete(session.id);
    if (defaultSessionId === session.id) defaultSessionId = sessions.keys().next().value;
    return result("Closed browser session " + session.id + ".");
  });

  register(server, "browser_navigate_history", "Go back, forward, or reload the selected tab.", {
    action: z.enum(["back", "forward", "reload"]),
    sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ action, sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    if (action === "back") await target.page.goBack({ waitUntil: "domcontentloaded" });
    else if (action === "forward") await target.page.goForward({ waitUntil: "domcontentloaded" });
    else await target.page.reload({ waitUntil: "domcontentloaded" });
    return result(jsonText({ action, title: await target.page.title(), url: target.page.url() }));
  });

  register(server, "browser_click", "Click an element matched by a CSS selector or Playwright text selector.", {
    selector: z.string().min(1).max(2000), sessionId: z.string().optional(), pageId: z.string().optional(),
    timeoutMs: z.number().int().min(100).max(30000).default(10000), button: z.enum(["left", "right", "middle"]).default("left"),
    clickCount: z.number().int().min(1).max(3).default(1)
  }, async ({ selector, sessionId, pageId, timeoutMs, button, clickCount }) => {
    const target = await getPage(sessionId, pageId);
    await target.page.locator(selector).first().click({ timeout: timeoutMs, button, clickCount });
    return result("Clicked " + selector + " on page " + target.pageId + ".");
  });

  register(server, "browser_fill", "Fill an input, textarea, or contenteditable element.", {
    selector: z.string().min(1).max(2000), value: z.string().max(20000),
    sessionId: z.string().optional(), pageId: z.string().optional(), timeoutMs: z.number().int().min(100).max(30000).default(10000)
  }, async ({ selector, value, sessionId, pageId, timeoutMs }) => {
    const target = await getPage(sessionId, pageId);
    await target.page.locator(selector).first().fill(value, { timeout: timeoutMs });
    return result("Filled " + selector + " on page " + target.pageId + ".");
  });

  register(server, "browser_type", "Type text into the focused element, optionally with a delay between characters.", {
    text: z.string().max(20000), selector: z.string().optional(),
    delayMs: z.number().int().min(0).max(500).default(0), sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ text, selector, delayMs, sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    if (selector) await target.page.locator(selector).first().click();
    await target.page.keyboard.type(text, { delay: delayMs });
    return result("Typed " + text.length + " characters on page " + target.pageId + ".");
  });

  register(server, "browser_press_key", "Press a keyboard key or key combination on the selected tab.", {
    key: z.string().min(1).max(100), selector: z.string().optional(),
    sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ key, selector, sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    if (selector) await target.page.locator(selector).first().press(key);
    else await target.page.keyboard.press(key);
    return result("Pressed " + key + " on page " + target.pageId + ".");
  });

  register(server, "browser_select_option", "Select one or more options in a select element.", {
    selector: z.string().min(1), values: z.array(z.string()).min(1).max(50),
    sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ selector, values, sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    const selected = await target.page.locator(selector).first().selectOption(values);
    return result(jsonText({ selector, selected }));
  });

  register(server, "browser_set_checked", "Check or uncheck a checkbox or radio element.", {
    selector: z.string().min(1), checked: z.boolean(),
    sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ selector, checked, sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    await target.page.locator(selector).first().setChecked(checked);
    return result("Set " + selector + " checked=" + checked + ".");
  });

  register(server, "browser_hover", "Move the mouse over an element.", {
    selector: z.string().min(1), sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ selector, sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    await target.page.locator(selector).first().hover();
    return result("Hovered over " + selector + ".");
  });

  register(server, "browser_scroll", "Scroll the page or a selected element.", {
    direction: z.enum(["up", "down", "left", "right"]), pixels: z.number().int().min(1).max(5000).default(700),
    selector: z.string().optional(), sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ direction, pixels, selector, sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    if (selector) {
      const locator = target.page.locator(selector).first();
      await locator.scrollIntoViewIfNeeded();
      await locator.evaluate((element, args) => (element as HTMLElement).scrollBy(args.x, args.y), {
        x: direction === "left" ? -pixels : direction === "right" ? pixels : 0,
        y: direction === "up" ? -pixels : direction === "down" ? pixels : 0
      });
    } else {
      await target.page.evaluate((args) => window.scrollBy(args.x, args.y), {
        x: direction === "left" ? -pixels : direction === "right" ? pixels : 0,
        y: direction === "up" ? -pixels : direction === "down" ? pixels : 0
      });
    }
    return result("Scrolled " + direction + " by " + pixels + " pixels.");
  });

  register(server, "browser_wait_for", "Wait for a selector to reach attached, detached, visible, or hidden state.", {
    selector: z.string().min(1), state: z.enum(["attached", "detached", "visible", "hidden"]).default("visible"),
    timeoutMs: z.number().int().min(100).max(60000).default(10000),
    sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ selector, state, timeoutMs, sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    await target.page.locator(selector).first().waitFor({ state, timeout: timeoutMs });
    return result("Selector " + selector + " reached state " + state + ".");
  });

  register(server, "browser_get_page_content", "Read page title, URL, visible text, and optionally HTML from the selected tab.", {
    includeHtml: z.boolean().default(false), selector: z.string().default("body"),
    sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ includeHtml, selector, sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    const locator = target.page.locator(selector).first();
    const text = (await locator.innerText({ timeout: 10000 }).catch(() => "")).slice(0, maxText);
    const html = includeHtml ? (await locator.innerHTML({ timeout: 10000 }).catch(() => "")).slice(0, maxText) : undefined;
    return result(jsonText({ pageId: target.pageId, title: await target.page.title(), url: target.page.url(), text, html }));
  });

  register(server, "browser_get_element_info", "Inspect matching elements: count, visible text, tag name, selected attributes, and input value.", {
    selector: z.string().min(1), attributes: z.array(z.string().max(100)).max(30).default(["id", "class", "href", "aria-label", "type", "name", "placeholder"]),
    sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ selector, attributes, sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    const locator = target.page.locator(selector);
    const count = await locator.count();
    const elements = [];
    for (let i = 0; i < Math.min(count, 30); i++) {
      const item = locator.nth(i);
      elements.push(await item.evaluate((element, names) => {
        const attrs: Record<string, string | null> = {};
        for (const name of names) attrs[name] = element.getAttribute(name);
        const input = element as HTMLInputElement;
        return {
          tagName: element.tagName.toLowerCase(),
          text: (element.textContent || "").trim().slice(0, 2000),
          value: "value" in input ? input.value : undefined,
          attributes: attrs
        };
      }, attributes));
    }
    return result(jsonText({ selector, count, elements }));
  });

  register(server, "browser_screenshot", "Capture a screenshot of the selected tab and return it as an image. Supports full-page screenshots.", {
    fullPage: z.boolean().default(false), format: z.enum(["png", "jpeg"]).default("png"),
    quality: z.number().int().min(30).max(95).default(80),
    sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ fullPage, format, quality, sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    const bytes = await target.page.screenshot({ fullPage, type: format, quality: format === "jpeg" ? quality : undefined, animations: "disabled" });
    if (bytes.byteLength > 10_000_000) throw new Error("Screenshot exceeds the 10 MB response limit. Use a viewport screenshot or JPEG.");
    return {
      content: [
        { type: "text", text: "Screenshot captured for page " + target.pageId + " (" + format + ", " + bytes.byteLength + " bytes)." },
        { type: "image", data: bytes.toString("base64"), mimeType: format === "jpeg" ? "image/jpeg" : "image/png" }
      ]
    };
  });

  register(server, "browser_get_console_logs", "Retrieve captured browser console messages, uncaught page errors, dialogs, and browser lifecycle events.", {
    sessionId: z.string().optional(), pageId: z.string().optional(), limit: z.number().int().min(1).max(500).default(100),
    levels: z.array(z.enum(["log", "debug", "info", "warning", "error", "pageerror", "dialog", "crash"])).optional()
  }, async ({ sessionId, pageId, limit, levels }) => {
    const session = await getSession(sessionId);
    let events = session.events.filter((event) => ["console", "pageerror", "dialog", "crash"].includes(event.kind));
    if (pageId) events = events.filter((event) => event.pageId === pageId);
    if (levels) events = events.filter((event) => levels.includes(event.kind === "console" ? String(event.level) as any : event.kind as any));
    return result(jsonText(events.slice(-limit)));
  });

  register(server, "browser_get_network_events", "Retrieve captured requests, responses, failed requests, and blocked destinations. Query strings are omitted from logged URLs.", {
    sessionId: z.string().optional(), pageId: z.string().optional(), limit: z.number().int().min(1).max(500).default(100),
    kinds: z.array(z.enum(["request", "response", "requestfailed", "blockedrequest", "blockedwebsocket"])).optional()
  }, async ({ sessionId, pageId, limit, kinds }) => {
    const session = await getSession(sessionId);
    let events = session.events.filter((event) => ["request", "response", "requestfailed", "blockedrequest", "blockedwebsocket"].includes(event.kind));
    if (pageId) events = events.filter((event) => event.pageId === pageId);
    if (kinds) events = events.filter((event) => kinds.includes(event.kind as any));
    return result(jsonText(events.slice(-limit)));
  });

  register(server, "browser_clear_diagnostics", "Clear captured console and network diagnostic events for a browser session.", {
    sessionId: z.string().optional()
  }, async ({ sessionId }) => {
    const session = await getSession(sessionId);
    session.events.length = 0;
    return result("Cleared diagnostic events for session " + session.id + ".");
  });

  register(server, "browser_evaluate", "Evaluate a JavaScript expression in the selected page. This is powerful and should only be used on pages you trust.", {
    expression: z.string().min(1).max(20000), sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ expression, sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    const value = await target.page.evaluate((source) => (0, eval)(source), expression);
    return result(jsonText({ result: value }));
  });

  register(server, "browser_devtools_command", "Send a restricted Chrome DevTools Protocol command. Allowed methods: Runtime.evaluate, DOM inspection, Page metrics/capture, Network enable/disable, Performance metrics, and accessibility tree.", {
    method: z.string().min(1).max(100), params: z.record(z.string(), z.unknown()).default({}),
    sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ method, params, sessionId, pageId }) => {
    if (!devtoolsMethods.has(method)) throw new Error("DevTools method is not in the allowed read/diagnostic list.");
    const target = await getPage(sessionId, pageId);
    const cdp = await cdpFor(target.session, target.pageId, target.page);
    const safeParams = method === "Runtime.evaluate"
      ? { ...params, returnByValue: true, awaitPromise: true }
      : params;
    const response = await cdp.send(method, safeParams);
    return result(jsonText(response, 50000));
  });

  register(server, "browser_get_accessibility_tree", "Read the Chromium accessibility tree for the selected tab using the DevTools Protocol.", {
    sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    const cdp = await cdpFor(target.session, target.pageId, target.page);
    const response = await cdp.send("Accessibility.getFullAXTree");
    return result(jsonText(response, 50000));
  });

  register(server, "browser_set_viewport", "Change the selected tab's viewport size.", {
    width: z.number().int().min(320).max(3840), height: z.number().int().min(240).max(2160),
    sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ width, height, sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    await target.page.setViewportSize({ width, height });
    return result("Viewport set to " + width + "x" + height + ".");
  });

  register(server, "browser_set_dialog_action", "Choose whether JavaScript alert, confirm, and prompt dialogs are automatically accepted or dismissed.", {
    action: z.enum(["accept", "dismiss"]), sessionId: z.string().optional()
  }, async ({ action, sessionId }) => {
    const session = await getSession(sessionId);
    session.dialogAction = action;
    return result("Future JavaScript dialogs will be automatically " + (action === "accept" ? "accepted." : "dismissed."));
  });

  register(server, "browser_upload_file", "Upload a file from inside PROJECT_ROOT into a file input. Files outside the project are not accessible.", {
    selector: z.string().min(1), filePath: z.string().min(1), sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ selector, filePath, sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    const file = await resolveProjectPath(projectRoot, filePath);
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 25_000_000) throw new Error("Upload must be a regular project file no larger than 25 MB.");
    await target.page.locator(selector).setInputFiles(file);
    return result("Uploaded project file " + filePath + " to " + selector + ".");
  });

  register(server, "browser_download_file", "Click a download link/button and save the downloaded file to a relative path inside PROJECT_ROOT.", {
    selector: z.string().min(1), saveAs: z.string().min(1), sessionId: z.string().optional(), pageId: z.string().optional(),
    timeoutMs: z.number().int().min(1000).max(60000).default(30000)
  }, async ({ selector, saveAs, sessionId, pageId, timeoutMs }) => {
    const target = await getPage(sessionId, pageId);
    const output = await resolveProjectPath(projectRoot, saveAs, true);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await resolveProjectPath(projectRoot, saveAs, true);
    const [download] = await Promise.all([
      target.page.waitForEvent("download", { timeout: timeoutMs }),
      target.page.locator(selector).click({ timeout: timeoutMs })
    ]);
    await download.saveAs(output);
    const stat = await fs.stat(output);
    if (stat.size > 100_000_000) {
      await fs.rm(output, { force: true });
      throw new Error("Download exceeded the 100 MB safety limit and was removed.");
    }
    return result(jsonText({ savedTo: saveAs, suggestedFilename: download.suggestedFilename(), bytes: stat.size }));
  });

  register(server, "browser_save_pdf", "Save the selected page as a PDF inside PROJECT_ROOT. Available in headless Chromium.", {
    saveAs: z.string().min(1), format: z.enum(["A4", "Letter", "Legal"]).default("A4"),
    printBackground: z.boolean().default(true), sessionId: z.string().optional(), pageId: z.string().optional()
  }, async ({ saveAs, format, printBackground, sessionId, pageId }) => {
    const target = await getPage(sessionId, pageId);
    const output = await resolveProjectPath(projectRoot, saveAs, true);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await resolveProjectPath(projectRoot, saveAs, true);
    await target.page.pdf({ path: output, format, printBackground });
    const stat = await fs.stat(output);
    return result(jsonText({ savedTo: saveAs, bytes: stat.size }));
  });
}
