import { Modal, type App } from "obsidian";

export interface AlipaySupportModalText {
  title: string;
  thanks: string;
  qrAlt: string;
}

export class AlipaySupportModal extends Modal {
  constructor(
    app: App,
    private readonly qrDataUrl: string,
    private readonly text: AlipaySupportModalText
  ) {
    super(app);
  }

  override onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass?.("glitter-support-modal__content");

    this.contentEl.createEl("h2", {
      text: this.text.title,
      cls: "glitter-support-modal__title"
    });

    const qrWrapEl = this.contentEl.createDiv({
      cls: "glitter-support-modal__qr-wrap"
    });

    qrWrapEl.createEl("img", {
      cls: "glitter-support-modal__qr",
      attr: {
        src: this.qrDataUrl,
        alt: this.text.qrAlt
      }
    });

    this.contentEl.createEl("p", {
      text: this.text.thanks,
      cls: "glitter-support-modal__thanks"
    });
  }

  override onClose(): void {
    this.contentEl.removeClass?.("glitter-support-modal__content");
    this.contentEl.empty();
  }
}
