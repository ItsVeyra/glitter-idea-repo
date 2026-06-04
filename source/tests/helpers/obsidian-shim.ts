export class Component {
  public children: Component[] = [];

  public isUnloaded = false;

  addChild<T extends Component>(child: T): T {
    this.children.push(child);
    return child;
  }

  removeChild<T extends Component>(child: T): T {
    this.children = this.children.filter((entry) => entry !== child);
    return child;
  }

  unload(): void {
    if (this.isUnloaded) {
      return;
    }

    this.isUnloaded = true;
    const children = [...this.children];
    this.children = [];
    children.forEach((child) => child.unload());
  }
}

export class WorkspaceLeaf {}

export class ItemView extends Component {
  public contentEl: { empty: () => void };

  constructor(_leaf: WorkspaceLeaf) {
    super();
    this.contentEl = {
      empty: () => undefined
    };
  }
}

export class Modal {
  public contentEl: { empty: () => void };

  constructor(_app?: unknown) {
    this.contentEl = {
      empty: () => undefined
    };
  }

  open(): void {
    const withOnOpen = this as Modal & { onOpen?: () => void };
    withOnOpen.onOpen?.();
  }

  close(): void {
    const withOnClose = this as Modal & { onClose?: () => void };
    withOnClose.onClose?.();
  }
}
export class Plugin {}
export class Notice {
  constructor(_message: string) {}
}

export class App {}
export class PluginSettingTab {}
export class Setting {}
export class MarkdownView {}

export const MarkdownRenderer = {
  async render(
    _app: unknown,
    _markdown: string,
    _el: unknown,
    _sourcePath: string,
    _component: unknown
  ): Promise<void> {
    return undefined;
  }
};

export async function requestUrl(_url: string): Promise<{ status: number; text: string }> {
  throw new Error("requestUrl is not implemented in the obsidian test shim");
}
