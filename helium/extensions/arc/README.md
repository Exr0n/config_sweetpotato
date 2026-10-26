# Arc for Chrome

The parts of the [Arc browser](https://arc.net) worth keeping, as a small Chrome extension: a keyboard-first command palette for tabs, bookmarks and actions, and a hold-to-peek quick tab switcher.

No build step, no dependencies, no analytics. Six files.

## Features

### Command palette

`Cmd+Shift+K` (Mac) / `Ctrl+Shift+K` (Windows, Linux)

- Open it with nothing typed and you get your **recent tabs**, **favorites** (the bookmarks bar) and the last few **recently closed** tabs, so the most common jumps are one keystroke away.
- Type to search **saved workspaces, open tabs, all bookmarks, actions, recently closed tabs and history**. Results are grouped in that order, ranked by how well they match, with matched text highlighted. In an unscoped search, history only lists pages that are not already shown as a tab, bookmark or closed tab.
- Type **`@`** to choose a search scope, or enter one directly: `@tabs`, `@bookmarks`, `@history`, `@actions`, `@closed`, or `@workspaces`. For example, `@bookmarks github` keeps tabs from crowding out your bookmarks. A scope on its own shows its first nine entries.
- Press **`→`** on a result (with the caret at the end of the search), or click its **`›`** button, to open its actions. Tabs support pin/unpin, mute/unmute, duplicate, move to a new window, copy URL, and close. Bookmarks, history and closed tabs support opening in a new tab/window and copying the URL. **`←`** or **`Esc`** returns to your search and selection.
- Picking a **recently closed** tab restores it with its back/forward history, in the window it came from.
- The palette shows up to nine results. Hold **`⌘`** (`Ctrl` on Windows and Linux) to show a number in place of each icon. Tap the digit to jump straight to that result without arrowing.
- A site that is both open and bookmarked shows up twice: the tab (jump to it) and the bookmark (open a fresh copy).
- Bookmark title matches rank above address-only matches, both in normal searches and in `@bookmarks`.
- Abbreviations work: `gcal` finds "Google Calendar".
- No match? In an unscoped search, `Enter` opens the text as a URL if it looks like one, otherwise searches with your chosen engine. Scoped searches stay in the palette.
- Works on every page. On a **blank new tab** or a `chrome://` page it opens as the toolbar popup, which is the only place Chrome lets keyboard focus leave the omnibox (see [How it works](#how-it-works)).
- Dark by default. Settings can switch it to light or follow the system.
- Both the keyboard shortcut and toolbar icon open the in-page palette on supported webpages. The toolbar popup is a fallback for new tabs and pages that cannot host the overlay.

| Key | Action |
|-----|--------|
| `↑` `↓` / `Tab` `⇧Tab` / `Ctrl+N` `Ctrl+P` | Move selection |
| `Enter` | Switch to tab, open bookmark or history entry, reopen closed tab, run action |
| `⌘1`–`⌘9` (`Ctrl+1`–`Ctrl+9` elsewhere) | Jump to that result. Hold the modifier to see the numbers |
| `⇧Enter` | Open bookmark in the current tab instead of a new one |
| `Tab` on an action with settings | Open its settings |
| `→` on a result | Open its action menu |
| `←` / `Esc` in an action menu | Return to the search |
| `⌥W` (Mac) / `Alt+W` | Open Workspaces while the palette is open |
| `Esc` | Clear the query, then close |

### Saved workspaces

Click **Workspaces** in the palette footer, press **`⌥W`** on Mac (**`Alt+W`** elsewhere) while the palette is open, or type `@workspaces`. Choose **Save Workspace**, give it a name, and press `Enter`. You can also find the save command by searching for “save workspace”.

A workspace saves the current window’s tab URLs, order, pinned and muted states, and active tab. Blank tabs and Arc’s own pages are skipped. Workspaces stay on this device across browser restarts; they do not sync with Chrome settings.

Search for a workspace by name, or type something like `open morning`, and press `Enter` to restore it in a new window. Existing windows stay open. This restores the saved URLs, not page contents, back/forward history, or tab groups.

Press `→` on a workspace to open, rename, replace its saved tabs with the current window, or delete it. Replacement and deletion show a confirmation in the palette. Deleting a workspace does not close its open tabs.

### Quick tab switcher

`Ctrl+Q` (all platforms)

Works like `Cmd+Tab` for apps. Tap it to bounce to the previous tab. Hold `Ctrl` and keep tapping `Q` to walk further back through your most recently used tabs, `⇧Q` or `↑` to go the other way, then release `Ctrl` to switch. `Esc` cancels.

The order is tracked per window and survives Chrome suspending the extension, so "the tab I was just on" is always the second entry.

### Actions

Type the name (or a synonym) in the palette.

| Action | What it does |
|--------|--------------|
| **Cleanup** | Closes tabs whose site is not bookmarked, and duplicate tabs of bookmarked sites. Keeps the tab you are on. |
| **Reset** | Closes every tab in the window and opens your reset URL. `Tab` on it to change the URL. |
| **Settings** | Search engine, theme (dark, light, system), reset URL, and a view of your shortcuts. |
| **Save Workspace / Open Workspace** | Save the current window or browse saved workspaces. |
| **Open Bookmarks / History / Downloads / Extensions / Passwords / Chrome Settings** | Jump to the matching `chrome://` page. |
| **Configure Shortcuts** | Opens `chrome://extensions/shortcuts`. |
| **Reload Extension** | Reloads the unpacked extension. Handy while hacking on it. |

Settings sync with your Chrome profile.

## Install

Arc is not on the Chrome Web Store. Load it as an unpacked extension:

1. Clone this repo.
2. On macOS run `./install.sh`. It copies the folder path to your clipboard and opens `chrome://extensions`.
   Elsewhere, open `chrome://extensions` yourself.
3. Turn on **Developer mode**, click **Load unpacked**, pick the folder.
4. Check `chrome://extensions/shortcuts`. Chrome only assigns the suggested keys if nothing else uses them, and the palette will nag you until both are set.

To update, `git pull` and click the reload icon on the Arc card (or run the **Reload Extension** action). Needs Chrome 121 or newer.

## How it works

- `background.js` is a Manifest V3 service worker. It owns the MRU tab order (kept in `chrome.storage.session` so it survives the worker being suspended), a cached, flattened bookmark list that is invalidated by bookmark events, and all tab, bookmark and window operations.
- `search.js` is the ranking. Pure functions, no Chrome APIs, so it is unit tested with `node --test`.
- `palette.js` is the entire UI, and it runs in three places from a single code path:
  - **Overlay.** Injected into the current page on demand with `chrome.scripting` (only `activeTab`, no host permissions, no content scripts on every page). It renders inside a shadow root, so page CSS cannot restyle it and its keystrokes never reach page hotkeys. It is injected once per page and re-used after that.
  - **Popup.** Chrome does not allow content scripts on a blank new tab, `chrome://` pages, the Web Store or PDFs, and a new tab keeps keyboard focus in the omnibox no matter what a page does. These pages use the toolbar popup as a fallback. Over a blank tab it behaves like Arc's new-tab command bar: picking a tab switches to it and closes the blank tab, and a bookmark or search loads in the blank tab. On supported webpages, both the shortcut and toolbar click prefer the overlay, including when the webpage initially lacks focus.
  - **Page.** `palette.html` is the same UI as a full page. It is the fallback where `chrome.action.openPopup()` is unavailable.
- Favicons come from Chrome's own favicon cache through the `_favicon` API, which works under strict page Content Security Policies (where third-party icon services get blocked) and never leaves the machine.

## Development

```sh
node --test test/*.test.js           # search, actions and workspace tests

# End-to-end smoke test in a throwaway profile. Needs puppeteer-core on the
# module path and a Chromium build that still supports --load-extension
# (Chrome for Testing, Chromium, Canary; the branded Chrome 137+ does not).
CHROME_PATH=/path/to/chromium node test/smoke.js
```

A real shortcut press grants `activeTab`; a programmatic command does not, so the smoke test runs a temporary copy of the extension with a host permission for its local test server. The shipped manifest is untouched. The test covers injection and re-use, search and highlighting, tab-plus-bookmark results, favicons under CSP, quick switch by modifier release, MRU persistence across a worker restart, the new-tab takeover, the `chrome://` fallback, scopes and the nine-result cap, result actions, and saving, renaming, restoring and deleting workspaces.

## Permissions

| Permission | Why |
|------------|-----|
| `tabs` | Read tab titles and URLs for search; switch tabs |
| `bookmarks` | Search bookmarks and show the bookmarks bar as favorites |
| `activeTab`, `scripting` | Inject the palette into the current page when you press the shortcut |
| `favicon` | Chrome's local favicon cache |
| `storage` | Settings (sync), MRU order (session), and saved workspaces (local) |

No host permissions, no network requests other than navigations you ask for.

## Why "Arc"?

Arc had genuinely good ideas about getting around a browser with a keyboard. When it was wound down I wanted to keep those habits without leaving Chrome. This extension is the command bar and the tab switcher, which turned out to be the parts I actually missed.

## Contributing

Fork it, hack on it, send a PR. Keep it dependency-free.

## License

MIT
