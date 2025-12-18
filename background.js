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
  let prompt = 'You are an expert English grammar and spelling analyzer designed for a browser extension.\n\n';
  prompt += 'Your task:\n';
  prompt += '- Analyze web page text content provided by the user.\n';
  
  const checks = [];
  if (spellEnabled) checks.push('spelling mistakes');
  if (grammarEnabled) checks.push('grammar issues');
  prompt += `- Identify ONLY ${checks.join(' and ')}.\n`;
  
  prompt += '- Do NOT rewrite the text.\n';
  prompt += '- Do NOT change formatting.\n';
  prompt += '- Do NOT remove code blocks, HTML tags, or developer comments.\n\n';
  
  prompt += 'Important rules:\n';
  prompt += '1. Never modify the original content.\n';
  prompt += '2. Never auto-correct anything.\n';
  prompt += '3. Only report issues.\n';
  prompt += '4. Every issue must include:\n';
  prompt += '   - Exact original text (word or phrase as it appears)\n';
  prompt += '   - Issue type ("spelling" or "grammar")\n';
  prompt += '   - Character start index (position from start of text, starting at 0)\n';
  prompt += '   - Character end index (position where the error ends)\n';
  prompt += '   - One or more suggested alternatives (array of strings, ordered by best match first)\n';
  prompt += '5. Ignore:\n';
  prompt += '   - Code syntax\n';
  prompt += '   - Variable names\n';
  prompt += '   - Function names\n';
  prompt += '   - File paths\n';
  prompt += '   - URLs\n';
  prompt += '   - JSON keys\n';
  prompt += '   - Console logs\n';
  prompt += '   - HTML tags and attributes\n';
  prompt += '   - CSS properties\n';
  prompt += '   - JavaScript code blocks\n';
  prompt += '6. Focus only on visible human-readable content.\n';
  prompt += '7. Be precise and concise.\n';
  prompt += '8. Output must be valid JSON only. No extra text, no markdown, no explanations.\n\n';
  
  prompt += 'Output format (JSON array):\n';
  prompt += '[{\n';
  prompt += '  "word": "exact text as it appears",\n';
  prompt += '  "position": start_index,\n';
  prompt += '  "endPosition": end_index,\n';
  prompt += '  "type": "spelling" or "grammar",\n';
  prompt += '  "suggestions": ["suggestion1", "suggestion2", ...]\n';
  prompt += '}, ...]\n\n';
  
  prompt += 'Example:\n';
  prompt += '[{"word": "recieved", "position": 5, "endPosition": 13, "type": "spelling", "suggestions": ["received"]}, {"word": "they was", "position": 45, "endPosition": 53, "type": "grammar", "suggestions": ["they were", "they are"]}]\n\n';
  
  prompt += 'Text to analyze:\n';
  prompt += '---\n';
  prompt += text;
  prompt += '\n---\n\n';
  prompt += 'Return ONLY the JSON array with all errors found. No other text:';

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
    console.log('Raw API response content:', content.substring(0, 500));
    
    try {
      // Look for JSON array in the response (more flexible matching)
      let jsonMatch = content.match(/\[[\s\S]*?\]/);
      
      // If no array found, try to find JSON object array
      if (!jsonMatch) {
        jsonMatch = content.match(/\{[\s\S]*?\}/);
        if (jsonMatch && jsonMatch[0].includes('[')) {
          // Extract array from object
          const arrayMatch = jsonMatch[0].match(/\[[\s\S]*?\]/);
          if (arrayMatch) jsonMatch = arrayMatch;
        }
      }
      
      if (jsonMatch) {
        errors = JSON.parse(jsonMatch[0]);
        console.log('Parsed errors:', errors.length);
      } else {
        // Fallback: try to parse the entire content
        try {
          errors = JSON.parse(content);
          console.log('Parsed entire content as JSON');
        } catch (e) {
          // Try to extract JSON from markdown code blocks
          const codeBlockMatch = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
          if (codeBlockMatch) {
            errors = JSON.parse(codeBlockMatch[1]);
            console.log('Extracted JSON from code block');
          } else {
            throw new Error('No valid JSON found in response');
          }
        }
      }
      
      // Validate errors array
      if (!Array.isArray(errors)) {
        console.error('Parsed result is not an array:', errors);
        errors = [];
      } else {
        console.log('Successfully parsed', errors.length, 'errors');
      }
    } catch (parseError) {
      console.error('Failed to parse API response:', parseError);
      console.error('Response content (first 1000 chars):', content.substring(0, 1000));
      // Return empty array if parsing fails
      errors = [];
    }

    return errors;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

