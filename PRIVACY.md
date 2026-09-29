# Privacy Policy — ForwardMail Buddy

**Last updated:** 2026-09-29

## Overview

ForwardMail Buddy is a Thunderbird extension that lets you manage your ForwardEmail aliases. This policy explains what data the extension accesses and how it is handled.

## Data Collected

The extension does **not** collect, store, or transmit any data to the extension developer or any third party.

## Data Stored Locally

The following data is stored locally in Thunderbird's extension storage (`browser.storage.local`):

| Data | Purpose | Removal |
|---|---|---|
| **`apiToken`** | Authenticates direct requests to the ForwardEmail API. | **Disconnect** removes it locally. You must revoke the token from ForwardEmail separately if you no longer want it to be valid. |
| **`accountEmail`** | Identifies the connected ForwardEmail account in the extension UI. | **Disconnect** removes it. |
| **`accountPlan`** | Displays the connected account's plan in the extension UI. | **Disconnect** removes it. |
| **`lastDomain`** | Restores the most recently selected domain. | **Disconnect** removes it. |
| **Demo Mode setting** | Remembers whether the optional in-memory demo experience is enabled after the extension background process restarts. | Turn off Demo Mode in Settings, or remove the extension. |
| **Bounded audit history** | Records significant extension actions and outcomes so you can review local activity and failures. The history is size-limited. | **Clear History** removes it. Disconnect does not remove it. |

Audit history intentionally excludes API tokens, generated passwords, alias recipients, raw Sieve content, and raw API payloads.

## Data Transmitted to ForwardEmail

When you use the extension, it communicates directly with the **ForwardEmail API** (`https://api.forwardemail.net`) using your API token. The following data is exchanged:

| Action | Data sent | Data received |
|---|---|---|
| Test connection | API token (HTTP Basic Auth) | Account info (email, plan) |
| List domains | API token | Your domain names |
| List aliases | API token, domain name | Alias details (name, recipients, settings) |
| Create alias | API token, alias configuration | Created alias |
| Update alias | API token, updated fields | Updated alias |
| Delete alias | API token, alias ID | Confirmation |
| Generate password | API token, alias ID | Generated IMAP/SMTP password |

All communication uses **HTTPS** encryption. The extension authenticates via HTTP Basic Auth with your API token.

## Message Reading

The extension uses the `messagesRead` permission solely to read the recipient addresses of the currently displayed email message. This is used to check whether any of your ForwardEmail aliases match the message. **No message content is read, stored, or transmitted.**

## Third Parties

- The extension communicates **only** with `api.forwardemail.net` — no analytics, tracking, or other third-party services are used.
- No data is sold, shared, or disclosed to any party beyond what is described above.

## Your Control

- **Disconnect** in Settings removes the locally stored API token, account email, account plan, and selected-domain context. It also invalidates the extension's account caches.
- **Clear History** in Settings removes the bounded local audit history without disconnecting your account.
- Disconnecting removes only this extension's local credentials; it does **not** revoke the API token at ForwardEmail. To revoke the token, use the [ForwardEmail Security page](https://forwardemail.net/my-account/security).
- You can also uninstall the extension, which deletes all locally stored extension data.

## Changes

If this policy changes, the update will be published alongside the extension update with a new "last updated" date.

## Contact

If you have questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/rooki/forward-buddy).
