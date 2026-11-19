import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("home page (server render)", () => {
  const html = renderToString(<Home />);

  it("renders the starter reminders on the App shell with plain words", () => {
    expect(html).toContain('class="as"');
    expect(html).toContain("Ship portfolio batch");
    expect(html).toContain("Saved on this device · no notifications");
    expect(html).toContain("does not send notifications");
    expect(html).not.toMatch(/tideboard|NO ALERTS/i);
  });

  it("does not print anything that depends on the viewer's clock", () => {
    expect(html).not.toContain('data-tone="red">Overdue');
    expect(html).toMatch(/type="datetime-local" value=""/);
    // The sample reminders are dated from the viewer's clock, so no time is printed before hydration.
    expect(html).not.toContain("<time");
  });
});
