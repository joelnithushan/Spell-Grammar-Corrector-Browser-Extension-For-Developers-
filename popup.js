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
  const status = document.getElementById('status');
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
      showStatus('Please enable at least one option', 'error');
      return;
    }

    // Check if API key is set
    const settings = await chrome.storage.sync.get(['apiKey']);
    if (!settings.apiKey) {
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
      showStatus('Cannot check this page type', 'error');
      return;
    }

    showStatus('Checking page...', 'info');
    
    try {
      // Try to inject content script if not already loaded
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        // Inject CSS as well
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content.css']
        });
        // Wait for script to initialize
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (injectError) {
        // Script might already be injected, that's okay
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
        showStatus(`Found ${errorCountValue} issues`, 'success');
        
        if (errorCountValue > 0 && response.errors) {
          displayErrors(response.errors, tab.id);
        } else {
          hideErrors();
        }
      } else if (response && response.error) {
        showStatus('Error: ' + response.error, 'error');
        hideErrors();
      } else {
        showStatus('Check completed', 'success');
        hideErrors();
      }
    } catch (error) {
      showStatus('Error: ' + error.message, 'error');
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
      errorItem.className = `error-item ${error.type}`;
      errorItem.dataset.errorId = error.id;

      // Format: original -> suggestion
      const primarySuggestion = error.suggestions && error.suggestions.length > 0 
        ? error.suggestions[0] 
        : 'No suggestion';
      
      const wordDiv = document.createElement('div');
      wordDiv.className = 'error-word';
      wordDiv.innerHTML = `
        <span class="word-original">${escapeHtml(error.word)}</span>
        <span class="word-arrow"> → </span>
        <span class="word-suggestion">${escapeHtml(primarySuggestion)}</span>
        <span class="error-type">${error.type}</span>
      `;

      // Show additional suggestions if available
      const suggestionsDiv = document.createElement('div');
      suggestionsDiv.className = 'error-suggestions';
      
      if (error.suggestions && error.suggestions.length > 1) {
        const moreLabel = document.createElement('span');
        moreLabel.textContent = 'More: ';
        moreLabel.style.fontSize = '11px';
        moreLabel.style.color = '#718096';
        moreLabel.style.marginRight = '4px';
        suggestionsDiv.appendChild(moreLabel);
        
        // Show remaining suggestions (skip first one as it's already shown)
        error.suggestions.slice(1).forEach(suggestion => {
          const badge = document.createElement('span');
          badge.className = 'suggestion-badge';
          badge.textContent = suggestion;
          badge.addEventListener('click', (e) => {
            e.stopPropagation();
            // Update the main suggestion display
            wordDiv.querySelector('.word-suggestion').textContent = suggestion;
            // Highlight the clicked badge
            suggestionsDiv.querySelectorAll('.suggestion-badge').forEach(b => {
              b.style.opacity = '1';
            });
            badge.style.opacity = '0.7';
            badge.style.fontWeight = '600';
          });
          suggestionsDiv.appendChild(badge);
        });
      } else if (!error.suggestions || error.suggestions.length === 0) {
        const noSuggestions = document.createElement('span');
        noSuggestions.textContent = 'No suggestions available';
        noSuggestions.style.color = '#a0aec0';
        noSuggestions.style.fontSize = '11px';
        suggestionsDiv.appendChild(noSuggestions);
      }

      const contextDiv = document.createElement('div');
      contextDiv.className = 'error-context';
      contextDiv.textContent = error.context || '';

      errorItem.appendChild(wordDiv);
      if (suggestionsDiv.children.length > 0) {
        errorItem.appendChild(suggestionsDiv);
      }
      errorItem.appendChild(contextDiv);

      // Click to highlight on page
      errorItem.addEventListener('click', async () => {
        try {
          await sendMessagePromise(tabId, {
            action: 'highlightError',
            errorId: error.id
          });
          // Highlight the clicked item
          document.querySelectorAll('.error-item').forEach(item => {
            item.style.background = '#f7fafc';
            item.style.borderLeftWidth = '3px';
          });
          errorItem.style.background = '#dbeafe';
          errorItem.style.borderLeftWidth = '4px';
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

  updateStatus();
});

