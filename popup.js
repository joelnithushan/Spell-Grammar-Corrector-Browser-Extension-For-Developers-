// Load saved settings
document.addEventListener('DOMContentLoaded', async () => {
  const spellToggle = document.getElementById('spellToggle');
  const grammarToggle = document.getElementById('grammarToggle');
  const checkBtn = document.getElementById('checkBtn');
  const status = document.getElementById('status');
  const errorsContainer = document.getElementById('errorsContainer');
  const errorsList = document.getElementById('errorsList');
  const errorCount = document.getElementById('errorCount');
  const info = document.getElementById('info');
  const statusText = document.getElementById('statusText');
  const settingsLink = document.getElementById('settingsLink');
  const controls = document.getElementById('controls');
  const testApiBtn = document.getElementById('testApiBtn');

  // Load saved toggle states
  const result = await chrome.storage.sync.get(['spellEnabled', 'grammarEnabled']);
  spellToggle.checked = result.spellEnabled !== false; // Default to true
  grammarToggle.checked = result.grammarEnabled !== false; // Default to true

  // Save toggle states
  spellToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ spellEnabled: spellToggle.checked });
  });

  grammarToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ grammarEnabled: grammarToggle.checked });
  });

  // Check page button
  checkBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!spellToggle.checked && !grammarToggle.checked) {
      status.style.display = 'block';
      status.style.background = '#fef2f2';
      statusText.textContent = 'Please enable at least one option';
      statusText.style.color = '#991b1b';
      return;
    }

    // Check if API key is set
    const settings = await chrome.storage.sync.get(['apiKey', 'geminiApiKey', 'apiProvider']);
    const apiProvider = settings.apiProvider || 'deepseek';
    const apiKey = apiProvider === 'deepseek' ? settings.apiKey : settings.geminiApiKey;
    
    if (!apiKey) {
      status.style.display = 'block';
      status.style.background = '#fef2f2';
      statusText.textContent = 'API key not set. Please configure in Settings.';
      statusText.style.color = '#991b1b';
      setTimeout(() => {
        chrome.runtime.openOptionsPage();
      }, 2000);
      return;
    }

    // Check if URL is valid for content scripts
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || 
        tab.url.startsWith('chrome-extension://') || tab.url.startsWith('moz-extension://')) {
      status.style.display = 'block';
      status.style.background = '#fef2f2';
      statusText.textContent = 'Cannot check this page type';
      statusText.style.color = '#991b1b';
      return;
    }

    // Hide controls and info, show status
    controls.style.display = 'none';
    info.style.display = 'none';
    status.style.display = 'block';
    status.style.background = '#f0fdf4';
    statusText.textContent = 'Analyzing page...';
    statusText.style.color = '#166534';
    errorsContainer.style.display = 'none';
    
    try {
      // Try to inject content script if not already loaded
      try {
        // Check if script is already loaded
        const checkScript = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            return typeof window.spellGrammarChecker !== 'undefined';
          }
        }).catch(() => null);
        
        const isLoaded = checkScript && checkScript[0]?.result;
        
        if (!isLoaded) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['content.css']
          });
          await new Promise(resolve => setTimeout(resolve, 300));
        } else {
          console.log('Content script already loaded');
        }
      } catch (injectError) {
        // Script might already be injected via manifest, that's okay
        console.log('Script injection note:', injectError.message);
      }

      // Send check page message
      let response;
      try {
        response = await sendMessagePromise(tab.id, {
          action: 'checkPage',
          spellEnabled: spellToggle.checked,
          grammarEnabled: grammarToggle.checked
        });
      } catch (error) {
        console.error('Error sending message to content script:', error);
        status.style.display = 'block';
        status.style.background = '#fef2f2';
        statusText.textContent = 'Error: ' + (error.message || 'Failed to communicate with page');
        statusText.style.color = '#991b1b';
        info.style.display = 'block';
        controls.style.display = 'block';
        return;
      }

      if (!response) {
        status.style.display = 'block';
        status.style.background = '#fef2f2';
        statusText.textContent = 'Error: No response from page. Please refresh the page and try again.';
        statusText.style.color = '#991b1b';
        info.style.display = 'block';
        controls.style.display = 'block';
        return;
      }

      if (response && response.success) {
        const errorCountValue = response.errorCount || 0;
        
        // Hide status, show results
        status.style.display = 'none';
        controls.style.display = 'block';
        
        if (errorCountValue > 0 && response.errors && response.errors.length > 0) {
          console.log('Displaying', errorCountValue, 'errors');
          displayErrors(response.errors, tab.id);
        } else {
          console.log('No errors found in response');
          info.style.display = 'block';
          info.innerHTML = '<p>No errors found! ✓</p><p style="font-size: 11px; color: #666; margin-top: 4px;">Check browser console (F12) for debug info</p>';
        }
      } else if (response && response.error) {
        status.style.display = 'block';
        status.style.background = '#fef2f2';
        statusText.textContent = 'Error: ' + response.error;
        statusText.style.color = '#991b1b';
        info.style.display = 'block';
        controls.style.display = 'block';
        console.error('Analysis error:', response.error);
      } else {
        console.warn('Unexpected response format:', response);
        status.style.display = 'none';
        info.style.display = 'block';
        controls.style.display = 'block';
        info.innerHTML = '<p>Analysis completed. No errors found.</p><p style="font-size: 11px; color: #666; margin-top: 4px;">Check browser console (F12) for debug info</p>';
      }
    } catch (error) {
      status.style.display = 'block';
      status.style.background = '#fef2f2';
      statusText.textContent = 'Error: ' + error.message;
      statusText.style.color = '#991b1b';
      info.style.display = 'block';
      console.error('Check page error:', error);
    }
  });

  // Settings link
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Test API button
  testApiBtn.addEventListener('click', async () => {
    const settings = await chrome.storage.sync.get(['apiKey', 'geminiApiKey', 'apiProvider']);
    const apiProvider = settings.apiProvider || 'deepseek';
    const apiKey = apiProvider === 'deepseek' ? settings.apiKey : settings.geminiApiKey;
    
    if (!apiKey) {
      status.style.display = 'block';
      status.style.background = '#fef2f2';
      statusText.textContent = 'API key not configured';
      statusText.style.color = '#991b1b';
      setTimeout(() => {
        status.style.display = 'none';
      }, 3000);
      return;
    }

    // Show testing status
    status.style.display = 'block';
    status.style.background = '#eff6ff';
    statusText.textContent = 'Testing API connection...';
    statusText.style.color = '#1e40af';
    testApiBtn.disabled = true;

    try {
      let response;
      if (apiProvider === 'gemini') {
        // Test Gemini API
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
      } else {
        // Test DeepSeek/OpenRouter API
        response = await fetch('https://openrouter.ai/api/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });
      }

      if (response.ok) {
        status.style.background = '#f0fdf4';
        statusText.textContent = `✓ ${apiProvider === 'gemini' ? 'Gemini' : 'DeepSeek'} API connected successfully!`;
        statusText.style.color = '#166534';
      } else {
        const error = await response.json().catch(() => ({}));
        status.style.background = '#fef2f2';
        statusText.textContent = `✗ API test failed: ${error.error?.message || 'Invalid API key'}`;
        statusText.style.color = '#991b1b';
      }
    } catch (error) {
      status.style.background = '#fef2f2';
      statusText.textContent = `✗ Connection error: ${error.message}`;
      statusText.style.color = '#991b1b';
    } finally {
      testApiBtn.disabled = false;
      setTimeout(() => {
        if (status.style.display === 'block') {
          status.style.display = 'none';
        }
      }, 5000);
    }
  });

  function displayErrors(errors, tabId) {
    errorsContainer.style.display = 'block';
    info.style.display = 'none';
    errorCount.textContent = errors.length;
    errorsList.innerHTML = '';

    errors.forEach(error => {
      const errorItem = document.createElement('div');
      errorItem.className = 'error-item';
      errorItem.dataset.errorId = error.id;

      // Type badge
      const typeBadge = document.createElement('div');
      typeBadge.className = `error-type-badge ${error.type}`;
      typeBadge.textContent = error.type.toUpperCase();
      errorItem.appendChild(typeBadge);

      // Correction format: original → suggestion
      const primarySuggestion = error.suggestions && error.suggestions.length > 0 
        ? error.suggestions[0] 
        : 'No suggestion';
      
      const correctionDiv = document.createElement('div');
      correctionDiv.className = 'error-correction';
      correctionDiv.innerHTML = `
        <span class="word-original">${escapeHtml(error.word)}</span>
        <span class="word-arrow">→</span>
        <span class="word-suggestion">${escapeHtml(primarySuggestion)}</span>
      `;
      errorItem.appendChild(correctionDiv);

      // Context
      if (error.context) {
        const contextDiv = document.createElement('div');
        contextDiv.className = 'error-context';
        // Highlight the error word in context
        const contextText = error.context;
        const wordIndex = contextText.toLowerCase().indexOf(error.word.toLowerCase());
        if (wordIndex >= 0) {
          const before = contextText.substring(0, wordIndex);
          const word = contextText.substring(wordIndex, wordIndex + error.word.length);
          const after = contextText.substring(wordIndex + error.word.length);
          contextDiv.innerHTML = `${escapeHtml(before)}<span class="highlight">${escapeHtml(word)}</span>${escapeHtml(after)}`;
        } else {
          contextDiv.textContent = contextText;
        }
        errorItem.appendChild(contextDiv);
      }

      // Click to highlight on page
      errorItem.addEventListener('click', async () => {
        try {
          await sendMessagePromise(tabId, {
            action: 'highlightError',
            errorId: error.id
          });
          // Highlight clicked item
          document.querySelectorAll('.error-item').forEach(item => {
            item.style.background = 'white';
          });
          errorItem.style.background = '#f0f9ff';
        } catch (error) {
          console.error('Error highlighting:', error);
        }
      });

      errorsList.appendChild(errorItem);
    });
  }

  function hideErrors() {
    errorsContainer.style.display = 'none';
    controls.style.display = 'block';
    info.style.display = 'block';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Helper function to send message with promise
  function sendMessagePromise(tabId, message) {
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
});
