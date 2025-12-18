# Spell & Grammar Corrector Browser Extension

A modern browser extension for developers to check spelling and grammar on web pages using DeepSeek AI via OpenRouter API.

## Features

- ✅ **Spell Checking** - Detect and highlight spelling errors
- ✅ **Grammar Checking** - Identify grammar mistakes
- ✅ **Toggle Controls** - Enable/disable spell and grammar checking independently
- ✅ **Alternative Suggestions** - Get multiple word suggestions for errors
- ✅ **Modern UI** - Beautiful, intuitive interface
- ✅ **API Key Management** - Easy settings page to configure your API key
- ✅ **Cross-Browser** - Works on Chrome, Edge, Firefox (Manifest V3)

## Installation

### From Source

1. Clone this repository:
```bash
git clone https://github.com/joelnithushan/Spell-Grammar-Corrector-Browser-Extension-For-Developers-.git
cd Spell-Grammar-Corrector-Browser-Extension-For-Developers-
```

2. **Chrome/Edge:**
   - Open `chrome://extensions/` or `edge://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension directory

3. **Firefox:**
   - Open `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on"
   - Select the `manifest.json` file

## Setup

1. Get your DeepSeek API key from [OpenRouter](https://openrouter.ai/keys)
2. Click the extension icon
3. Click "Settings"
4. Enter your API key
5. Optionally test the API key
6. Save settings

## Usage

1. Navigate to any web page
2. Click the extension icon
3. Toggle Spell Check and/or Grammar Check as needed
4. Click "Check Page" to analyze the page
5. Click on highlighted errors to see suggestions
6. Click a suggestion to replace the word

## Development

### Project Structure

```
├── manifest.json       # Extension manifest (Manifest V3)
├── popup.html         # Extension popup UI
├── popup.css          # Popup styles
├── popup.js           # Popup logic
├── settings.html      # Settings page
├── settings.css       # Settings styles
├── settings.js        # Settings logic
├── background.js      # Service worker for API calls
├── content.js         # Content script for page analysis
├── content.css        # Content script styles
└── icons/            # Extension icons
```

### Technologies

- **Manifest V3** - Latest extension standard
- **DeepSeek AI** - Via OpenRouter API
- **Vanilla JavaScript** - No frameworks required
- **Modern CSS** - Gradient designs and smooth animations

## API Key

This extension uses the DeepSeek model through OpenRouter. You need to:
1. Sign up at [OpenRouter](https://openrouter.ai)
2. Create an API key
3. Add credits to your account
4. Configure the key in extension settings

## Contributing

Contributions are welcome! Please follow conventional commit messages:
- `feat:` for new features
- `fix:` for bug fixes
- `style:` for styling changes
- `docs:` for documentation
- `refactor:` for code refactoring

## License

MIT License

## Support

For issues and feature requests, please open an issue on GitHub.

