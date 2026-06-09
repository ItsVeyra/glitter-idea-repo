import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  SUPPORT_ALIPAY_ICON_DATA_URL,
  SUPPORT_ALIPAY_QR_DATA_URL,
  SUPPORT_PAYPAL_ICON_DATA_URL,
  SUPPORT_PAYPAL_URL
} from "../../src/settings/support-assets";

function decodeDataUrl(dataUrl: string): { mimeType: string; payload: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error(`Invalid data URL: ${dataUrl.slice(0, 32)}`);
  }

  return {
    mimeType: match[1] ?? "",
    payload: match[2] ?? ""
  };
}

describe("support assets", () => {
  it("uses the production PayPal URL", () => {
    expect(SUPPORT_PAYPAL_URL).toBe("https://paypal.me/ItsVeyraYu");
  });

  it("embeds the PayPal and Alipay icons as svg data urls", () => {
    for (const dataUrl of [SUPPORT_PAYPAL_ICON_DATA_URL, SUPPORT_ALIPAY_ICON_DATA_URL]) {
      const decoded = decodeDataUrl(dataUrl);
      const svg = Buffer.from(decoded.payload, "base64").toString("utf8");

      expect(decoded.mimeType).toBe("image/svg+xml");
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.includes("</svg>")).toBe(true);
    }
  });

  it("embeds the Alipay QR with a matching jpeg mime type", () => {
    const decoded = decodeDataUrl(SUPPORT_ALIPAY_QR_DATA_URL);
    const qrBytes = Buffer.from(decoded.payload, "base64");

    expect(decoded.mimeType).toBe("image/jpeg");
    expect(qrBytes.byteLength).toBeGreaterThan(0);
    expect(Array.from(qrBytes.subarray(0, 3))).toEqual([255, 216, 255]);
  });
});
