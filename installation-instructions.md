# Chrome Proxy Switcher Extension Installation Guide

This extension allows you to easily switch between different proxy configurations in Chrome without affecting system-wide settings.

## Directory Structure

Create a directory with the following structure:

```
proxy-switcher/
├── manifest.json
├── popup.html
├── popup.js
├── background.js
├── styles.css
└── images/
    └── icon.png
```

## Installation Steps

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" using the toggle in the top-right corner
3. Click "Load unpacked" and select your `proxy-switcher` directory
4. The extension should now appear in your Chrome toolbar

## Usage

1. Click on the extension icon to open the popup
2. Add proxy configurations with a name, type, host, and port
3. Click "Use This Proxy" to activate a saved configuration
4. Click "Use Direct Connection" to disable all proxies

## Troubleshooting

If the extension doesn't work:

1. Check the browser console for errors:
   - Right-click the extension icon and select "Inspect popup"
   - Go to the Console tab to see any JavaScript errors

2. Verify your proxy server is working:
   - Test it with another tool like curl
   - Make sure the proxy server is accessible from your machine

3. Check Chrome's proxy settings:
   - Go to `chrome://net-internals/#proxy`
   - Confirm the proper configuration is being applied

4. Check permissions:
   - From `chrome://extensions/`, click "Details" on your extension
   - Ensure all required permissions are granted

## Debugging

For more detailed debugging:

1. In `background.js`, the extension logs information to the console
2. Access this by going to `chrome://extensions/`, finding your extension, and clicking "background page" under "Inspect views"
3. The Console tab will show the logs generated during operation
