import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("home page", () => {
  it("renders the starter reminders, the next mark and the no-alerts notice", () => {
    const html = renderToString(<Home />);
    expect(html).toContain("Keep the next thing");
    expect(html).toContain("Ship portfolio batch");
    expect(html).toContain("2026.08.24 / 09:00");
    expect(html).toContain("2<!-- --> open reminders");
    expect(html).toContain("NO ALERTS");
    expect(html).toContain("It does not send a notification");
  });
});
