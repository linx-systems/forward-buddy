# Privacy Policy — ForwardEmail Alias Manager

**Last updated:** 2026-03-08

## Overview

ForwardEmail Alias Manager is a Thunderbird extension that lets you manage your ForwardEmail aliases. This policy explains what data the extension accesses and how it is handled.

## Data Collected

The extension does **not** collect, store, or transmit any data to the extension developer or any third party.

## Data Stored Locally

The following data is stored locally in Thunderbird's extension storage (`browser.storage.local`):

- **API token** — Your ForwardEmail API token, entered manually by you in the settings page. This is stored locally and never shared with anyone other than the ForwardEmail API.

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

- You can revoke access at any time by removing your API token from the extension settings or uninstalling the extension.
- Removing the extension deletes all locally stored data.

## Changes

If this policy changes, the update will be published alongside the extension update with a new "last updated" date.

## Contact

If you have questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/rooki/forward-buddy).
