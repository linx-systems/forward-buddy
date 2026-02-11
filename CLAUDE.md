# ForwardEmail Thunderbird Extension

## Overview

Thunderbird MailExtension (Manifest V3, TB 128+) for managing ForwardEmail aliases via the ForwardEmail REST API.

## Tech Stack

- Plain JavaScript ES6 modules — no npm, no bundler, no build step
- Thunderbird WebExtension APIs (`browser.*`)
- ForwardEmail REST API (`https://api.forwardemail.net/v1`)

## Architecture

```
background/background.js  ← Message hub: all API calls go through here
    ↕ browser.runtime.sendMessage
popup/popup.js            ← Main UI (list, detail, create views)
options/options.js        ← Settings/login page
    ↓ imports
lib/api.js                ← HTTP client (fetch + Basic Auth)
lib/cache.js              ← In-memory TTL cache (domains 5min, aliases 2min)
lib/utils.js              ← Type detection, formatting, i18n error helpers
```

All popup/options code talks to the background script via messages. The background script is the only layer that calls the API and manages cache.

## Key Conventions

- **No innerHTML** — all DOM is built with `createElement`/`textContent` to prevent XSS
- **Alias ID** — PUT/DELETE use the MongoDB ObjectId (`alias.id`), never the alias name
- **i18n** — all user-visible strings use `browser.i18n.getMessage()` with keys from `_locales/*/messages.json`
- **Dark mode** — CSS uses `prefers-color-scheme: dark` with CSS custom properties
- **Error handling** — API errors are mapped to user-friendly i18n messages in `lib/utils.js:friendlyError()`

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

The extension runs in Flatpak Thunderbird, so load via XPI, not manifest:

```bash
zip -r forwardemail.xpi manifest.json background/ popup/ options/ lib/ icons/ _locales/ -x '*.git*'
```

Then load `forwardemail.xpi` in `about:debugging` > "Load Temporary Add-on".

## Testing

No automated tests. Manual testing via temporary add-on in Thunderbird:
1. Package as XPI (see above)
2. Load in `about:debugging`
3. Test all CRUD operations against a real ForwardEmail account

## Localization

When adding user-visible strings:
1. Add key to `_locales/en/messages.json`
2. Add German translation to `_locales/de/messages.json`
3. Use `data-i18n="key"` attribute in HTML or `browser.i18n.getMessage('key')` in JS

## Planned Phases (not yet implemented)

- **Phase 2**: Compose integration / identity sync
- **Phase 3**: Message display integration, vacation responder
