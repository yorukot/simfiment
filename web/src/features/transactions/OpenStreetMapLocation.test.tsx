import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OpenStreetMapLocation, openStreetMapURLs } from "./OpenStreetMapLocation";

const location = {
  latitude: 25.03876,
  longitude: 121.57678,
  accuracyM: 18,
  capturedAt: "2026-08-05T05:02:00Z",
};

describe("OpenStreetMapLocation", () => {
  it("builds an OpenStreetMap embed centered on the captured coordinates", () => {
    const urls = openStreetMapURLs(location);
    const embed = new URL(urls.embed);

    expect(embed.origin).toBe("https://www.openstreetmap.org");
    expect(embed.pathname).toBe("/export/embed.html");
    expect(embed.searchParams.get("marker")).toBe("25.038760,121.576780");
    expect(embed.searchParams.get("bbox")).toBe("121.572780,25.034760,121.580780,25.042760");
    expect(urls.details).toContain("mlat=25.03876&mlon=121.57678");
  });

  it("renders a labelled lazy-loaded map and an external details link", () => {
    render(<OpenStreetMapLocation location={location} />);

    const map = screen.getByTitle("交易輸入位置的 OpenStreetMap 地圖");
    expect(map).toHaveAttribute("loading", "lazy");
    expect(map).toHaveAttribute(
      "src",
      expect.stringContaining("openstreetmap.org/export/embed.html"),
    );
    expect(screen.getByRole("link", { name: /在 OpenStreetMap 開啟/ })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: "OpenStreetMap 貢獻者" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
  });
});
