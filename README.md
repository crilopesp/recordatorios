# Recordatorios

App de escritorio local (Tauri v2) para editar recordatorios en un solo archivo `.txt` con flujo teclado-first.

## Stack actual

- Tauri v2 (Rust)
- Vite + TypeScript (sin framework)
- CodeMirror 6

## Requisitos

- Node.js 20+
- Rust + Cargo
- Dependencias de sistema para Tauri/WebKit en Linux

### Fedora (ejemplo)

```bash
sudo dnf install -y \
  gcc-c++ \
  webkit2gtk4.1-devel \
  gtk3-devel \
  libsoup3-devel \
  openssl-devel \
  pkgconf-pkg-config
```

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build:web
npm run build
```

## Flujo de uso

1. Al iniciar, la app intenta reabrir el ultimo `.txt` usado.
2. Si no existe, pide seleccionar un archivo `.txt`.
3. Guarda cambios automaticamente (debounce corto) y tambien con `Ctrl+S`.

## Atajos

- `Ctrl+S`: guardar inmediato
- `Ctrl+F`: abrir barra de busqueda
- `F3` / `Shift+F3`: siguiente/anterior coincidencia
- `Ctrl+O`: abrir archivo
