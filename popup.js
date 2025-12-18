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
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content.css']
        });
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (injectError) {
        console.log('Script injection note:', injectError.message);
      }

      // Send check page message
      const response = await sendMessagePromise(tab.id, {
        action: 'checkPage',
        spellEnabled: spellToggle.checked,
        grammarEnabled: grammarToggle.checked
      });

      if (response && response.success) {
        const errorCountValue = response.errorCount || 0;
        
        // Hide status, show results
        status.style.display = 'none';
        
        if (errorCountValue > 0 && response.errors) {
          displayErrors(response.errors, tab.id);
        } else {
          info.style.display = 'block';
          info.innerHTML = '<p>No errors found! ✓</p>';
        }
      } else if (response && response.error) {
        status.style.display = 'block';
        status.style.background = '#fef2f2';
        statusText.textContent = 'Error: ' + response.error;
        statusText.style.color = '#991b1b';
        info.style.display = 'block';
      } else {
        status.style.display = 'none';
        info.style.display = 'block';
        info.innerHTML = '<p>Analysis completed. No errors found.</p>';
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
