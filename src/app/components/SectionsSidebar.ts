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
  private sections: SectionMarker[] = [];
  private filterQuery = "";

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
    this.sections = sections;
    this.render();
  }

  setFilter(query: string): void {
    this.filterQuery = query.trim().toLocaleLowerCase();
    this.render();
  }

  getVisibleSectionButtons(): HTMLButtonElement[] {
    return Array.from(this.list.querySelectorAll<HTMLButtonElement>("button.section-link[data-line]"));
  }

  private render(): void {
    this.list.textContent = "";

    if (this.sections.length === 0) {
      const empty = document.createElement("li");
      empty.className = "sections-empty";
      empty.textContent = "Sin secciones";
      this.list.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();

    const query = this.filterQuery;
    const isFiltering = query.length > 0;
    const isMatch = (name: string): boolean => !isFiltering || name.toLocaleLowerCase().includes(query);

    let index = 0;
    while (index < this.sections.length) {
      const marker = this.sections[index];
      if (marker.level === 2) {
        if (isMatch(marker.name)) {
          fragment.append(this.createSubsectionItem(marker));
        }
        index += 1;
        continue;
      }

      const section = marker;
      const subsections: SectionMarker[] = [];
      index += 1;
      while (index < this.sections.length && this.sections[index].level === 2) {
        subsections.push(this.sections[index]);
        index += 1;
      }

      const sectionMatches = isMatch(section.name);
      const matchingSubsections = subsections.filter((subsection) => isMatch(subsection.name));
      if (!sectionMatches && matchingSubsections.length === 0 && isFiltering) {
        continue;
      }

      const sectionItem = document.createElement("li");
      sectionItem.className = "sections-item sections-item-section";

      const row = document.createElement("div");
      row.className = "section-row";

      const sectionButton = document.createElement("button");
      sectionButton.type = "button";
      sectionButton.className = "section-link";
      sectionButton.dataset.line = String(section.lineNumber);
      sectionButton.textContent = section.name;
      sectionButton.title = `Ir a linea ${section.lineNumber}`;

      row.append(sectionButton);
      sectionItem.append(row);

      if (subsections.length > 0) {
        const subsectionList = document.createElement("ul");
        subsectionList.className = "sections-sublist";
        const subsectionsToRender = isFiltering && !sectionMatches ? matchingSubsections : subsections;

        for (const subsection of subsectionsToRender) {
          const subsectionItem = this.createSubsectionItem(subsection);
          subsectionList.append(subsectionItem);
        }

        sectionItem.append(subsectionList);
      }

      fragment.append(sectionItem);
    }

    this.list.append(fragment);
  }

  private createSubsectionItem(subsection: SectionMarker): HTMLLIElement {
    const item = document.createElement("li");
    item.className = "sections-item sections-item-subsection";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "section-link section-link-subsection";
    button.dataset.line = String(subsection.lineNumber);
    button.textContent = subsection.name;
    button.title = `Ir a linea ${subsection.lineNumber}`;

    item.append(button);
    return item;
  }
}
