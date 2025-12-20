# Spell & Grammar Corrector for Developers

A production-ready browser extension that uses AI to check spelling and grammar on web pages. Built for developers, tech leads, and product managers.

## Features

- ✅ **AI-Powered Analysis** - Uses Gemini or DeepSeek AI for accurate error detection
- ✅ **Non-Intrusive** - Never modifies webpage content, only displays results in extension UI
- ✅ **Dual Provider Support** - Choose between Google Gemini or DeepSeek (via OpenRouter)
- ✅ **Smart Highlighting** - Click errors in the extension to highlight them on the page
- ✅ **Developer-Friendly** - Clean codebase, proper error handling, comprehensive logging

## Installation

1. Clone or download this repository
2. Open Chrome/Edge and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the extension directory
5. Configure your API key in the extension settings

## Setup

### Get API Keys

**For DeepSeek (via OpenRouter):**
1. Visit [OpenRouter](https://openrouter.ai/keys)
2. Create an account and generate an API key
3. Keys start with `sk-`

**For Google Gemini:**
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create an API key
3. Keys start with `AIza`

### Configure Extension

1. Click the extension icon
2. Click "Settings"
3. Select your preferred API provider
4. Enter your API key
5. Click "Test API Key" to verify
6. Click "Save Settings"

## Usage

1. Navigate to any webpage you want to check
2. Click the extension icon
3. Enable "Spell Check" and/or "Grammar Check" toggles
4. Click "Analyze Page"
5. Review errors in the extension popup
6. Click any error to highlight it on the page

## Architecture

- **manifest.json** - Extension configuration (Manifest V3)
- **background.js** - Service worker for API communication
- **content.js** - Content script for text extraction and highlighting
- **popup.html/js/css** - Extension popup UI
- **settings.html/js/css** - Settings page for configuration

## Development

The extension is built with:
- Manifest V3
- Vanilla JavaScript (no frameworks)
- Modern ES6+ features
- Clean, maintainable code structure

## License

MIT License



