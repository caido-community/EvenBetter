import { type FrontendSDK } from "@/types";
import { createFeature } from "@/features/manager";

import "./quick-decode.css";

import { onLocationChange } from "@/dom";

interface CodeMirrorEditor {
  state: {
    readOnly: boolean;
    doc: {
      lineAt: (pos: number) => {
        number: number;
        from: number;
        text: string;
      };
    };
    selection: {
      main: {
        from: number;
        to: number;
        head: number;
      };
    };
    sliceDoc: (from: number, to: number) => string;
  };
  contentDOM: HTMLElement;
  dispatch: (changes: any) => void;
}

interface Selection {
  from: number;
  to: number;
  text: string;
}

function unicodeEncode(str: string): string {
  return str
    .split("")
    .map((char) => {
      const unicode = char.charCodeAt(0).toString(16).padStart(4, "0");
      return `\\u${unicode}`;
    })
    .join("");
}

interface HistoryEntry {
  content: string;
  selectionStart: number;
  selectionEnd: number;
}

class QuickDecode {
  private HTMLElement!: HTMLDivElement;
  private quickDecode!: HTMLDivElement;
  private textArea!: HTMLTextAreaElement;
  private encodeMethodSelect!: HTMLSelectElement;
  private encodeMethod: string;
  private activeEditor: CodeMirrorEditor | undefined = undefined;
  private selectionInterval: Timeout | undefined;
  private copyIconElement: HTMLElement | undefined;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private isUpdatingFromHistory: boolean = false;
  private lastSavedContent: string = "";

  constructor() {
    this.initializeHTMLElement();
    this.initializeResizer();
    this.initializeSelectedTextDiv();
    this.initializeTextArea();
    this.initializeEncodingMethodSelect();
    this.initializeCopyIcon();

    this.encodeMethod = "none";
    this.startMonitoringSelection();
  }

  private initializeHTMLElement(): void {
    this.HTMLElement = document.createElement("div");
    this.HTMLElement.id = "plugin--evenbetter";

    this.quickDecode = document.createElement("div");
    this.quickDecode.classList.add("evenbetter__qd-body");
    this.quickDecode.style.display = "none";

    this.HTMLElement.appendChild(this.quickDecode);
  }

  private initializeResizer(): void {
    const resizer = document.createElement("div");
    resizer.id = "evenbetter__qd-resizer";

    let isResizing = false;
    let startY: number;

    const resize = (e: MouseEvent) => {
      if (!isResizing) return;
      const diffY = startY - e.clientY;
      const newHeight = Math.max(10, this.quickDecode.offsetHeight + diffY);
      this.quickDecode.style.height = `${newHeight}px`;
      startY = e.clientY;
    };

    const stopResize = () => {
      isResizing = false;
      document.removeEventListener("mousemove", resize);
      document.removeEventListener("mouseup", stopResize);
    };

    resizer.addEventListener("mousedown", (e: MouseEvent) => {
      isResizing = true;
      startY = e.clientY;

      document.addEventListener("mousemove", resize);
      document.addEventListener("mouseup", stopResize);
    });

    this.quickDecode.appendChild(resizer);
  }

  private initializeSelectedTextDiv(): void {
    const selectedTextDiv = document.createElement("div");
    selectedTextDiv.classList.add("evenbetter__qd-selected-text");

    const selectedTextTopDiv = document.createElement("div");
    selectedTextTopDiv.classList.add("evenbetter__qd-selected-text-top");

    selectedTextDiv.appendChild(selectedTextTopDiv);
    this.quickDecode.appendChild(selectedTextDiv);
  }

  private initializeTextArea(): void {
    this.textArea = document.createElement("textarea");
    this.textArea.classList.add("evenbetter__qd-selected-text-box");
    this.textArea.setAttribute("autocomplete", "off");
    this.textArea.setAttribute("autocorrect", "off");
    this.textArea.setAttribute("autocapitalize", "off");
    this.textArea.setAttribute("spellcheck", "false");

    this.textArea.addEventListener("input", this.handleInput.bind(this));
    this.textArea.addEventListener("keydown", this.handleKeyDown.bind(this));

    const selectedTextDiv = this.quickDecode.querySelector(
      ".evenbetter__qd-selected-text",
    );
    if (selectedTextDiv) {
      selectedTextDiv.appendChild(this.textArea);
    }
  }

  private initializeEncodingMethodSelect(): void {
    this.encodeMethodSelect = document.createElement("select");
    this.encodeMethodSelect.classList.add(
      "evenbetter__qd-selected-text-top-select",
    );

    const options = [
      { value: "none", label: "None" },
      { value: "base64", label: "Base64" },
      { value: "unicode", label: "Unicode" },
      { value: "url", label: "URL" },
      { value: "url+base64", label: "URL + Base64" },
      { value: "base64+url", label: "Base64 + URL" },
    ];

    options.forEach(({ value, label }) => {
      const optionElement = document.createElement("option");
      optionElement.value = value;
      optionElement.textContent = label;
      this.encodeMethodSelect.appendChild(optionElement);
    });

    this.encodeMethodSelect.addEventListener("change", (e) => {
      const target = e.target as HTMLSelectElement;
      this.encodeMethod = target.value;
      this.handleInput();
    });

    const selectedTextTopDiv = this.quickDecode.querySelector(
      ".evenbetter__qd-selected-text-top",
    );
    if (selectedTextTopDiv) {
      selectedTextTopDiv.appendChild(this.encodeMethodSelect);
    }
  }

  private initializeCopyIcon(): void {
    this.copyIconElement = document.createElement("i");
    this.copyIconElement.classList.add("c-icon", "fas", "fa-copy");
    this.copyIconElement.addEventListener(
      "click",
      this.copyToClipboard.bind(this),
    );

    const selectedTextTopDiv = this.quickDecode.querySelector(
      ".evenbetter__qd-selected-text-top",
    );
    if (selectedTextTopDiv) {
      selectedTextTopDiv.appendChild(this.copyIconElement);
    }
  }

  private copyToClipboard(): void {
    const decodedText = this.textArea.value;
    if (decodedText) {
      navigator.clipboard.writeText(decodedText);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const isUndo =
      (isMac ? e.metaKey : e.ctrlKey) && e.key === "z" && !e.shiftKey;
    const isRedo =
      (isMac ? e.metaKey : e.ctrlKey) &&
      (e.key === "y" || (e.key === "z" && e.shiftKey));

    if (isUndo) {
      e.preventDefault();
      this.undo();
    } else if (isRedo) {
      e.preventDefault();
      this.redo();
    }
  }

  private saveHistory(): void {
    if (this.isUpdatingFromHistory) return;

    const currentContent = this.textArea.value;
    if (currentContent === this.lastSavedContent) return;

    const historyEntry: HistoryEntry = {
      content: this.lastSavedContent,
      selectionStart: this.textArea.selectionStart,
      selectionEnd: this.textArea.selectionEnd,
    };

    this.undoStack.push(historyEntry);
    if (this.undoStack.length > 100) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.lastSavedContent = currentContent;
  }

  private undo(): void {
    if (this.undoStack.length === 0) return;

    const currentEntry: HistoryEntry = {
      content: this.textArea.value,
      selectionStart: this.textArea.selectionStart,
      selectionEnd: this.textArea.selectionEnd,
    };
    this.redoStack.push(currentEntry);

    const previousEntry = this.undoStack.pop();
    if (previousEntry) {
      this.isUpdatingFromHistory = true;
      this.textArea.value = previousEntry.content;
      this.textArea.setSelectionRange(
        previousEntry.selectionStart,
        previousEntry.selectionEnd,
      );
      this.lastSavedContent = previousEntry.content;
      this.isUpdatingFromHistory = false;
      this.handleInput();
    }
  }

  private redo(): void {
    if (this.redoStack.length === 0) return;

    const currentEntry: HistoryEntry = {
      content: this.textArea.value,
      selectionStart: this.textArea.selectionStart,
      selectionEnd: this.textArea.selectionEnd,
    };
    this.undoStack.push(currentEntry);

    const nextEntry = this.redoStack.pop();
    if (nextEntry) {
      this.isUpdatingFromHistory = true;
      this.textArea.value = nextEntry.content;
      this.textArea.setSelectionRange(
        nextEntry.selectionStart,
        nextEntry.selectionEnd,
      );
      this.lastSavedContent = nextEntry.content;
      this.isUpdatingFromHistory = false;
      this.handleInput();
    }
  }

  private handleInput(): void {
    if (!this.isUpdatingFromHistory) {
      this.saveHistory();
    }

    let newContent = this.textArea.value;
    if (
      newContent.length <= 0 ||
      !this.activeEditor ||
      this.activeEditor.state.readOnly
    )
      return;

    newContent = this.encodeContent(newContent);

    this.activeEditor.dispatch({
      changes: [
        {
          from: this.activeEditor.state.selection.main.from,
          to: this.activeEditor.state.selection.main.to,
          insert: newContent,
        },
      ],
    });
  }

  private encodeContent(content: string): string {
    switch (this.encodeMethod) {
      case "base64":
        return btoa(content);
      case "unicode":
        return unicodeEncode(content);
      case "url":
        return encodeURIComponent(content);
      case "url+base64":
        return encodeURIComponent(btoa(content));
      case "base64+url":
        return btoa(encodeURIComponent(content));
      default:
        return content;
    }
  }

  public updateText(text: string): void {
    this.textArea.value = text;
    this.lastSavedContent = text;
    this.undoStack = [];
    this.redoStack = [];
  }

  public updateEncodeMethod(encodeMethod?: string): void {
    this.encodeMethod = encodeMethod || "none";
    this.encodeMethodSelect.value = this.encodeMethod;
  }

  public show(): void {
    this.quickDecode.style.display = "flex";
  }

  public hide(): void {
    this.quickDecode.style.display = "none";
  }

  public getElement(): HTMLDivElement {
    return this.HTMLElement;
  }

  private getActiveEditor(): CodeMirrorEditor | undefined {
    const activeElement = document.activeElement;
    if (!activeElement) return;

    const cmContent = activeElement.closest(".cm-content");
    if (!cmContent) return;

    return (cmContent as any)?.cmView?.view as CodeMirrorEditor;
  }

  private getCurrentSelection(): Selection {
    const activeEditor = this.getActiveEditor();
    if (!activeEditor) {
      return { from: 0, to: 0, text: "" };
    }

    const { from, to } = activeEditor.state.selection.main;
    return {
      from,
      to,
      text: activeEditor.state.sliceDoc(from, to),
    };
  }

  private startMonitoringSelection(): void {
    const INTERVAL_DELAY = 50;
    let lastSelection = this.getCurrentSelection();

    this.selectionInterval = setInterval(() => {
      const newSelection = this.getCurrentSelection();

      if (
        newSelection.from !== lastSelection.from ||
        newSelection.to !== lastSelection.to
      ) {
        lastSelection = newSelection;
        this.onSelectionChange(newSelection);
      }
    }, INTERVAL_DELAY);
  }

  public stopMonitoringSelection(): void {
    if (this.selectionInterval) {
      clearInterval(this.selectionInterval);
    }
  }

  private isMouseOver(element: HTMLElement): boolean {
    if (!element) return false;
    return Array.from(document.querySelectorAll(":hover")).includes(element);
  }

  private onSelectionChange(selection: Selection): void {
    if (this.isMouseOver(this.HTMLElement)) return;

    const contextMenu = document.querySelector(".p-contextmenu");
    if (contextMenu && this.isMouseOver(contextMenu as HTMLElement)) return;

    if (selection.text === "") {
      this.hide();
      return;
    }

    this.activeEditor = this.getActiveEditor();

    this.setReadOnly(this.activeEditor?.state.readOnly ?? false);
    this.showQuickDecode(selection.text);
  }

  private showQuickDecode(text: string): void {
    const decoded = this.tryToDecode(text);
    this.updateText(decoded.decodedContent);
    this.updateEncodeMethod(decoded.encodeMethod);
    this.show();
  }

  private setReadOnly(readOnly: boolean): void {
    this.textArea.disabled = readOnly;
    this.encodeMethodSelect.disabled = readOnly;
    if (readOnly) {
      this.encodeMethodSelect.value = "none";
    }
  }

  private isUrlEncoded(str: string): boolean {
    const urlRegex = /(%[0-9A-Fa-f]{2})+/g;
    return urlRegex.test(str);
  }

  private base64Decode(input: string): {
    encodeMethod: string;
    decodedContent: string;
  } {
    const modifiedInput = input.padEnd(Math.ceil(input.length / 4) * 4, "=");
    const base64Regex =
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

    if (base64Regex.test(modifiedInput)) {
      try {
        const decodedBase64 = atob(modifiedInput);
        return { encodeMethod: "base64", decodedContent: decodedBase64 };
      } catch (error) {
        // If decoding fails, return the original input
      }
    }

    return { encodeMethod: "none", decodedContent: input };
  }

  private tryToDecode(input: string): {
    encodeMethod: string;
    decodedContent: string;
  } {
    const base64Decoded = this.base64Decode(input);
    if (base64Decoded.encodeMethod !== "none") {
      if (this.isUrlEncoded(base64Decoded.decodedContent)) {
        try {
          const decodedUrl = decodeURIComponent(base64Decoded.decodedContent);
          return { encodeMethod: "base64+url", decodedContent: decodedUrl };
        } catch (error) {
          return base64Decoded;
        }
      }
      return base64Decoded;
    }

    const unicodeRegex = /\\u([0-9a-fA-F]{4})/g;
    if (unicodeRegex.test(input)) {
      try {
        const decodedUnicode = input.replace(unicodeRegex, (_, code) =>
          String.fromCharCode(parseInt(code, 16)),
        );
        return { encodeMethod: "unicode", decodedContent: decodedUnicode };
      } catch (error) {
        // If decoding fails, continue to the next decoding attempt
      }
    }

    if (this.isUrlEncoded(input)) {
      try {
        const decodedUrl = decodeURIComponent(input);
        const base64Decoded = this.base64Decode(decodedUrl);
        if (base64Decoded.encodeMethod !== "none" && input.length > 8) {
          return {
            encodeMethod: "url+base64",
            decodedContent: base64Decoded.decodedContent,
          };
        }
        return { encodeMethod: "url", decodedContent: decodedUrl };
      } catch (error) {
        // If decoding fails, continue to the next decoding attempt
      }
    }

    return { encodeMethod: "none", decodedContent: input };
  }

  public cleanup(): void {
    this.stopMonitoringSelection();
    this.textArea.removeEventListener("input", this.handleInput);
    this.textArea.removeEventListener("keydown", this.handleKeyDown);
    this.encodeMethodSelect.removeEventListener("change", this.handleInput);
    if (this.copyIconElement) {
      this.copyIconElement.removeEventListener("click", this.copyToClipboard);
    }
    this.HTMLElement.remove();
  }
}

class QuickDecodeManager {
  private sdk: FrontendSDK;
  private quickDecode: QuickDecode | undefined = undefined;
  private cleanupListener: (() => void) | undefined = undefined;
  private projectChangeListener: (() => Promise<void>) | undefined = undefined;
  private pageOpenListener: ((newHash: string) => void) | undefined = undefined;
  private isCleaned: boolean = false;

  constructor(sdk: FrontendSDK) {
    this.sdk = sdk;
  }

  private removeExistingQuickDecode(): void {
    const existingElements = document.getElementsByClassName(
      "evenbetter__qd-body",
    );
    Array.from(existingElements).forEach((element) => {
      element.remove();
    });
  }

  private attachQuickDecode(): void {
    this.removeExistingQuickDecode();

    const sessionListBody = document.querySelector(".size-full.flex.flex-col .size-full.flex.flex-col");
    if (!sessionListBody) return;

    this.quickDecode = new QuickDecode();
    sessionListBody.appendChild(this.quickDecode.getElement());
  }

  public init(): void {
    const MAX_ATTEMPTS = 80;
    const INTERVAL_DELAY = 25;

    const attach = (): void => {
      if (this.isCleaned) return;

      let attemptCount = 0;
      const interval = setInterval(() => {
        if (this.isCleaned) {
          clearInterval(interval);
          return;
        }

        attemptCount++;
        if (attemptCount > MAX_ATTEMPTS) {
          console.error("[EvenBetter QuickDecode] Could not find editors");
          clearInterval(interval);
          return;
        }

        const editors = document.querySelectorAll(".cm-editor .cm-content");
        if (!editors.length) return;

        clearInterval(interval);
        this.attachQuickDecode();
      }, INTERVAL_DELAY);
    };

    this.pageOpenListener = (newHash: string) => {
      if (this.isCleaned) return;

      if (newHash === "#/replay") {
        this.cleanup(false);
        attach();
      }
    };

    this.projectChangeListener = async () => {
      if (this.isCleaned) return;

      this.cleanup(false);
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (window.location.hash === "#/replay") attach();
    };

    this.sdk.backend.onEvent(
      "caido:project-change",
      this.projectChangeListener,
    );
    this.cleanupListener = onLocationChange((data) => {
      this.pageOpenListener?.(data.newHash);
    });
  }

  public cleanup(fullCleanup: boolean = true): void {
    if (this.quickDecode) {
      this.quickDecode.cleanup();
      this.quickDecode = undefined;
    }

    this.removeExistingQuickDecode();

    if (fullCleanup) {
      if (this.cleanupListener) {
        this.cleanupListener();
        this.cleanupListener = undefined;
      }

      if (this.projectChangeListener) {
        this.projectChangeListener = undefined;
      }

      if (this.pageOpenListener) {
        this.pageOpenListener = undefined;
      }

      this.isCleaned = true;
    }
  }
}

let manager: QuickDecodeManager | undefined = undefined;

export const quickDecode = createFeature("quick-decode", {
  onFlagEnabled: (sdk: FrontendSDK) => {
    if (!manager) {
      manager = new QuickDecodeManager(sdk);
      manager.init();
    }
  },
  onFlagDisabled: (sdk: FrontendSDK) => {
    if (manager) {
      manager.cleanup();
      manager = undefined;
    }
  },
});
