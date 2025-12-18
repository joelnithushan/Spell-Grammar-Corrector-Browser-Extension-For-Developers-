// Load saved settings
document.addEventListener('DOMContentLoaded', async () => {
  const spellToggle = document.getElementById('spellToggle');
  const grammarToggle = document.getElementById('grammarToggle');
  const checkBtn = document.getElementById('checkBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const status = document.getElementById('status');

  // Load saved toggle states
  const result = await chrome.storage.sync.get(['spellEnabled', 'grammarEnabled']);
  spellToggle.checked = result.spellEnabled !== false; // Default to true
  grammarToggle.checked = result.grammarEnabled !== false; // Default to true

  // Save toggle states
  spellToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ spellEnabled: spellToggle.checked });
    updateStatus();
  });

  grammarToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({ grammarEnabled: grammarToggle.checked });
    updateStatus();
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
      showStatus('API key not set. Please configure in Settings.', 'error');
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

      // Helper function to send message with promise
      const sendMessagePromise = (tabId, message) => {
        return new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
      };

      // Send check page message
      const response = await sendMessagePromise(tab.id, {
        action: 'checkPage',
        spellEnabled: spellToggle.checked,
        grammarEnabled: grammarToggle.checked
      });

      if (response && response.success) {
        showStatus(`Found ${response.errorCount || 0} issues`, 'success');
      } else if (response && response.error) {
        showStatus('Error: ' + response.error, 'error');
      } else {
        showStatus('Check completed', 'success');
      }
    } catch (error) {
      showStatus('Error: ' + error.message, 'error');
      console.error('Check page error:', error);
    }
  });

  // Settings button
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  function updateStatus() {
    const enabled = spellToggle.checked || grammarToggle.checked;
    if (enabled) {
      showStatus('Ready', 'success');
    } else {
      showStatus('Enable at least one option', 'error');
    }
  }

  function showStatus(message, type = 'success') {
    status.className = `status ${type}`;
    status.querySelector('.status-text').textContent = message;
    
    const icon = status.querySelector('.status-icon');
    if (type === 'error') {
      icon.textContent = '✗';
    } else if (type === 'info') {
      icon.textContent = '⏳';
    } else {
      icon.textContent = '✓';
    }
  }

  updateStatus();
});

