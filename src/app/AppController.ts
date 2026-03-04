import { extractSections, SectionsSidebar } from "./components/SectionsSidebar";
import { TaskEditor } from "./components/TaskEditor";
import type { AppShellRefs } from "./views/AppShell";

type InvokeFn = <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
type DialogOpenFn = (options: {
  title?: string;
  multiple?: boolean;
  directory?: boolean;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}) => Promise<string | string[] | null>;

const WEB_LAST_FILE_NAME_KEY = "recordatorios.web.lastFileName";
const WEB_LAST_FILE_TEXT_KEY = "recordatorios.web.lastFileText";

export class AppController {
  private readonly editor: TaskEditor;
  private readonly sectionsSidebar: SectionsSidebar;
  private readonly sectionPalette: HTMLElement;
  private readonly sectionPaletteInput: HTMLInputElement;
  private readonly findBar: HTMLElement;
  private readonly findInput: HTMLInputElement;
  private readonly findPreviousButton: HTMLButtonElement;
  private readonly findNextButton: HTMLButtonElement;
  private readonly findCloseButton: HTMLButtonElement;

  private currentFilePath = "";
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSearchQuery = "";
  private searchVisible = false;
  private sectionPaletteVisible = false;
  private visibleSectionButtons: HTMLButtonElement[] = [];
  private selectedSectionIndex = -1;
  private readonly isTauriRuntime = "__TAURI_INTERNALS__" in window;
  private tauriInvoke: InvokeFn | null = null;
  private tauriDialogOpen: DialogOpenFn | null = null;

  constructor(refs: AppShellRefs) {
    this.sectionPalette = refs.sectionPalette;
    this.sectionPaletteInput = refs.sectionPaletteInput;
    this.findBar = refs.findBar;
    this.findInput = refs.findInput;
    this.findPreviousButton = refs.findPreviousButton;
    this.findNextButton = refs.findNextButton;
    this.findCloseButton = refs.findCloseButton;

    this.sectionsSidebar = new SectionsSidebar({
      list: refs.sectionsList,
      onSectionSelected: (lineNumber) => {
        this.editor.scrollToLine(lineNumber);
        this.closeSectionPalette();
      },
    });
    this.sectionsSidebar.setSections([]);

    this.editor = new TaskEditor({
      root: refs.editorRoot,
      onDocChanged: (docText) => {
        this.updateSections(extractSections(docText));
        this.scheduleSave();
      },
      onSaveRequested: () => {
        this.clearSaveTimer();
        void this.flushSave(true);
      },
      onFindRequested: () => {
        this.openSearchBar();
      },
      onFindNextRequested: () => {
        this.findNext();
      },
      onFindPreviousRequested: () => {
        this.findPrevious();
      },
      onOpenFileRequested: () => {
        void this.selectFile();
      },
      onSectionsPaletteRequested: () => {
        this.openSectionPalette();
      },
    });

    this.findInput.value = "";
    this.bindSearchBarEvents();
    this.bindSectionPaletteEvents();
    this.updateSectionPaletteVisibility();

    window.addEventListener("beforeunload", () => {
      this.clearSaveTimer();
      void this.flushSave();
    });
  }

  async bootstrap(): Promise<void> {
    if (await this.ensureTauriApi()) {
      const remembered = await this.tauriInvoke<string | null>("read_last_file");
      if (remembered) {
        try {
          await this.loadFile(remembered);
          this.editor.focus();
          return;
        } catch {
          this.setStatus("No se pudo abrir el archivo anterior");
        }
      }

      await this.selectFile(true);
      this.editor.focus();
      return;
    }

    const webDraft = this.readWebDraft();
    if (webDraft) {
      this.loadWebDocument(webDraft.name, webDraft.text);
    } else {
      await this.selectFile(true);
    }
    this.editor.focus();
  }

  private setStatus(message: string): void {
    void message;
  }

  private clearSaveTimer(): void {
    if (!this.saveTimer) {
      return;
    }
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  private scheduleSave(): void {
    if (!this.currentFilePath) {
      return;
    }

    this.clearSaveTimer();
    this.setStatus("Guardando...");
    this.saveTimer = setTimeout(() => {
      void this.flushSave();
    }, 1200);
  }

  private async flushSave(exportForWeb = false): Promise<void> {
    if (!this.currentFilePath) {
      return;
    }

    if (await this.ensureTauriApi()) {
      try {
        await this.tauriInvoke("save_text_file", {
          path: this.currentFilePath,
          rawText: this.editor.getDocText(),
        });
        this.setStatus("Guardado");
      } catch (error) {
        this.setStatus(`Error al guardar: ${error}`);
      }
      return;
    }

    const text = this.editor.getDocText();
    this.writeWebDraft(this.currentFilePath, text);
    if (exportForWeb) {
      this.downloadTextFile(this.currentFilePath, text);
      this.setStatus("Guardado local y descargado");
      return;
    }
    this.setStatus("Guardado local");
  }

  private async loadFile(path: string): Promise<void> {
    if (await this.ensureTauriApi()) {
      const rawText = await this.tauriInvoke<string>("load_text_file", { path });
      this.currentFilePath = path;
      this.editor.setDocument(rawText);
      this.updateSections(extractSections(rawText));
      this.setStatus("Guardado");
      await this.tauriInvoke("write_last_file", { path });
      return;
    }

    const webDraft = this.readWebDraft();
    if (webDraft && webDraft.name === path) {
      this.loadWebDocument(webDraft.name, webDraft.text);
      return;
    }
    throw new Error("No existe un documento web guardado con ese nombre");
  }

  private async selectFile(required = false): Promise<void> {
    try {
      if (await this.ensureTauriApi()) {
        const selected = await this.tauriDialogOpen?.({
          title: "Seleccionar archivo .txt",
          multiple: false,
          directory: false,
          defaultPath: this.currentFilePath || undefined,
          filters: [{ name: "Texto", extensions: ["txt"] }],
        });

        if (!selected || typeof selected !== "string") {
          if (required) {
            throw new Error("Debes seleccionar un archivo para continuar");
          }
          return;
        }

        if (selected === this.currentFilePath) {
          return;
        }

        this.clearSaveTimer();
        await this.flushSave();
        await this.loadFile(selected);
      } else {
        const file = await this.pickWebTextFile();
        if (!file) {
          if (required) {
            throw new Error("Debes seleccionar un archivo para continuar");
          }
          return;
        }

        if (file.name === this.currentFilePath) {
          return;
        }

        this.clearSaveTimer();
        await this.flushSave();
        const content = await file.text();
        this.loadWebDocument(file.name, content);
      }
      this.editor.focus();
    } catch (error) {
      this.setStatus(`Error: ${error}`);
      if (required) {
        throw error;
      }
    }
  }

  private bindSearchBarEvents(): void {
    this.findInput.addEventListener("input", () => {
      this.lastSearchQuery = this.findInput.value.trim();
      this.editor.setSearchQuery(this.lastSearchQuery);
      this.setStatus(this.lastSearchQuery ? `Buscar: ${this.lastSearchQuery}` : "Busqueda vacia");
    });

    this.findInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeSearchBar();
        return;
      }

      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      this.lastSearchQuery = this.findInput.value.trim();
      this.runSearch(event.shiftKey ? "previous" : "next", false);
      this.findInput.focus();
    });

    this.findPreviousButton.addEventListener("click", () => {
      this.lastSearchQuery = this.findInput.value.trim();
      this.runSearch("previous", false);
      this.findInput.focus();
    });

    this.findNextButton.addEventListener("click", () => {
      this.lastSearchQuery = this.findInput.value.trim();
      this.runSearch("next", false);
      this.findInput.focus();
    });

    this.findCloseButton.addEventListener("click", () => {
      this.closeSearchBar();
    });
  }

  private openSearchBar(): void {
    if (!this.searchVisible) {
      this.searchVisible = true;
      this.findBar.hidden = false;
    }

    const selectionText = this.editor.getSelectedText().trim();
    if (selectionText.length > 0) {
      this.lastSearchQuery = selectionText;
      this.findInput.value = selectionText;
    } else if (!this.findInput.value.trim() && this.lastSearchQuery) {
      this.findInput.value = this.lastSearchQuery;
    }
    this.editor.setSearchQuery(this.findInput.value.trim());

    requestAnimationFrame(() => {
      this.findInput.focus();
      this.findInput.select();
    });
  }

  private closeSearchBar(): void {
    if (!this.searchVisible) {
      return;
    }
    this.searchVisible = false;
    this.findBar.hidden = true;
    this.editor.setSearchQuery("");
    this.editor.focus();
  }

  private bindSectionPaletteEvents(): void {
    this.sectionPalette.addEventListener("click", (event) => {
      if (event.target === this.sectionPalette) {
        this.closeSectionPalette();
      }
    });

    this.sectionPaletteInput.addEventListener("input", () => {
      this.applySectionFilter(this.sectionPaletteInput.value.trim());
      this.selectedSectionIndex = this.visibleSectionButtons.length > 0 ? 0 : -1;
      this.setSectionSelection(this.selectedSectionIndex);
    });

    this.sectionPaletteInput.addEventListener("keydown", (event) => {
      if (!this.sectionPaletteVisible) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        this.closeSectionPalette();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.moveSectionSelection(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.moveSectionSelection(-1);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        this.activateSelectedSection();
      }
    });
  }

  private updateSections(sections: { name: string; lineNumber: number; level: 1 | 2 }[]): void {
    this.sectionsSidebar.setSections(sections);
    this.applySectionFilter(this.sectionPaletteInput.value.trim());
  }

  private applySectionFilter(rawQuery: string): void {
    const query = rawQuery.trim().toLocaleLowerCase();
    const buttons = this.sectionPalette.querySelectorAll<HTMLButtonElement>("button.section-link[data-line]");
    this.visibleSectionButtons = [];

    for (const button of buttons) {
      const match = !query || (button.textContent?.toLocaleLowerCase() || "").includes(query);
      button.hidden = !match;
      if (match) {
        this.visibleSectionButtons.push(button);
      }
    }
  }

  private updateSectionPaletteVisibility(): void {
    if (!this.sectionPaletteVisible) {
      this.sectionPalette.hidden = true;
      return;
    }
    this.sectionPalette.hidden = false;
    this.applySectionFilter(this.sectionPaletteInput.value.trim());
  }

  private toggleSectionPalette(): void {
    if (this.sectionPaletteVisible) {
      this.closeSectionPalette();
      return;
    }
    this.openSectionPalette();
  }

  private openSectionPalette(): void {
    this.sectionPaletteVisible = true;
    this.sectionPaletteInput.value = "";
    this.updateSectionPaletteVisibility();
    this.applySectionFilter("");
    this.selectedSectionIndex = this.visibleSectionButtons.length > 0 ? 0 : -1;
    this.setSectionSelection(this.selectedSectionIndex);
    requestAnimationFrame(() => {
      this.sectionPaletteInput.focus();
      this.sectionPaletteInput.select();
    });
  }

  private closeSectionPalette(): void {
    if (!this.sectionPaletteVisible) {
      return;
    }

    this.sectionPaletteVisible = false;
    this.updateSectionPaletteVisibility();
    this.selectedSectionIndex = -1;
    this.applySectionFilter("");
    this.setSectionSelection(-1);
    this.editor.focus();
  }

  private setSectionSelection(index: number): void {
    const normalizedIndex = Math.max(-1, Math.min(this.visibleSectionButtons.length - 1, index));
    const buttons = Array.from(this.sectionPalette.querySelectorAll<HTMLButtonElement>("button.section-link[data-line]"));

    for (const button of buttons) {
      button.classList.remove("is-selected");
      button.setAttribute("aria-selected", "false");
    }

    for (let i = 0; i < this.visibleSectionButtons.length; i += 1) {
      const button = this.visibleSectionButtons[i];
      button.classList.toggle("is-selected", i === normalizedIndex);
      button.setAttribute("aria-selected", String(i === normalizedIndex));
    }

    if (normalizedIndex >= 0) {
      this.visibleSectionButtons[normalizedIndex].scrollIntoView({ block: "nearest" });
    }
  }

  private moveSectionSelection(delta: number): void {
    if (this.visibleSectionButtons.length === 0) {
      return;
    }

    if (this.selectedSectionIndex < 0) {
      this.selectedSectionIndex = delta > 0 ? 0 : this.visibleSectionButtons.length - 1;
    } else {
      const nextIndex = this.selectedSectionIndex + delta;
      if (nextIndex < 0) {
        this.selectedSectionIndex = this.visibleSectionButtons.length - 1;
      } else if (nextIndex >= this.visibleSectionButtons.length) {
        this.selectedSectionIndex = 0;
      } else {
        this.selectedSectionIndex = nextIndex;
      }
    }

    this.setSectionSelection(this.selectedSectionIndex);
  }

  private activateSelectedSection(): void {
    if (this.selectedSectionIndex < 0 || this.selectedSectionIndex >= this.visibleSectionButtons.length) {
      return;
    }
    const selected = this.visibleSectionButtons[this.selectedSectionIndex];
    const lineNumber = Number.parseInt(selected.dataset.line ?? "", 10);
    if (Number.isNaN(lineNumber)) {
      return;
    }

    this.editor.scrollToLine(lineNumber);
    this.closeSectionPalette();
  }

  private runSearch(direction: "next" | "previous", focusEditor: boolean): void {
    const query = this.lastSearchQuery.trim();
    if (!query) {
      this.editor.setSearchQuery("");
      this.setStatus("Busqueda vacia");
      return;
    }
    this.editor.setSearchQuery(query);

    const found =
      direction === "next"
        ? this.editor.findNext(query, { focusEditor })
        : this.editor.findPrevious(query, { focusEditor });
    this.setStatus(found ? `Buscando: ${query}` : `Sin coincidencias: ${query}`);
  }

  private findNext(): void {
    if (!this.lastSearchQuery) {
      this.openSearchBar();
      return;
    }
    this.runSearch("next", !this.searchVisible);
  }

  private findPrevious(): void {
    if (!this.lastSearchQuery) {
      this.openSearchBar();
      return;
    }
    this.runSearch("previous", !this.searchVisible);
  }

  private async ensureTauriApi(): Promise<boolean> {
    if (!this.isTauriRuntime) {
      return false;
    }
    if (this.tauriInvoke && this.tauriDialogOpen) {
      return true;
    }

    const [{ invoke }, { open }] = await Promise.all([
      import("@tauri-apps/api/core"),
      import("@tauri-apps/plugin-dialog"),
    ]);
    this.tauriInvoke = invoke as InvokeFn;
    this.tauriDialogOpen = open as DialogOpenFn;
    return true;
  }

  private async pickWebTextFile(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".txt,text/plain";
      input.style.display = "none";
      document.body.appendChild(input);

      input.addEventListener("change", () => {
        const [file] = Array.from(input.files ?? []);
        input.remove();
        resolve(file ?? null);
      });

      input.click();
    });
  }

  private loadWebDocument(name: string, text: string): void {
    this.currentFilePath = name;
    this.editor.setDocument(text);
    this.updateSections(extractSections(text));
    this.writeWebDraft(name, text);
    this.setStatus("Archivo cargado");
  }

  private writeWebDraft(name: string, text: string): void {
    localStorage.setItem(WEB_LAST_FILE_NAME_KEY, name);
    localStorage.setItem(WEB_LAST_FILE_TEXT_KEY, text);
  }

  private readWebDraft(): { name: string; text: string } | null {
    const name = localStorage.getItem(WEB_LAST_FILE_NAME_KEY);
    const text = localStorage.getItem(WEB_LAST_FILE_TEXT_KEY);
    if (!name || text === null) {
      return null;
    }
    return { name, text };
  }

  private downloadTextFile(name: string, text: string): void {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name || "recordatorios.txt";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
