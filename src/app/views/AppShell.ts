export interface AppShellRefs {
  sectionPalette: HTMLElement;
  sectionPaletteInput: HTMLInputElement;
  editorLayout: HTMLElement;
  findBar: HTMLElement;
  findInput: HTMLInputElement;
  findPreviousButton: HTMLButtonElement;
  findNextButton: HTMLButtonElement;
  findCloseButton: HTMLButtonElement;
  sectionsList: HTMLUListElement;
  editorRoot: HTMLElement;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element as T;
}

export function renderAppShell(container: HTMLElement): AppShellRefs {
  container.innerHTML = `
    <main id="appShell" class="app-shell">
      <div id="appSheet" class="app-sheet">
        <div id="editorLayout" class="editor-layout">
          <section class="editor-panel">
            <div id="findBar" class="findbar" hidden>
              <label class="findbar-label" for="findInput">Buscar</label>
              <input id="findInput" class="findbar-input" type="text" autocomplete="off" spellcheck="false" />
              <button id="findPreviousButton" class="findbar-button" type="button" aria-label="Buscar anterior">↑</button>
              <button id="findNextButton" class="findbar-button" type="button" aria-label="Buscar siguiente">↓</button>
              <button id="findCloseButton" class="findbar-button findbar-close" type="button" aria-label="Cerrar búsqueda">✕</button>
            </div>
            <section id="editorRoot" class="editor-root" aria-label="Task editor"></section>
          </section>
        </div>
        <div id="sectionPalette" class="section-palette" hidden>
          <div class="section-palette__panel" role="dialog" aria-modal="true" aria-label="Ir a seccion">
            <div class="section-palette__title">Secciones</div>
            <input
              id="sectionPaletteInput"
              class="section-palette__input"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="Buscar seccion..."
            />
            <ul id="sectionsList" class="sections-list section-palette__list"></ul>
          </div>
        </div>
      </div>
    </main>
  `;

  return {
    editorLayout: requireElement<HTMLElement>(container, "#editorLayout"),
    sectionPalette: requireElement<HTMLElement>(container, "#sectionPalette"),
    sectionPaletteInput: requireElement<HTMLInputElement>(container, "#sectionPaletteInput"),
    findBar: requireElement<HTMLElement>(container, "#findBar"),
    findInput: requireElement<HTMLInputElement>(container, "#findInput"),
    findPreviousButton: requireElement<HTMLButtonElement>(container, "#findPreviousButton"),
    findNextButton: requireElement<HTMLButtonElement>(container, "#findNextButton"),
    findCloseButton: requireElement<HTMLButtonElement>(container, "#findCloseButton"),
    sectionsList: requireElement<HTMLUListElement>(container, "#sectionsList"),
    editorRoot: requireElement<HTMLElement>(container, "#editorRoot"),
  };
}
