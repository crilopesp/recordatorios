export interface StatusBarOptions {
  pathText: HTMLElement;
  sectionsToggleButton: HTMLButtonElement;
  searchToggleButton: HTMLButtonElement;
  saveButton: HTMLButtonElement;
  onSectionsToggleClick: () => void;
  onSearchToggleClick: () => void;
  onSaveClick: () => void;
  onPathClick: () => void;
}

export class StatusBar {
  private readonly pathText: HTMLElement;
  private readonly sectionsToggleButton: HTMLButtonElement;
  private readonly searchToggleButton: HTMLButtonElement;
  private readonly saveButton: HTMLButtonElement;

  constructor(options: StatusBarOptions) {
    this.pathText = options.pathText;
    this.sectionsToggleButton = options.sectionsToggleButton;
    this.searchToggleButton = options.searchToggleButton;
    this.saveButton = options.saveButton;

    this.pathText.addEventListener("click", options.onPathClick);
    this.sectionsToggleButton.addEventListener("click", options.onSectionsToggleClick);
    this.saveButton.addEventListener("click", options.onSaveClick);
    this.searchToggleButton.addEventListener("click", options.onSearchToggleClick);
  }

  setPath(path: string): void {
    const fileName = path.split(/[\\/]/).pop() || path;
    this.pathText.textContent = fileName;
    this.pathText.title = path;
  }

  setSectionsActive(active: boolean): void {
    this.sectionsToggleButton.setAttribute("aria-pressed", String(active));
    this.sectionsToggleButton.classList.toggle("is-active", active);
  }

  setSearchActive(active: boolean): void {
    this.searchToggleButton.setAttribute("aria-pressed", String(active));
    this.searchToggleButton.classList.toggle("is-active", active);
  }

  setStatus(_message: string): void {
    // Estado oculto: se mantiene el método para no romper llamadas existentes.
  }
}
