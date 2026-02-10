# Chrome Extension for The Open Source Explorer

This is a Chrome extension and bookmarklet that provides additional contributor information on Github pull requests pages. Data is from the Open Source Explorer (https://explore.market.dev).

## Features

- Runs only on PR detail pages.
- Flags PRs opened by non-experts.
- Shows expert details when the opener is an expert.

## Extension setup

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click "Load unpacked" and select `chrome-plugin`.
4. Open a GitHub pull request page and configure the panel.

## Bookmarklet setup

1. Open `chrome-plugin/bookmarklet.js` and copy the file contents.
2. Create a new bookmark and paste this into the URL field:

```text
javascript:(PASTE_THE_FILE_CONTENTS_HERE)
```

Tip: remove newlines to keep it short.

If the bookmarklet fails, it is likely due to CORS restrictions. The Chrome extension avoids this limitation.

## Configuration notes

- `API base URL` should point to a Market.dev host (default: `https://explore.market.dev`).
- `API key` should be a valid `MARKET_API_KEY`.
