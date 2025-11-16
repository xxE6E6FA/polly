import { describe, expect, test } from "bun:test";

// Test for the injectLiveReloadScript function from dev.ts
// We'll need to extract this function to be testable, but for now we'll test the logic

const RELOAD_ENDPOINT = "/__dev__/reload";
const LIVE_RELOAD_SCRIPT = `<script>(function() {
  function connect() {
    const es = new EventSource("${RELOAD_ENDPOINT}");
    es.onmessage = (e) => { if(e.data === "reload") location.reload(); };
    es.onerror = () => {
      es.close();
      setTimeout(connect, 1000);
    };
  }
  connect();
})();</script>`;

function injectLiveReloadScript(html: string): string {
  // Check if script is already injected to prevent duplicates
  if (html.includes(RELOAD_ENDPOINT)) {
    return html;
  }

  // Try case-insensitive replacement for </body>
  const bodyTagRegex = /<\/body>/i;
  if (bodyTagRegex.test(html)) {
    return html.replace(bodyTagRegex, `${LIVE_RELOAD_SCRIPT}</body>`);
  }

  // Try case-insensitive replacement for </html>
  const htmlTagRegex = /<\/html>/i;
  if (htmlTagRegex.test(html)) {
    return html.replace(htmlTagRegex, `${LIVE_RELOAD_SCRIPT}</html>`);
  }

  // Fallback: append to end if no closing tags found
  return html + LIVE_RELOAD_SCRIPT;
}

describe("injectLiveReloadScript", () => {
  test("injects script before closing </body> tag", () => {
    const html = "<html><body><h1>Hello</h1></body></html>";
    const result = injectLiveReloadScript(html);
    expect(result).toContain(LIVE_RELOAD_SCRIPT);
    expect(result).toContain("</body>");
    expect(result.indexOf(LIVE_RELOAD_SCRIPT)).toBeLessThan(
      result.indexOf("</body>")
    );
  });

  test("handles case-insensitive </BODY> tag", () => {
    const html = "<html><body><h1>Hello</h1></BODY></html>";
    const result = injectLiveReloadScript(html);
    expect(result).toContain(LIVE_RELOAD_SCRIPT);
    // Note: regex replace will replace with lowercase </body> even if original was </BODY>
    expect(result).toContain("</body>");
  });

  test("falls back to </html> tag if no </body> tag exists", () => {
    const html = "<html><div>Content</div></html>";
    const result = injectLiveReloadScript(html);
    expect(result).toContain(LIVE_RELOAD_SCRIPT);
    expect(result).toContain("</html>");
    expect(result.indexOf(LIVE_RELOAD_SCRIPT)).toBeLessThan(
      result.indexOf("</html>")
    );
  });

  test("handles case-insensitive </HTML> tag", () => {
    const html = "<HTML><div>Content</div></HTML>";
    const result = injectLiveReloadScript(html);
    expect(result).toContain(LIVE_RELOAD_SCRIPT);
    // Note: regex replace will replace with lowercase </html> even if original was </HTML>
    expect(result).toContain("</html>");
  });

  test("appends to end if no closing tags found", () => {
    const html = "<div>Partial HTML</div>";
    const result = injectLiveReloadScript(html);
    expect(result).toBe(html + LIVE_RELOAD_SCRIPT);
  });

  test("prevents duplicate injection when script already exists", () => {
    const html = `<html><body>${LIVE_RELOAD_SCRIPT}</body></html>`;
    const result = injectLiveReloadScript(html);
    expect(result).toBe(html);
    // Count occurrences of the reload endpoint to ensure it only appears once
    const matches = result.match(new RegExp(RELOAD_ENDPOINT, "g"));
    expect(matches?.length).toBe(1);
  });

  test("handles HTML with RELOAD_ENDPOINT in content", () => {
    const html = `<html><body><p>Check ${RELOAD_ENDPOINT}</p></body></html>`;
    const result = injectLiveReloadScript(html);
    // Should not inject because it detects the endpoint already exists
    expect(result).toBe(html);
  });

  test("handles empty HTML string", () => {
    const html = "";
    const result = injectLiveReloadScript(html);
    expect(result).toBe(LIVE_RELOAD_SCRIPT);
  });

  test("handles HTML with multiple </body> tags (malformed)", () => {
    const html = "<html><body>Content</body><body>More</body></html>";
    const result = injectLiveReloadScript(html);
    expect(result).toContain(LIVE_RELOAD_SCRIPT);
    // Should only replace the first occurrence
    const scriptIndex = result.indexOf(LIVE_RELOAD_SCRIPT);
    const firstBodyCloseIndex = result.indexOf("</body>");
    expect(scriptIndex).toBeLessThan(firstBodyCloseIndex);
  });

  test("preserves original HTML structure", () => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Test</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;
    const result = injectLiveReloadScript(html);
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain('<div id="root"></div>');
    expect(result).toContain(LIVE_RELOAD_SCRIPT);
  });

  test("works with minified HTML", () => {
    const html =
      "<html><head><title>Test</title></head><body><div>Content</div></body></html>";
    const result = injectLiveReloadScript(html);
    expect(result).toContain(LIVE_RELOAD_SCRIPT);
  });

  test("handles HTML with mixed case tags", () => {
    const html = "<HTML><BODY><div>Content</div></BoDy></HTML>";
    const result = injectLiveReloadScript(html);
    expect(result).toContain(LIVE_RELOAD_SCRIPT);
  });
});
