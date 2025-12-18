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
  let apiKey = apiProvider === 'deepseek' ? result.apiKey : result.geminiApiKey;

  // Trim and validate API key
  if (!apiKey) {
    throw new Error('API key not configured. Please set your API key in settings.');
  }
  
  apiKey = apiKey.trim();
  
  if (apiKey === '') {
    throw new Error('API key is empty. Please set your API key in settings.');
  }
  
  // Validate API key format for OpenRouter (warn but don't block)
  if (apiProvider === 'deepseek' && !apiKey.startsWith('sk-')) {
    console.warn('Warning: OpenRouter API key should start with "sk-". Current key format may be incorrect.');
  }
  
  console.log('Using API provider:', apiProvider);
  console.log('API key length:', apiKey.length);
  console.log('API key starts with sk-:', apiKey.startsWith('sk-'));
  console.log('API key preview (first 15 chars):', apiKey.substring(0, 15) + '...');

  // Build prompt based on enabled features
  let prompt = 'You are an expert English grammar and spelling analyzer. Your ONLY job is to find and report ALL spelling and grammar errors in the provided text.\n\n';
  
  prompt += 'CRITICAL INSTRUCTIONS:\n';
  prompt += '1. You MUST find and report EVERY spelling and grammar error in the text.\n';
  prompt += '2. Do NOT skip any errors - be thorough and comprehensive.\n';
  prompt += '3. If the text contains obvious mistakes like "recieved" (should be "received"), "messege" (should be "message"), "they was" (should be "they were"), you MUST report them.\n';
  prompt += '4. Return an empty array [] ONLY if there are genuinely NO errors in the text.\n\n';
  
  const checks = [];
  if (spellEnabled) checks.push('spelling mistakes');
  if (grammarEnabled) checks.push('grammar issues');
  prompt += `You are checking for: ${checks.join(' and ')}.\n\n`;
  
  prompt += 'Rules:\n';
  prompt += '- Find ALL errors, not just some.\n';
  prompt += '- Report each error exactly as it appears in the text.\n';
  prompt += '- Ignore: code syntax, variable names, function names, file paths, URLs, JSON keys, console logs, HTML tags, CSS properties, JavaScript code.\n';
  prompt += '- Focus ONLY on human-readable text content.\n\n';
  
  prompt += 'Output format (JSON array only, no other text):\n';
  prompt += '[{\n';
  prompt += '  "word": "exact text as it appears",\n';
  prompt += '  "position": start_index,\n';
  prompt += '  "endPosition": end_index,\n';
  prompt += '  "type": "spelling" or "grammar",\n';
  prompt += '  "suggestions": ["suggestion1", "suggestion2", ...]\n';
  prompt += '}, ...]\n\n';
  
  prompt += 'Example for text "I recieved your messege":\n';
  prompt += '[{"word": "recieved", "position": 2, "endPosition": 10, "type": "spelling", "suggestions": ["received"]}, {"word": "messege", "position": 16, "endPosition": 23, "type": "spelling", "suggestions": ["message"]}]\n\n';
  
  prompt += 'Text to analyze (find ALL errors):\n';
  prompt += '---\n';
  prompt += text;
  prompt += '\n---\n\n';
  prompt += 'Return ONLY a valid JSON array. If there are errors, return them. If there are NO errors, return []. No explanations, no markdown, no other text:';

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
      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };
      
      // Add optional headers if extension URL is available
      try {
        const extensionUrl = chrome.runtime.getURL('');
        if (extensionUrl) {
          headers['HTTP-Referer'] = extensionUrl;
          headers['X-Title'] = 'Spell & Grammar Checker Extension';
        }
      } catch (e) {
        // Ignore if URL not available
      }
      
      console.log('Making OpenRouter API request');
      console.log('API key length:', apiKey.length);
      console.log('API key starts with sk-:', apiKey.startsWith('sk-'));
      console.log('API key preview:', apiKey.substring(0, 10) + '...');
      console.log('Request headers:', {
        'Authorization': `Bearer ${apiKey.substring(0, 10)}...`,
        'Content-Type': headers['Content-Type'],
        'HTTP-Referer': headers['HTTP-Referer'] || 'not set',
        'X-Title': headers['X-Title'] || 'not set'
      });
      
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: headers,
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
      
      console.log('OpenRouter API response status:', response.status, response.statusText);
    }

    if (!response.ok) {
      let errorMessage = 'API request failed';
      let errorDetails = null;
      try {
        const errorText = await response.text();
        console.error('API Error Response Status:', response.status, response.statusText);
        console.error('API Error Response (raw):', errorText);
        try {
          errorDetails = JSON.parse(errorText);
          errorMessage = errorDetails.error?.message || errorDetails.message || errorDetails.error || errorDetails.error?.code || `HTTP ${response.status}: ${response.statusText}`;
        } catch (parseError) {
          errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (e) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      
      // Provide more helpful error messages
      if (response.status === 401 || response.status === 403 || errorMessage.toLowerCase().includes('auth') || errorMessage.toLowerCase().includes('key') || errorMessage.toLowerCase().includes('cookie') || errorMessage.toLowerCase().includes('unauthorized')) {
        errorMessage = `Authentication failed: ${errorMessage}. Please verify your API key is correct in settings. For OpenRouter, keys should start with "sk-".`;
      } else if (response.status === 429) {
        errorMessage = `Rate limit exceeded: ${errorMessage}. Please try again later.`;
      } else if (response.status >= 500) {
        errorMessage = `Server error: ${errorMessage}. Please try again later.`;
      }
      
      throw new Error(errorMessage);
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
    console.log('Raw API response content length:', content.length);
    console.log('Raw API response content (first 1000 chars):', content.substring(0, 1000));
    console.log('Raw API response content (last 500 chars):', content.substring(Math.max(0, content.length - 500)));
    
    try {
      // First, try to find JSON array - use non-greedy match but allow for large arrays
      let jsonMatch = content.match(/\[[\s\S]*?\]/);
      
      // If no array found with non-greedy, try greedy match
      if (!jsonMatch || jsonMatch[0].length < 10) {
        jsonMatch = content.match(/\[[\s\S]*\]/);
      }
      
      // If still no array found, try to find JSON object array
      if (!jsonMatch || jsonMatch[0].length < 10) {
        const objMatch = content.match(/\{[\s\S]*?\}/);
        if (objMatch && objMatch[0].includes('[')) {
          // Extract array from object
          const arrayMatch = objMatch[0].match(/\[[\s\S]*?\]/);
          if (arrayMatch) jsonMatch = arrayMatch;
        }
      }
      
      if (jsonMatch && jsonMatch[0].length >= 2) {
        try {
          errors = JSON.parse(jsonMatch[0]);
          console.log('Successfully parsed JSON array with', errors.length, 'errors');
        } catch (parseErr) {
          console.error('Failed to parse matched JSON:', parseErr);
          console.error('Matched content:', jsonMatch[0].substring(0, 500));
        }
      }
      
      // If still no errors, try to parse the entire content
      if (!Array.isArray(errors) || errors.length === 0) {
        try {
          const parsed = JSON.parse(content.trim());
          if (Array.isArray(parsed)) {
            errors = parsed;
            console.log('Parsed entire content as JSON array with', errors.length, 'errors');
          }
        } catch (e) {
          // Try to extract JSON from markdown code blocks
          const codeBlockMatch = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
          if (codeBlockMatch) {
            errors = JSON.parse(codeBlockMatch[1]);
            console.log('Extracted JSON from code block with', errors.length, 'errors');
          } else {
            // Try multiline code block
            const multilineMatch = content.match(/```[\s\S]*?(\[[\s\S]*?\])\s*```/);
            if (multilineMatch) {
              errors = JSON.parse(multilineMatch[1]);
              console.log('Extracted JSON from multiline code block with', errors.length, 'errors');
            } else {
              console.warn('No valid JSON array found in response');
              console.warn('Full response content:', content);
            }
          }
        }
      }
      
      // Validate errors array
      if (!Array.isArray(errors)) {
        console.error('Parsed result is not an array:', typeof errors, errors);
        errors = [];
      } else {
        console.log('Final result: Successfully parsed', errors.length, 'errors');
        if (errors.length > 0) {
          console.log('First error example:', errors[0]);
        }
      }
    } catch (parseError) {
      console.error('Failed to parse API response:', parseError);
      console.error('Response content (first 2000 chars):', content.substring(0, 2000));
      console.error('Response content (last 500 chars):', content.substring(Math.max(0, content.length - 500)));
      // Return empty array if parsing fails
      errors = [];
    }

    return errors;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

