import {
  addCursorAbove,
  addCursorBelow,
  copyLineDown,
  copyLineUp,
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  insertTab,
} from "@codemirror/commands";
import { countColumn, EditorState, RangeSetBuilder, StateEffect } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type ViewUpdate,
  ViewPlugin,
  drawSelection,
  keymap,
} from "@codemirror/view";

export interface TaskEditorOptions {
  root: HTMLElement;
  onDocChanged: (docText: string) => void;
  onSaveRequested: () => void;
  onFindRequested: () => void;
  onFindNextRequested: () => void;
  onFindPreviousRequested: () => void;
  onOpenFileRequested: () => void;
  onSectionsPaletteRequested: () => void;
}

const DEFAULT_EDITOR_FONT_SIZE_PX = 14;
const MIN_EDITOR_FONT_SIZE_PX = 10;
const MAX_EDITOR_FONT_SIZE_PX = 32;
const EDITOR_FONT_SIZE_STEP_PX = 1;

function findMatch(haystack: string, needle: string, from: number, backwards: boolean): number {
  if (!backwards) {
    let index = haystack.indexOf(needle, from);
    if (index === -1) {
      index = haystack.indexOf(needle, 0);
    }
    return index;
  }

  let index = haystack.lastIndexOf(needle, Math.max(0, from));
  if (index === -1) {
    index = haystack.lastIndexOf(needle);
  }
  return index;
}

function parseHeadingLevel(lineText: string): 1 | 2 | null {
  if (lineText.length < 3) {
    return null;
  }

  if (lineText.charCodeAt(0) !== 45 || lineText.charCodeAt(1) !== 45) {
    return null;
  }

  if (lineText.charCodeAt(2) === 45) {
    let cursor = 3;
    while (cursor < lineText.length && lineText.charCodeAt(cursor) === 32) {
      cursor += 1;
    }
    return cursor < lineText.length ? 1 : null;
  }

  let cursor = 2;
  while (cursor < lineText.length && lineText.charCodeAt(cursor) === 32) {
    cursor += 1;
  }
  return cursor < lineText.length ? 2 : null;
}

function isFillHighlighterLine(lineText: string): boolean {
  let cursor = 0;

  while (cursor < lineText.length) {
    const code = lineText.charCodeAt(cursor);
    if (code !== 32 && code !== 9) {
      break;
    }
    cursor += 1;
  }

  if (cursor + 1 >= lineText.length) {
    return false;
  }

  if (lineText.charCodeAt(cursor) !== 33 || lineText.charCodeAt(cursor + 1) !== 33) {
    return false;
  }

  cursor += 2;
  while (cursor < lineText.length && lineText.charCodeAt(cursor) === 32) {
    cursor += 1;
  }

  return cursor < lineText.length;
}

function getIndentColumns(lineText: string, tabSize: number): number {
  let cursor = 0;
  while (cursor < lineText.length) {
    const code = lineText.charCodeAt(cursor);
    if (code !== 32 && code !== 9) {
      break;
    }
    cursor += 1;
  }

  if (cursor === 0) {
    return 0;
  }

  return countColumn(lineText.slice(0, cursor), tabSize);
}

function isTaskLine(lineText: string): boolean {
  if (!lineText.trim().length) {
    return false;
  }

  if (/^\s/.test(lineText)) {
    return false;
  }

  if (parseHeadingLevel(lineText) !== null) {
    return false;
  }

  return true;
}

const sectionLineDecoration = Decoration.mark({ class: "cm-section-title" });
const subsectionLineDecoration = Decoration.mark({ class: "cm-subsection-title" });
const sectionLineClassDecoration = Decoration.line({ attributes: { class: "cm-line-seccion" } });
const subsectionLineClassDecoration = Decoration.line({ attributes: { class: "cm-line-subseccion" } });
const fillHighlighterLineDecoration = Decoration.mark({ class: "fill-highlighter" });
const searchMatchDecoration = Decoration.mark({ class: "cm-search-match" });

function createTaskGutterIcon(symbol: string): HTMLSpanElement {
  const marker = document.createElement("span");
  marker.className = "cm-teleported-gutter-icon";
  marker.textContent = symbol;
  marker.setAttribute("aria-hidden", "true");
  return marker;
}

const teleportedTaskGutter = ViewPlugin.fromClass(
  class {
    private readonly dom: HTMLDivElement;
    constructor(view: EditorView) {
      this.dom = document.createElement("div");
      this.dom.className = "cm-teleported-gutter";
      view.scrollDOM.appendChild(this.dom);
      this.render(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || update.geometryChanged || update.heightChanged) {
        this.render(update.view);
      }
    }

    destroy(): void {
      this.dom.remove();
    }

    private render(view: EditorView): void {
      const fragment = document.createDocumentFragment();
      const topPadding = view.documentPadding.top;
      const seenLines = new Set<number>();
      for (const block of view.viewportLineBlocks) {
        const line = view.state.doc.lineAt(block.from);
        if (seenLines.has(line.number)) {
          continue;
        }
        seenLines.add(line.number);

        if (!isTaskLine(line.text)) {
          continue;
        }

        const marker = document.createElement("div");
        marker.className = "cm-teleported-gutter-marker";
        marker.appendChild(createTaskGutterIcon("-"));
        marker.style.top = `${Math.round(topPadding + block.top)}px`;
        marker.style.height = `${Math.max(1, Math.round(block.height))}px`;
        fragment.appendChild(marker);
      }

      this.dom.replaceChildren(fragment);
    }
  }
);

function buildHeadingDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;

  for (const { from, to } of view.visibleRanges) {
    let line = doc.lineAt(from);
    while (line.from <= to) {
      const headingLevel = parseHeadingLevel(line.text);
      if (headingLevel === 1) {
        builder.add(line.from, line.from, sectionLineClassDecoration);
        builder.add(line.from, line.to, sectionLineDecoration);
      } else if (headingLevel === 2) {
        builder.add(line.from, line.from, subsectionLineClassDecoration);
        builder.add(line.from, line.to, subsectionLineDecoration);
      }

      if (isFillHighlighterLine(line.text)) {
        builder.add(line.from, line.to, fillHighlighterLineDecoration);
      }

      const indentColumns = getIndentColumns(line.text, view.state.tabSize);
      if (indentColumns > 0) {
        builder.add(
          line.from,
          line.from,
          Decoration.line({
            attributes: {
              class: "cm-line-indented",
              style: `--cm-indent: ${indentColumns}ch`,
            },
          })
        );
      }

      if (line.number >= doc.lines) {
        break;
      }
      line = doc.line(line.number + 1);
    }
  }

  return builder.finish();
}

const headingHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildHeadingDecorations(view);
    }

    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildHeadingDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
  }
);

const setSearchQueryEffect = StateEffect.define<string>();

function buildSearchDecorations(view: EditorView, query: string): DecorationSet {
  if (!query) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const queryLength = query.length;

  for (const { from, to } of view.visibleRanges) {
    const chunk = doc.sliceString(from, to).toLocaleLowerCase();
    let cursor = 0;

    while (cursor <= chunk.length - queryLength) {
      const index = chunk.indexOf(query, cursor);
      if (index === -1) {
        break;
      }
      builder.add(from + index, from + index + queryLength, searchMatchDecoration);
      cursor = index + Math.max(1, queryLength);
    }
  }

  return builder.finish();
}

const searchHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private query = "";

    constructor(view: EditorView) {
      this.decorations = Decoration.none;
      this.decorations = buildSearchDecorations(view, this.query);
    }

    update(update: ViewUpdate): void {
      let nextQuery = this.query;

      for (const transaction of update.transactions) {
        for (const effect of transaction.effects) {
          if (effect.is(setSearchQueryEffect)) {
            nextQuery = effect.value.trim().toLocaleLowerCase();
          }
        }
      }

      const queryChanged = nextQuery !== this.query;
      if (queryChanged) {
        this.query = nextQuery;
      }

      if (queryChanged || update.docChanged || update.viewportChanged) {
        this.decorations = buildSearchDecorations(update.view, this.query);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
  }
);

export class TaskEditor {
  private readonly view: EditorView;
  private suppressDocSync = false;
  private normalizedDocCache: string | null = null;
  private editorFontSizePx = DEFAULT_EDITOR_FONT_SIZE_PX;

  constructor(options: TaskEditorOptions) {
    const state = EditorState.create({
      doc: "",
      extensions: [
        history(),
        drawSelection(),
        teleportedTaskGutter,
        EditorView.lineWrapping,
        keymap.of([
          { key: "Tab", run: insertTab },
          { key: "Shift-Tab", run: indentLess },
          ...defaultKeymap,
          ...historyKeymap,
          { key: "Mod-p", run: () => (options.onSectionsPaletteRequested(), true) },
          { key: "Mod-s", run: () => (options.onSaveRequested(), true) },
          { key: "Mod-f", run: () => (options.onFindRequested(), true) },
          { key: "F3", run: () => (options.onFindNextRequested(), true) },
          { key: "Shift-F3", run: () => (options.onFindPreviousRequested(), true) },
          { key: "Mod-o", run: () => (options.onOpenFileRequested(), true) },
          { key: "Ctrl-Alt-ArrowUp", run: addCursorAbove },
          { key: "Ctrl-Alt-ArrowDown", run: addCursorBelow },
          { key: "Alt-Shift-ArrowUp", run: copyLineUp },
          { key: "Alt-Shift-ArrowDown", run: copyLineDown },
        ]),
        EditorView.domEventHandlers({
          keydown: (event) => {
            if (!event.ctrlKey || event.metaKey || event.altKey) {
              return false;
            }

            if (event.key === "-" || event.key === "_") {
              event.preventDefault();
              return this.adjustEditorFontSize(-EDITOR_FONT_SIZE_STEP_PX);
            }

            if (event.key === "=" || event.key === "+") {
              event.preventDefault();
              return this.adjustEditorFontSize(EDITOR_FONT_SIZE_STEP_PX);
            }

            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !this.suppressDocSync) {
            this.invalidateSearchCache();
            options.onDocChanged(update.state.doc.toString());
          }
        }),
        headingHighlighter,
        searchHighlighter,
      ],
    });

    this.view = new EditorView({
      state,
      parent: options.root,
    });
    this.applyEditorFontSize();
  }

  setDocument(text: string): void {
    this.suppressDocSync = true;
    this.invalidateSearchCache();
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text },
      selection: { anchor: 0 },
    });
    this.suppressDocSync = false;
  }

  getDocText(): string {
    return this.view.state.doc.toString();
  }

  getSelectedText(): string {
    return this.view.state.sliceDoc(this.view.state.selection.main.from, this.view.state.selection.main.to);
  }

  scrollToLine(lineNumber: number): boolean {
    const totalLines = this.view.state.doc.lines;
    if (totalLines === 0) {
      return false;
    }

    const clampedLine = Math.max(1, Math.min(lineNumber, totalLines));
    const line = this.view.state.doc.line(clampedLine);
    this.view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    this.view.focus();
    return true;
  }

  focus(): boolean {
    this.view.focus();
    return true;
  }

  setSearchQuery(query: string): void {
    this.view.dispatch({
      effects: setSearchQueryEffect.of(query),
    });
  }

  findNext(query: string, options: { focusEditor?: boolean } = {}): boolean {
    return this.find(query, false, options.focusEditor ?? true);
  }

  findPrevious(query: string, options: { focusEditor?: boolean } = {}): boolean {
    return this.find(query, true, options.focusEditor ?? true);
  }

  private find(query: string, backwards: boolean, focusEditor: boolean): boolean {
    const normalized = query.trim();
    if (!normalized.length) {
      return false;
    }

    const doc = this.getNormalizedDoc();
    const selection = this.view.state.selection.main;
    const start = backwards ? selection.from - 1 : selection.to;
    const index = findMatch(doc, normalized.toLocaleLowerCase(), start, backwards);

    if (index === -1) {
      return false;
    }

    this.view.dispatch({
      selection: { anchor: index, head: index + normalized.length },
      scrollIntoView: true,
    });
    if (focusEditor) {
      this.view.focus();
    }
    return true;
  }

  private getNormalizedDoc(): string {
    if (this.normalizedDocCache === null) {
      this.normalizedDocCache = this.view.state.doc.toString().toLocaleLowerCase();
    }
    return this.normalizedDocCache;
  }

  private invalidateSearchCache(): void {
    this.normalizedDocCache = null;
  }

  private adjustEditorFontSize(delta: number): boolean {
    const nextSize = Math.max(
      MIN_EDITOR_FONT_SIZE_PX,
      Math.min(MAX_EDITOR_FONT_SIZE_PX, this.editorFontSizePx + delta)
    );

    if (nextSize === this.editorFontSizePx) {
      return true;
    }

    this.editorFontSizePx = nextSize;
    this.applyEditorFontSize();
    return true;
  }

  private applyEditorFontSize(): void {
    this.view.dom.style.setProperty("--editor-font-size", `${this.editorFontSizePx}px`);
  }
}
