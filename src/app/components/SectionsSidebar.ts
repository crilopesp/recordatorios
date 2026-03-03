export interface SectionMarker {
  name: string;
  lineNumber: number;
  level: 1 | 2;
}

export interface SectionsSidebarOptions {
  list: HTMLUListElement;
  onSectionSelected: (lineNumber: number) => void;
}

export function extractSections(docText: string): SectionMarker[] {
  const sections: SectionMarker[] = [];

  // Normalize line endings once, then scan line-by-line without regex.
  const normalizedText = docText.includes("\r") ? docText.replace(/\r\n?/g, "\n") : docText;

  let lineNumber = 1;
  let lineStart = 0;

  while (lineStart <= normalizedText.length) {
    const lineEnd = normalizedText.indexOf("\n", lineStart);
    const end = lineEnd === -1 ? normalizedText.length : lineEnd;

    const startsWithTwoDashes = end - lineStart >= 3
      && normalizedText.charCodeAt(lineStart) === 45
      && normalizedText.charCodeAt(lineStart + 1) === 45;

    if (startsWithTwoDashes) {
      const level: 1 | 2 = normalizedText.charCodeAt(lineStart + 2) === 45 ? 1 : 2;
      const prefixLength = level === 1 ? 3 : 2;

      let nameStart = lineStart + prefixLength;
      while (nameStart < end && normalizedText.charCodeAt(nameStart) === 32) {
        nameStart += 1;
      }

      if (nameStart < end) {
        const name = normalizedText.slice(nameStart, end).trimEnd();
        if (name.length) {
          sections.push({ name, lineNumber, level });
        }
      }
    }

    if (lineEnd === -1) {
      break;
    }

    lineStart = lineEnd + 1;
    lineNumber += 1;
  }

  return sections;
}

export class SectionsSidebar {
  private readonly list: HTMLUListElement;
  private readonly onSectionSelected: (lineNumber: number) => void;

  constructor(options: SectionsSidebarOptions) {
    this.list = options.list;
    this.onSectionSelected = options.onSectionSelected;

    this.list.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const button = target.closest<HTMLButtonElement>(".section-link[data-line]");
      if (!button) {
        return;
      }

      const lineNumber = Number.parseInt(button.dataset.line ?? "", 10);
      if (Number.isNaN(lineNumber)) {
        return;
      }

      this.onSectionSelected(lineNumber);
    });
  }

  setSections(sections: SectionMarker[]): void {
    this.list.textContent = "";

    if (sections.length === 0) {
      const empty = document.createElement("li");
      empty.className = "sections-empty";
      empty.textContent = "Sin secciones";
      this.list.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const section of sections) {
      const item = document.createElement("li");
      item.className = "sections-item";

      const button = document.createElement("button");
      button.type = "button";
      button.className = section.level === 2 ? "section-link section-link-subsection" : "section-link";
      button.dataset.line = String(section.lineNumber);
      button.textContent = section.name;
      button.title = `Ir a linea ${section.lineNumber}`;

      item.append(button);
      fragment.append(item);
    }

    this.list.append(fragment);
  }
}
