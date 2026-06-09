import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlipaySupportModal } from "../../src/views/alipay-support-modal";

type ElementRecord = {
  tag: string;
  text?: string;
  cls?: string;
  src?: string;
  alt?: string;
};

const elements: ElementRecord[] = [];
const emptySpy = vi.fn();

function createMockElement(tag = "div") {
  return {
    tag,
    addClass: vi.fn(),
    removeClass: vi.fn(),
    empty: emptySpy,
    createEl(childTag: string, attrs?: { text?: string; cls?: string; attr?: Record<string, string> }) {
      elements.push({
        tag: childTag,
        text: attrs?.text,
        cls: attrs?.cls,
        src: attrs?.attr?.src,
        alt: attrs?.attr?.alt
      });
      return createMockElement(childTag);
    },
    createDiv(attrs?: { cls?: string }) {
      elements.push({ tag: "div", cls: attrs?.cls });
      return createMockElement("div");
    }
  };
}

vi.mock("obsidian", () => {
  class Modal {
    contentEl = createMockElement();
    open(): void {
      (this as { onOpen?: () => void }).onOpen?.();
    }
    close(): void {
      (this as { onClose?: () => void }).onClose?.();
    }
  }

  return { Modal };
});

describe("AlipaySupportModal", () => {
  beforeEach(() => {
    elements.length = 0;
    emptySpy.mockClear();
  });

  it("renders title, qr image, and thanks copy", () => {
    const modal = new AlipaySupportModal({} as never, "data:image/png;base64,ZmFrZQ==", {
      title: "支付宝支持",
      thanks: "Glitter有你支持得以持续。",
      qrAlt: "Glitter Alipay QR"
    });

    modal.open();

    expect(elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: "h2", text: "支付宝支持" }),
        expect.objectContaining({ tag: "img", src: "data:image/png;base64,ZmFrZQ==", alt: "Glitter Alipay QR" }),
        expect.objectContaining({ tag: "p", text: "Glitter有你支持得以持续。" })
      ])
    );
  });

  it("clears modal content on close", () => {
    const modal = new AlipaySupportModal({} as never, "data:image/png;base64,ZmFrZQ==", {
      title: "支付宝支持",
      thanks: "Glitter有你支持得以持续。",
      qrAlt: "Glitter Alipay QR"
    });

    modal.close();

    expect(emptySpy).toHaveBeenCalledTimes(1);
  });
});
