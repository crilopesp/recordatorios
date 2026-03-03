import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { extractSections, SectionsSidebar } from "./components/SectionsSidebar";
import { StatusBar } from "./components/StatusBar";
import { TaskEditor } from "./components/TaskEditor";
import type { AppShellRefs } from "./views/AppShell";

export class AppController {
  private readonly statusBar: StatusBar;
  private readonly editor: TaskEditor;
  private readonly sectionsSidebar: SectionsSidebar;
  private readonly editorLayout: HTMLElement;
  private readonly sectionsSidebarElement: HTMLElement;
  private readonly findBar: HTMLElement;
  private readonly findInput: HTMLInputElement;
  private readonly findPreviousButton: HTMLButtonElement;
  private readonly findNextButton: HTMLButtonElement;
  private readonly findCloseButton: HTMLButtonElement;

  private currentFilePath = "";
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSearchQuery = "";
  private sectionsVisible = true;
  private searchVisible = false;

  constructor(refs: AppShellRefs) {
    this.editorLayout = refs.editorLayout;
    this.sectionsSidebarElement = refs.sectionsSidebar;
    this.findBar = refs.findBar;
    this.findInput = refs.findInput;
    this.findPreviousButton = refs.findPreviousButton;
    this.findNextButton = refs.findNextButton;
    this.findCloseButton = refs.findCloseButton;

    this.statusBar = new StatusBar({
      pathText: refs.pathText,
      sectionsToggleButton: refs.sectionsToggleButton,
      searchToggleButton: refs.searchToggleButton,
      onSectionsToggleClick: () => {
        this.toggleSectionsSidebar();
      },
      onSearchToggleClick: () => {
        this.toggleSearchBar();
      },
      onPathClick: () => {
        void this.selectFile();
      },
    });

    this.sectionsSidebar = new SectionsSidebar({
      list: refs.sectionsList,
      onSectionSelected: (lineNumber) => {
        this.editor.scrollToLine(lineNumber);
      },
    });
    this.sectionsSidebar.setSections([]);

    this.editor = new TaskEditor({
      root: refs.editorRoot,
      onDocChanged: (docText) => {
        this.sectionsSidebar.setSections(extractSections(docText));
        this.scheduleSave();
      },
      onSaveRequested: () => {
        this.clearSaveTimer();
        void this.flushSave();
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
    });

    this.findInput.value = "";
    this.bindSearchBarEvents();
    this.updateSectionsVisibility();
    this.statusBar.setSearchActive(false);

    window.addEventListener("beforeunload", () => {
      this.clearSaveTimer();
      void this.flushSave();
    });
  }

  async bootstrap(): Promise<void> {
    const remembered = await invoke<string | null>("read_last_file");
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
  }

  private setStatus(message: string): void {
    this.statusBar.setStatus(message);
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

  private async flushSave(): Promise<void> {
    if (!this.currentFilePath) {
      return;
    }

    try {
      await invoke("save_text_file", {
        path: this.currentFilePath,
        rawText: this.editor.getDocText(),
      });
      this.setStatus("Guardado");
    } catch (error) {
      this.setStatus(`Error al guardar: ${error}`);
    }
  }

  private async loadFile(path: string): Promise<void> {
    const rawText = await invoke<string>("load_text_file", { path });
    this.currentFilePath = path;
    this.statusBar.setPath(path);
    this.editor.setDocument(rawText);
    this.sectionsSidebar.setSections(extractSections(rawText));
    this.setStatus("Guardado");
    await invoke("write_last_file", { path });
  }

  private async selectFile(required = false): Promise<void> {
    try {
      const selected = await open({
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
      this.statusBar.setSearchActive(true);
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
    this.statusBar.setSearchActive(false);
    this.editor.setSearchQuery("");
    this.editor.focus();
  }

  private toggleSearchBar(): void {
    if (this.searchVisible) {
      this.closeSearchBar();
      return;
    }
    this.openSearchBar();
  }

  private toggleSectionsSidebar(): void {
    this.sectionsVisible = !this.sectionsVisible;
    this.updateSectionsVisibility();
  }

  private updateSectionsVisibility(): void {
    this.sectionsSidebarElement.hidden = !this.sectionsVisible;
    this.editorLayout.classList.toggle("sections-hidden", !this.sectionsVisible);
    this.statusBar.setSectionsActive(this.sectionsVisible);
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
}
