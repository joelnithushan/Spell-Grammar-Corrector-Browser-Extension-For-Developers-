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
  const result = await chrome.storage.sync.get(['apiKey', 'geminiApiKey', 'apiProvider']);
  const apiProvider = result.apiProvider || 'deepseek';
  const apiKey = apiProvider === 'deepseek' ? result.apiKey : result.geminiApiKey;

  if (!apiKey) {
    throw new Error('API key not configured');
  }

  // Build prompt based on enabled features
  let prompt = 'You are a professional spell and grammar checker. Analyze the following text and identify ALL ';
  const checks = [];
  if (spellEnabled) checks.push('spelling errors');
  if (grammarEnabled) checks.push('grammar errors');
  prompt += checks.join(' and ') + '.\n\n';
  prompt += 'IMPORTANT: Check the ENTIRE text thoroughly. Find ALL errors.\n\n';
  prompt += 'For each error found, provide:\n';
  prompt += '1. The incorrect word/phrase (exact text as it appears)\n';
  prompt += '2. The position (character index from the start of the text, starting at 0)\n';
  prompt += '3. Suggested corrections (provide 2-4 alternatives, ordered by best match first)\n';
  prompt += '4. Type: "spelling" for spelling errors, "grammar" for grammar errors\n\n';
  prompt += 'Return ONLY a valid JSON array. No explanations, no markdown, just the JSON array.\n';
  prompt += 'Example format:\n';
  prompt += '[{"word": "recieved", "position": 5, "suggestions": ["received", "receive"], "type": "spelling"}, {"word": "they was", "position": 45, "suggestions": ["they were", "they are"], "type": "grammar"}]\n\n';
  prompt += 'Text to analyze:\n';
  prompt += '---\n';
  prompt += text;
  prompt += '\n---\n';
  prompt += 'Now analyze this text and return the JSON array with all errors found:';

  try {
    let response;
    
    if (apiProvider === 'gemini') {
      // Use Gemini API
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4000
          }
        })
      });
    } else {
      // Use DeepSeek via OpenRouter
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
          temperature: 0.2,
          max_tokens: 4000
        })
      });
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    
    // Extract content based on API provider
    let content = '';
    if (apiProvider === 'gemini') {
      content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      content = data.choices[0]?.message?.content || '';
    }
    
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
      console.error('Response content:', content);
      // Return empty array if parsing fails
      errors = [];
    }

    return errors;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

