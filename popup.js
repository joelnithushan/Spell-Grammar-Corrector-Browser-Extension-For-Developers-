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

    showStatus('Checking page...', 'info');
    
    // Send message to content script
    chrome.tabs.sendMessage(tab.id, {
      action: 'checkPage',
      spellEnabled: spellToggle.checked,
      grammarEnabled: grammarToggle.checked
    }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
      } else if (response && response.success) {
        showStatus(`Found ${response.errorCount || 0} issues`, 'success');
      } else {
        showStatus('Check completed', 'success');
      }
    });
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

