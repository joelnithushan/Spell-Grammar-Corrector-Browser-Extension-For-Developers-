// Background service worker for API calls
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkText') {
    checkTextWithAPI(request.text, request.spellEnabled, request.grammarEnabled)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
});

async function checkTextWithAPI(text, spellEnabled, grammarEnabled) {
  const result = await chrome.storage.sync.get(['apiKey']);
  const apiKey = result.apiKey;

  if (!apiKey) {
    throw new Error('API key not configured');
  }

  // Build prompt based on enabled features
  let prompt = 'Analyze the following text and identify ';
  const checks = [];
  if (spellEnabled) checks.push('spelling errors');
  if (grammarEnabled) checks.push('grammar errors');
  prompt += checks.join(' and ') + '.\n\n';
  prompt += 'For each error, provide:\n';
  prompt += '1. The incorrect word/phrase\n';
  prompt += '2. The position (character index)\n';
  prompt += '3. Suggested corrections (at least 2-3 alternatives)\n';
  prompt += '4. Type: "spelling" or "grammar"\n\n';
  prompt += 'Return the response as a JSON array of objects with this structure:\n';
  prompt += '[{"word": "incorrect word", "position": 0, "suggestions": ["suggestion1", "suggestion2"], "type": "spelling"}]\n\n';
  prompt += 'Text to analyze:\n' + text;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': chrome.runtime.getURL(''),
        'X-Title': 'Spell & Grammar Checker Extension'
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    
    // Try to extract JSON from the response
    let errors = [];
    try {
      // Look for JSON array in the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        errors = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: try to parse the entire content
        errors = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Failed to parse API response:', parseError);
      // Return empty array if parsing fails
      errors = [];
    }

    return errors;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

