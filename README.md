# ForwardEmail Alias Manager — Thunderbird Extension

Manage your [ForwardEmail](https://forwardemail.net) aliases directly from Thunderbird.

## Features

- View and search all aliases across your domains
- Create, edit, and delete aliases
- Quick enable/disable toggle per alias
- Type badges: Direct, Catch-all, Regex
- Generate IMAP/SMTP passwords
- Dark mode support
- English and German localization

## Requirements

- Thunderbird **128+** (Manifest V3 MailExtension)
- A ForwardEmail account with an API token

## Getting an API Token

1. Log in to [forwardemail.net](https://forwardemail.net)
2. Go to **My Account** > **Security** ([direct link](https://forwardemail.net/my-account/security))
3. Scroll to **API Tokens**
4. Click **Generate** to create a new token
5. Copy the token — you'll paste it into the extension settings

## Installation (Development)

1. Open Thunderbird
2. Go to **Tools** > **Developer Tools** > **Debug Add-ons** (or navigate to `about:debugging`)
3. Click **Load Temporary Add-on...**
4. Select the `manifest.json` file from this directory
5. The extension icon appears in the toolbar

## Setup

1. Click the gear icon in the popup (or go to the extension's options page)
2. Paste your API token
3. Click **Test Connection** to verify
4. Click **Save**

## Usage

- Click the toolbar icon to open the popup
- Select a domain from the dropdown
- Browse, search, and manage your aliases
- Click an alias to view/edit details
- Use the toggle to quickly enable/disable aliases
- Click **+ New Alias** to create one

## Project Structure

```
├── manifest.json          # Extension manifest (Manifest V3)
├── background/
│   └── background.js      # Message handler, API + cache orchestration
├── popup/
│   ├── popup.html         # Main toolbar popup
│   ├── popup.js           # Popup logic (list, detail, create views)
│   └── popup.css          # Popup styles with dark mode
├── options/
│   ├── options.html       # Settings / login page
│   ├── options.js         # Settings logic
│   └── options.css        # Settings styles with dark mode
├── lib/
│   ├── api.js             # ForwardEmail REST API client
│   ├── cache.js           # TTL cache (domains: 5min, aliases: 2min)
│   └── utils.js           # Alias type detection, formatting helpers
├── icons/                 # Extension icons (16/32/48/64px)
└── _locales/
    ├── en/messages.json   # English strings
    └── de/messages.json   # German strings
```

## No Build Step Required

This extension uses plain ES6 modules — no npm, no bundler, no build step. Load it directly into Thunderbird.

## License

MIT
