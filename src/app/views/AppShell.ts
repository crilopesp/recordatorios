export interface AppShellRefs {
  appShell: HTMLElement;
  editorLayout: HTMLElement;
  sectionsSidebar: HTMLElement;
  findBar: HTMLElement;
  findInput: HTMLInputElement;
  findPreviousButton: HTMLButtonElement;
  findNextButton: HTMLButtonElement;
  findCloseButton: HTMLButtonElement;
  sectionsList: HTMLUListElement;
  editorRoot: HTMLElement;
  sectionsToggleButton: HTMLButtonElement;
  searchToggleButton: HTMLButtonElement;
  pathText: HTMLElement;
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
          <aside id="sectionsSidebar" class="sections-sidebar" aria-label="Secciones del documento">
            <ul id="sectionsList" class="sections-list"></ul>
          </aside>
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

        <footer class="statusbar">
          <div class="statusbar-controls">
            <button
              id="sectionsToggleButton"
              class="statusbar-icon-button"
              type="button"
              aria-label="Mostrar u ocultar secciones"
              title="Secciones"
            >
              <span class="icon icon--sections" aria-hidden="true"></span>
            </button>
            <button
              id="searchToggleButton"
              class="statusbar-icon-button"
              type="button"
              aria-label="Mostrar u ocultar busqueda"
              title="Buscar"
            >
              <span class="icon icon--search" aria-hidden="true"></span>
            </button>
          </div>
          <div id="pathText"></div>
        </footer>
      </div>
    </main>
  `;

  return {
    appShell: requireElement<HTMLElement>(container, "#appShell"),
    editorLayout: requireElement<HTMLElement>(container, "#editorLayout"),
    sectionsSidebar: requireElement<HTMLElement>(container, "#sectionsSidebar"),
    findBar: requireElement<HTMLElement>(container, "#findBar"),
    findInput: requireElement<HTMLInputElement>(container, "#findInput"),
    findPreviousButton: requireElement<HTMLButtonElement>(container, "#findPreviousButton"),
    findNextButton: requireElement<HTMLButtonElement>(container, "#findNextButton"),
    findCloseButton: requireElement<HTMLButtonElement>(container, "#findCloseButton"),
    sectionsList: requireElement<HTMLUListElement>(container, "#sectionsList"),
    editorRoot: requireElement<HTMLElement>(container, "#editorRoot"),
    sectionsToggleButton: requireElement<HTMLButtonElement>(container, "#sectionsToggleButton"),
    searchToggleButton: requireElement<HTMLButtonElement>(container, "#searchToggleButton"),
    pathText: requireElement<HTMLElement>(container, "#pathText"),
  };
}
