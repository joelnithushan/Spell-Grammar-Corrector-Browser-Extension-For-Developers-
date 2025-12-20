// Settings Page Script

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const providerDeepseek = document.getElementById('providerDeepseek');
  const providerGemini = document.getElementById('providerGemini');
  const deepseekSection = document.getElementById('deepseekSection');
  const geminiSection = document.getElementById('geminiSection');
  const deepseekApiKey = document.getElementById('deepseekApiKey');
  const geminiApiKey = document.getElementById('geminiApiKey');
  const toggleDeepseek = document.getElementById('toggleDeepseek');
  const toggleGemini = document.getElementById('toggleGemini');
  const defaultSpell = document.getElementById('defaultSpell');
  const defaultGrammar = document.getElementById('defaultGrammar');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const status = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  
  // Load saved settings
  const settings = await chrome.storage.sync.get([
    'apiProvider',
    'apiKey',
    'geminiApiKey',
    'spellEnabled',
    'grammarEnabled'
  ]);
  
  // Set provider
  const provider = settings.apiProvider || 'deepseek';
  if (provider === 'gemini') {
    providerGemini.checked = true;
    deepseekSection.style.display = 'none';
    geminiSection.style.display = 'block';
  } else {
    providerDeepseek.checked = true;
    deepseekSection.style.display = 'block';
    geminiSection.style.display = 'none';
  }
  
  // Set API keys
  if (settings.apiKey) deepseekApiKey.value = settings.apiKey;
  if (settings.geminiApiKey) geminiApiKey.value = settings.geminiApiKey;
  
  // Set defaults
  defaultSpell.checked = settings.spellEnabled !== false;
  defaultGrammar.checked = settings.grammarEnabled !== false;
  
  // Provider toggle
  providerDeepseek.addEventListener('change', () => {
    if (providerDeepseek.checked) {
      deepseekSection.style.display = 'block';
      geminiSection.style.display = 'none';
    }
  });
  
  providerGemini.addEventListener('change', () => {
    if (providerGemini.checked) {
      deepseekSection.style.display = 'none';
      geminiSection.style.display = 'block';
    }
  });
  
  // Toggle visibility
  toggleDeepseek.addEventListener('click', () => {
    const type = deepseekApiKey.type === 'password' ? 'text' : 'password';
    deepseekApiKey.type = type;
    toggleDeepseek.textContent = type === 'password' ? '👁️' : '🙈';
  });
  
  toggleGemini.addEventListener('click', () => {
    const type = geminiApiKey.type === 'password' ? 'text' : 'password';
    geminiApiKey.type = type;
    toggleGemini.textContent = type === 'password' ? '👁️' : '🙈';
  });
  
  // Save button
  saveBtn.addEventListener('click', async () => {
    const provider = providerDeepseek.checked ? 'deepseek' : 'gemini';
    const deepseekKey = deepseekApiKey.value.trim();
    const geminiKey = geminiApiKey.value.trim();
    
    // Validate the active provider's key
    const activeKey = provider === 'deepseek' ? deepseekKey : geminiKey;
    if (!activeKey) {
      showStatus('Please enter an API key for the selected provider', 'error');
      return;
    }
    
    // Validate OpenRouter key format (should start with sk-)
    if (provider === 'deepseek') {
      if (!deepseekKey.startsWith('sk-')) {
        showStatus('Error: OpenRouter API keys must start with "sk-". Please check your key and try again.', 'error');
        return;
      }
      
      // Warn if key seems too short
      if (deepseekKey.length < 20) {
        showStatus('Warning: API key seems too short. Typical OpenRouter keys are 40+ characters. Please verify your key.', 'error');
        return;
      }
    }
    
    // Save both keys (preserve the one not being edited, but always save the current input)
    const existing = await chrome.storage.sync.get(['apiKey', 'geminiApiKey']);
    await chrome.storage.sync.set({
      apiProvider: provider,
      apiKey: deepseekKey || existing.apiKey || '',
      geminiApiKey: geminiKey || existing.geminiApiKey || '',
      spellEnabled: defaultSpell.checked,
      grammarEnabled: defaultGrammar.checked
    });
    
    showStatus('Settings saved successfully!', 'success');
  });
  
  // Test button
  testBtn.addEventListener('click', async () => {
    const provider = providerDeepseek.checked ? 'deepseek' : 'gemini';
    const apiKey = provider === 'deepseek' 
      ? deepseekApiKey.value.trim() 
      : geminiApiKey.value.trim();
    
    if (!apiKey) {
      showStatus('Please enter an API key first', 'error');
      return;
    }
    
    showStatus('Testing API key...', 'info');
    testBtn.disabled = true;
    
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
        showStatus(`✓ ${provider === 'gemini' ? 'Gemini' : 'DeepSeek'} API key is valid!`, 'success');
      } else {
        let errorMessage = 'Invalid key';
        try {
          const error = await response.json();
          errorMessage = error.error?.message || error.message || errorMessage;
          
          // Provide helpful guidance for OpenRouter errors
          if (provider === 'deepseek' && (errorMessage.includes('cookie') || errorMessage.includes('auth'))) {
            errorMessage = `Authentication failed: ${errorMessage}. ` +
              `Make sure your OpenRouter API key starts with "sk-" and is valid. ` +
              `Get your key from https://openrouter.ai/keys`;
          }
        } catch (e) {
          // Use default message
        }
        showStatus(`✗ API key test failed: ${errorMessage}`, 'error');
      }
    } catch (error) {
      showStatus(`✗ Error: ${error.message}`, 'error');
    } finally {
      testBtn.disabled = false;
    }
  });
  
  function showStatus(message, type) {
    status.style.display = 'block';
    status.className = `status ${type}`;
    statusText.textContent = message;
    setTimeout(() => {
      if (type !== 'info') {
        status.style.display = 'none';
      }
    }, 5000);
  }
});



