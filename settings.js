document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const toggleVisibility = document.getElementById('toggleVisibility');
  const toggleVisibilityGemini = document.getElementById('toggleVisibilityGemini');
  const defaultSpell = document.getElementById('defaultSpell');
  const defaultGrammar = document.getElementById('defaultGrammar');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const status = document.getElementById('status');
  const providerDeepseek = document.getElementById('providerDeepseek');
  const providerGemini = document.getElementById('providerGemini');
  const deepseekSettings = document.getElementById('deepseekSettings');
  const geminiSettings = document.getElementById('geminiSettings');
  const deepseekInfo = document.getElementById('deepseekInfo');
  const geminiInfo = document.getElementById('geminiInfo');

  // Load saved settings
  const result = await chrome.storage.sync.get(['apiKey', 'geminiApiKey', 'apiProvider', 'spellEnabled', 'grammarEnabled']);
  if (result.apiKey) {
    apiKeyInput.value = result.apiKey;
  }
  if (result.geminiApiKey) {
    geminiApiKeyInput.value = result.geminiApiKey;
  }
  const selectedProvider = result.apiProvider || 'deepseek';
  if (selectedProvider === 'gemini') {
    providerGemini.checked = true;
    deepseekSettings.style.display = 'none';
    geminiSettings.style.display = 'block';
    deepseekInfo.style.display = 'none';
    geminiInfo.style.display = 'block';
  } else {
    providerDeepseek.checked = true;
    deepseekSettings.style.display = 'block';
    geminiSettings.style.display = 'none';
    deepseekInfo.style.display = 'block';
    geminiInfo.style.display = 'none';
  }
  defaultSpell.checked = result.spellEnabled !== false;
  defaultGrammar.checked = result.grammarEnabled !== false;

  // Handle provider selection
  providerDeepseek.addEventListener('change', () => {
    if (providerDeepseek.checked) {
      deepseekSettings.style.display = 'block';
      geminiSettings.style.display = 'none';
      deepseekInfo.style.display = 'block';
      geminiInfo.style.display = 'none';
    }
  });

  providerGemini.addEventListener('change', () => {
    if (providerGemini.checked) {
      deepseekSettings.style.display = 'none';
      geminiSettings.style.display = 'block';
      deepseekInfo.style.display = 'none';
      geminiInfo.style.display = 'block';
    }
  });

  // Toggle API key visibility
  toggleVisibility.addEventListener('click', () => {
    const type = apiKeyInput.type === 'password' ? 'text' : 'password';
    apiKeyInput.type = type;
    toggleVisibility.textContent = type === 'password' ? '👁️' : '🙈';
  });

  toggleVisibilityGemini.addEventListener('click', () => {
    const type = geminiApiKeyInput.type === 'password' ? 'text' : 'password';
    geminiApiKeyInput.type = type;
    toggleVisibilityGemini.textContent = type === 'password' ? '👁️' : '🙈';
  });

  // Test API key
  testBtn.addEventListener('click', async () => {
    const selectedProvider = providerDeepseek.checked ? 'deepseek' : 'gemini';
    const apiKey = selectedProvider === 'deepseek' 
      ? apiKeyInput.value.trim() 
      : geminiApiKeyInput.value.trim();
    
    if (!apiKey) {
      showStatus('Please enter an API key first', 'error');
      return;
    }

    showStatus('Testing API key...', 'info');
    
    try {
      let response;
      if (selectedProvider === 'deepseek') {
        response = await fetch('https://openrouter.ai/api/v1/models', {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });
      } else {
        // Test Gemini API
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }

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
    const selectedProvider = providerDeepseek.checked ? 'deepseek' : 'gemini';
    const apiKey = selectedProvider === 'deepseek' 
      ? apiKeyInput.value.trim() 
      : geminiApiKeyInput.value.trim();
    
    if (!apiKey) {
      showStatus('Please enter an API key', 'error');
      return;
    }

    const settingsToSave = {
      apiProvider: selectedProvider,
      spellEnabled: defaultSpell.checked,
      grammarEnabled: defaultGrammar.checked
    };

    if (selectedProvider === 'deepseek') {
      settingsToSave.apiKey = apiKey;
      // Keep existing Gemini key if switching
      const existing = await chrome.storage.sync.get(['geminiApiKey']);
      if (existing.geminiApiKey) {
        settingsToSave.geminiApiKey = existing.geminiApiKey;
      }
    } else {
      settingsToSave.geminiApiKey = apiKey;
      // Keep existing DeepSeek key if switching
      const existing = await chrome.storage.sync.get(['apiKey']);
      if (existing.apiKey) {
        settingsToSave.apiKey = existing.apiKey;
      }
    }

    await chrome.storage.sync.set(settingsToSave);

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

