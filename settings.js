document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const toggleVisibility = document.getElementById('toggleVisibility');
  const defaultSpell = document.getElementById('defaultSpell');
  const defaultGrammar = document.getElementById('defaultGrammar');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const status = document.getElementById('status');

  // Load saved settings
  const result = await chrome.storage.sync.get(['apiKey', 'spellEnabled', 'grammarEnabled']);
  if (result.apiKey) {
    apiKeyInput.value = result.apiKey;
  }
  defaultSpell.checked = result.spellEnabled !== false;
  defaultGrammar.checked = result.grammarEnabled !== false;

  // Toggle API key visibility
  toggleVisibility.addEventListener('click', () => {
    const type = apiKeyInput.type === 'password' ? 'text' : 'password';
    apiKeyInput.type = type;
    toggleVisibility.textContent = type === 'password' ? '👁️' : '🙈';
  });

  // Test API key
  testBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showStatus('Please enter an API key first', 'error');
      return;
    }

    showStatus('Testing API key...', 'info');
    
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        showStatus('✓ API key is valid!', 'success');
      } else {
        const error = await response.json();
        showStatus('✗ API key test failed: ' + (error.error?.message || 'Invalid key'), 'error');
      }
    } catch (error) {
      showStatus('✗ Error testing API key: ' + error.message, 'error');
    }
  });

  // Save settings
  saveBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showStatus('Please enter an API key', 'error');
      return;
    }

    await chrome.storage.sync.set({
      apiKey: apiKey,
      spellEnabled: defaultSpell.checked,
      grammarEnabled: defaultGrammar.checked
    });

    showStatus('✓ Settings saved successfully!', 'success');
  });

  function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type} show`;
    
    setTimeout(() => {
      status.classList.remove('show');
    }, 5000);
  }
});

