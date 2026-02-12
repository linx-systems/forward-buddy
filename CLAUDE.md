# ForwardEmail Thunderbird Extension

## Overview

Thunderbird MailExtension (Manifest V3, TB 128+) for managing ForwardEmail aliases via the ForwardEmail REST API.

## Tech Stack

- TypeScript (compiled in-place to JS via `tsc`)
- Thunderbird WebExtension APIs (`browser.*`)
- ForwardEmail REST API (`https://api.forwardemail.net/v1`)

## Build

```bash
bun run build        # Compile .ts → .js (in-place)
bun run build:watch  # Watch mode
```

TypeScript compiles each `.ts` file to a `.js` file in the same directory. The compiled `.js` files are gitignored.

## Architecture

```
background/background.ts  ← Message hub: all API calls go through here
    ↕ browser.runtime.sendMessage
popup/popup.ts            ← Main UI (list, detail, create views)
options/options.ts        ← Settings/login page
    ↓ imports
lib/api.ts                ← HTTP client (fetch + Basic Auth)
lib/cache.ts              ← In-memory TTL cache (domains 5min, aliases 2min)
lib/utils.ts              ← Type detection, formatting, i18n error helpers
types/                    ← Shared type definitions (.d.ts)
```

All popup/options code talks to the background script via messages. The background script is the only layer that calls the API and manages cache.

## Key Conventions

- **No innerHTML** — all DOM is built with `createElement`/`textContent` to prevent XSS
- **Alias ID** — PUT/DELETE use the MongoDB ObjectId (`alias.id`), never the alias name
- **i18n** — all user-visible strings use `browser.i18n.getMessage()` with keys from `_locales/*/messages.json`
- **Dark mode** — CSS uses `prefers-color-scheme: dark` with CSS custom properties
- **Error handling** — API errors are mapped to user-friendly i18n messages in `lib/utils.ts:friendlyError()`
- **Strict TypeScript** — `strict: true` in tsconfig, use `import type` for type-only imports

## Message Protocol (popup ↔ background)

| Message type         | Payload                        | Returns          |
|----------------------|--------------------------------|------------------|
| `testConnection`     | `{ token }`                    | Account object   |
| `getDomains`         | —                              | Domain[]         |
| `getAliases`         | `{ domain }`                   | Alias[]          |
| `createAlias`        | `{ domain, data }`             | Alias            |
| `updateAlias`        | `{ domain, id, data }`         | Alias            |
| `deleteAlias`        | `{ domain, id }`               | `{ ok: true }`   |
| `generatePassword`   | `{ domain, id }`               | Password object  |

All responses are wrapped as `{ data }` on success or `{ error, status }` on failure.

## Packaging

```bash
bun run package   # Compiles TS then builds XPI
```

Or manually:
```bash
bun run build
zip -r forwardemail.xpi manifest.json background/*.js popup/ options/ lib/*.js icons/ _locales/ -x '*.git*' -x '*.ts' -x '*.map'
```

Then load `forwardemail.xpi` in `about:debugging` > "Load Temporary Add-on".

## Testing

```bash
bun run build     # Compile first
bun test          # Run test suite
```

Tests use Node.js built-in test runner (`node --test`).

## Localization

When adding user-visible strings:
1. Add key to `_locales/en/messages.json`
2. Add German translation to `_locales/de/messages.json`
3. Use `data-i18n="key"` attribute in HTML or `browser.i18n.getMessage('key')` in JS

## Planned Phases (not yet implemented)

- **Phase 2**: Compose integration / identity sync
- **Phase 3**: Message display integration, vacation responder
