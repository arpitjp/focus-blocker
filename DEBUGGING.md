# How to Debug the Extension

## Step 1: Open the Background Script Console

1. Open Chrome and go to: `chrome://extensions/`
2. Find "Focus - website blocker" extension
3. Look for "service worker" link (it might say "background page" or show an "Inspect views: service worker" link)
4. Click on that link - this opens a NEW console window for the background script
5. You should see: `🚀 Background script loaded!`

## Step 2: Test the Extension

1. Open the extension popup (click the extension icon in toolbar)
2. Add `youtube.com` to blocked sites
3. Toggle blocking ON
4. Go back to the service worker console - you should see logs

## Step 3: Check if Rules are Created

In the service worker console, you should see:
- `=== BLOCKING RULES UPDATE ===`
- `Blocking enabled: true`
- `Blocked sites: ["youtube.com"]`
- `Creating rule for site: youtube.com`
- `✅ Rules updated successfully!`
- `✅ Current active rules: 1`

## If You Don't See the Service Worker Link

1. Make sure "Developer mode" is ON (toggle in top right of chrome://extensions/)
2. Reload the extension (click the circular arrow icon)
3. The service worker link should appear

## Alternative: Check Popup Console

1. Right-click the extension icon → "Inspect popup"
2. This opens the popup console (different from background)
3. You'll see popup logs here, but blocking happens in background script

