// Popup Script
// Handles UI interactions and coordinates with content script

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const spellToggle = document.getElementById('spellToggle');
  const grammarToggle = document.getElementById('grammarToggle');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const testApiBtn = document.getElementById('testApiBtn');
  const status = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const errorsContainer = document.getElementById('errorsContainer');
  const errorsList = document.getElementById('errorsList');
  const errorCount = document.getElementById('errorCount');
  const info = document.getElementById('info');
  const controls = document.getElementById('controls');
  const settingsLink = document.getElementById('settingsLink');
  
  // Load saved settings
  const settings = await chrome.storage.sync.get(['spellEnabled', 'grammarEnabled']);
  spellToggle.checked = settings.spellEnabled !== false;
  grammarToggle.checked = settings.grammarEnabled !== false;
  
  // Save toggle states
  spellToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ spellEnabled: spellToggle.checked });
  });
  
  grammarToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ grammarEnabled: grammarToggle.checked });
  });
  
  // Settings link
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  
  // Analyze button
  analyzeBtn.addEventListener('click', async () => {
    await analyzePage();
  });
  
  // Test API button
  testApiBtn.addEventListener('click', async () => {
    await testAPI();
  });
  
  /**
   * Analyzes the current page
   */
  async function analyzePage() {
    // Validate toggles
    if (!spellToggle.checked && !grammarToggle.checked) {
      showStatus('Please enable at least one option', 'error');
      return;
    }
    
    // Check API key
    const config = await chrome.storage.sync.get(['apiKey', 'geminiApiKey', 'apiProvider']);
    const provider = config.apiProvider || 'deepseek';
    const apiKey = provider === 'gemini' ? config.geminiApiKey : config.apiKey;
    
    if (!apiKey || !apiKey.trim()) {
      showStatus('API key not configured. Please set it in Settings.', 'error');
      setTimeout(() => chrome.runtime.openOptionsPage(), 2000);
      return;
    }
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if page is valid
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('edge://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('moz-extension://')) {
      showStatus('Cannot analyze this page type', 'error');
      return;
    }
    
    // Hide UI elements
    controls.style.display = 'none';
    info.style.display = 'none';
    errorsContainer.style.display = 'none';
    showStatus('Analyzing page...', 'info');
    analyzeBtn.disabled = true;
    
    try {
      // Ensure content script is loaded
      await ensureContentScript(tab.id);
      
      // Send analyze message
      const response = await sendMessage(tab.id, {
        action: 'analyzePage',
        options: {
          spellEnabled: spellToggle.checked,
          grammarEnabled: grammarToggle.checked
        }
      });
      
      analyzeBtn.disabled = false;
      controls.style.display = 'block';
      
      if (response && response.success) {
        if (response.errorCount > 0 && response.errors && response.errors.length > 0) {
          displayErrors(response.errors, tab.id);
        } else {
          showStatus('No errors found! ✓', 'success');
          info.style.display = 'block';
          info.textContent = 'The page appears to be error-free.';
        }
      } else {
        showStatus(response?.error || 'Analysis failed', 'error');
        info.style.display = 'block';
      }
    } catch (error) {
      analyzeBtn.disabled = false;
      controls.style.display = 'block';
      showStatus('Error: ' + error.message, 'error');
      console.error('Analysis error:', error);
    }
  }
  
  /**
   * Tests API connection
   */
  async function testAPI() {
    const config = await chrome.storage.sync.get(['apiKey', 'geminiApiKey', 'apiProvider']);
    const provider = config.apiProvider || 'deepseek';
    const apiKey = provider === 'gemini' ? config.geminiApiKey : config.apiKey;
    
    if (!apiKey || !apiKey.trim()) {
      showStatus('API key not configured', 'error');
      return;
    }
    
    showStatus('Testing API connection...', 'info');
    testApiBtn.disabled = true;
    
    try {
      let response;
      if (provider === 'gemini') {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        response = await fetch('https://openrouter.ai/api/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });
      }
      
      if (response.ok) {
        showStatus(`✓ ${provider === 'gemini' ? 'Gemini' : 'DeepSeek'} API connected!`, 'success');
      } else {
        const error = await response.json().catch(() => ({}));
        showStatus(`✗ API test failed: ${error.error?.message || 'Invalid key'}`, 'error');
      }
    } catch (error) {
      showStatus(`✗ Connection error: ${error.message}`, 'error');
    } finally {
      testApiBtn.disabled = false;
      setTimeout(() => {
        if (status.style.display === 'block') {
          status.style.display = 'none';
        }
      }, 3000);
    }
  }
  
  /**
   * Displays errors in the UI
   */
  function displayErrors(errors, tabId) {
    errorsContainer.style.display = 'block';
    info.style.display = 'none';
    errorCount.textContent = errors.length;
    errorsList.innerHTML = '';
    
    errors.forEach(error => {
      const item = document.createElement('div');
      item.className = 'error-item';
      item.dataset.errorId = error.id;
      
      const typeBadge = document.createElement('span');
      typeBadge.className = `error-type-badge ${error.type}`;
      typeBadge.textContent = error.type.toUpperCase();
      
      const correction = document.createElement('div');
      correction.className = 'error-correction';
      const primarySuggestion = error.suggestions && error.suggestions.length > 0 
        ? error.suggestions[0] 
        : 'No suggestion';
      correction.innerHTML = `
        <span class="word-original">${escapeHtml(error.word)}</span>
        <span class="word-arrow">→</span>
        <span class="word-suggestion">${escapeHtml(primarySuggestion)}</span>
      `;
      
      const context = document.createElement('div');
      context.className = 'error-context';
      if (error.context) {
        const contextText = error.context;
        const wordIndex = contextText.toLowerCase().indexOf(error.word.toLowerCase());
        if (wordIndex >= 0) {
          const before = contextText.substring(0, wordIndex);
          const word = contextText.substring(wordIndex, wordIndex + error.word.length);
          const after = contextText.substring(wordIndex + error.word.length);
          context.innerHTML = `${escapeHtml(before)}<span class="highlight">${escapeHtml(word)}</span>${escapeHtml(after)}`;
        } else {
          context.textContent = contextText;
        }
      }
      
      item.appendChild(typeBadge);
      item.appendChild(correction);
      item.appendChild(context);
      
      item.addEventListener('click', async () => {
        // Highlight on page
        try {
          await sendMessage(tabId, {
            action: 'highlightError',
            errorId: error.id
          });
          
          // Update UI
          document.querySelectorAll('.error-item').forEach(el => {
            el.classList.remove('active');
          });
          item.classList.add('active');
        } catch (error) {
          console.error('Error highlighting:', error);
        }
      });
      
      errorsList.appendChild(item);
    });
  }
  
  /**
   * Shows status message
   */
  function showStatus(message, type = 'info') {
    status.style.display = 'block';
    status.className = `status ${type}`;
    statusText.textContent = message;
  }
  
  /**
   * Ensures content script is loaded
   */
  async function ensureContentScript(tabId) {
    try {
      // Check if script is loaded
      const check = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => typeof window.spellGrammarChecker !== 'undefined'
      }).catch(() => null);
      
      if (!check || !check[0]?.result) {
        // Inject script
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        await chrome.scripting.insertCSS({
          target: { tabId },
          files: ['content.css']
        });
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      // Script might already be injected via manifest
      console.log('Content script check:', error.message);
    }
  }
  
  /**
   * Sends message to content script
   */
  function sendMessage(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
  
  /**
   * Escapes HTML
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});

