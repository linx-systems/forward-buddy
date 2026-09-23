**ForwardEmail Alias Manager**

Manage your **Forward Email** aliases directly from Thunderbird.

**A Forward Email account and an API token are required.** This extension works with the Forward Email service at [forwardemail.net](https://forwardemail.net); it does not create an account, domain, or aliases for you.

**What it does**

ForwardEmail Alias Manager connects Thunderbird to your Forward Email account so that you can view and manage aliases for your Forward Email domains without leaving your mail client. It provides:

- A compact alias-management panel in the Thunderbird toolbar
- Alias creation, search, editing, enable/disable controls, password generation, and deletion
- Per-alias settings for recipients, descriptions, labels, IMAP storage, PGP encryption, recipient verification, vacation responders, and filters
- An **Alias Check** panel while reading a message, showing the Forward Email aliases that match that message's recipient addresses

**Before you begin**

You need:

1. A Forward Email account at [forwardemail.net](https://forwardemail.net)
2. At least one domain available in that account
3. A Forward Email API token

**Get an API token**

1. Sign in to your Forward Email account.
2. Open [forwardemail.net/my-account/security](https://forwardemail.net/my-account/security).
3. Scroll to the **API Tokens** section.
4. Select **Generate** to create a token, then copy it.
5. Keep the token private. It authorizes this extension to manage your Forward Email aliases.

**First-time setup**

1. In Thunderbird, open the extension's **Settings** page using either method below:
   - Click the **ForwardEmail Alias Manager** button in the Thunderbird toolbar, then click the gear button in the panel. If no token has been configured, click **Open Settings** instead.
   - Open Thunderbird's Add-ons Manager, select the **ForwardEmail Alias Manager** extension, and open its **Settings** or **Preferences** page.
2. Paste the Forward Email API token into the **API Token** field.
3. Select **Test Connection** to check the token and account connection.
4. Select **Save**.

The settings page lets you replace or update the saved token later. It also includes a Demo Mode intended for showing sample data; turn it off to manage your real Forward Email aliases.

**Manage aliases from the Thunderbird toolbar**

Click the **ForwardEmail Alias Manager** button in Thunderbird's main toolbar to open the alias-management panel.

1. Use the domain selector at the top of the panel to choose one of your Forward Email domains.
2. Search the displayed aliases with the **Search aliases** field.
3. Click **New Alias** to create an alias. Enter its name, select a domain, add one recipient per line, and optionally add a description, comma-separated labels, or IMAP storage. Use an asterisk (*) as the name for a catch-all alias, or a slash-delimited pattern (/pattern/) for a pattern-matching alias.
4. Click an alias to open its details. From there you can update its enabled state, recipients, description, labels, IMAP storage, PGP encryption, recipient verification, and vacation responder settings, then select **Save Changes**.
5. For an existing alias, you can generate and copy a password, manage its filters, or delete it after confirmation.

The list also provides an enable/disable switch for alias types that Forward Email allows to be toggled.

**Check aliases while reading a message**

When you are viewing an email in a Thunderbird message tab or message window, use the **ForwardEmail Alias Manager** button in the message-display toolbar to open **Alias Check**.

Alias Check examines the currently displayed message's recipient fields (To, Cc, and Bcc) and shows any matching Forward Email aliases. For each match, it shows the matching address, alias type, domain, and configured recipients (or IMAP storage where applicable). It also provides the available actions for that match:

- For a direct alias, block or unblock the alias
- For a catch-all or pattern-matching alias, block the specific matched address or block/unblock the catch-all or pattern alias
- Open the matched alias in an edit window for full alias settings

If the displayed message has no matching Forward Email alias, Alias Check clearly reports that no match was found.

**Notes**

- The extension only manages data in the Forward Email account associated with the saved API token.
- Changes made in the extension are sent to the Forward Email service and affect the selected Forward Email domain and alias.
- To use a different Forward Email account or token, return to the extension's Settings page and save the new API token.
