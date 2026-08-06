# Automation Engine

Enterprise-grade Chrome Extension (Manifest V3) for configurable browser workflow automation.

This extension does **not** generate AI content or make intelligent decisions. It only automates browser interactions against external websites according to declarative workflow definitions.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS + Radix UI + shadcn-style components
- Framer Motion, React Hook Form, Zod
- Zustand + TanStack Query
- `@crxjs/vite-plugin` for Manifest V3 builds

## Features

- Floating React dashboard (not the default Chrome popup)
- Declarative workflow engine with unlimited steps
- DOM automation (click, type, wait, extract, assert)
- Modular adapters: ChatGPT, Image Generation, TTS
- Download manager + project folder naming
- Job queue, progress tracking, activity log
- Retry / backoff / continue-on-error recovery

## Develop

```bash
npm install
npm run dev
```

Load the extension from the Vite CRX dev output (Chrome → Extensions → Load unpacked).

## Build

```bash
npm run build
```

Load the `dist` folder as an unpacked extension.

## Architecture

```
src/
  background/     Service worker, dashboard window, message bus
  content/        In-page DOM automation executor
  dashboard/      Floating React dashboard app
  engine/         Workflow, queue, retry, activity, automation
  modules/        ChatGPT, Image Gen, TTS, Download, File Manager
  shared/         Types, messaging, storage, utils
  stores/         Zustand stores
  data/           Sample workflow definitions
```

Workflow business logic is data (`WorkflowDefinition`), not hardcoded application code.
