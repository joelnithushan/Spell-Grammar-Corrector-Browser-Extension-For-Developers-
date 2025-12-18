// Background Service Worker
// Handles API communication with AI providers (Gemini/DeepSeek)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeText') {
    analyzeText(request.text, request.options)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => {
        console.error('Analysis error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
});

/**
 * Analyzes text using the configured AI provider
 * @param {string} text - Text to analyze
 * @param {Object} options - Analysis options (spellEnabled, grammarEnabled)
 * @returns {Promise<Array>} Array of detected errors
 */
async function analyzeText(text, options = {}) {
  const { spellEnabled = true, grammarEnabled = true } = options;
  
  // Get API configuration
  const config = await chrome.storage.sync.get([
    'apiProvider',
    'apiKey',
    'geminiApiKey'
  ]);
  
  const provider = config.apiProvider || 'deepseek';
  const apiKey = provider === 'gemini' 
    ? config.geminiApiKey 
    : config.apiKey;
  
  if (!apiKey || !apiKey.trim()) {
    throw new Error('API key not configured. Please set your API key in settings.');
  }
  
  const trimmedKey = apiKey.trim();
  
  // Build analysis prompt
  const prompt = buildAnalysisPrompt(text, spellEnabled, grammarEnabled);
  
  // Call appropriate API
  let response;
  if (provider === 'gemini') {
    response = await callGeminiAPI(trimmedKey, prompt);
  } else {
    response = await callDeepSeekAPI(trimmedKey, prompt);
  }
  
  // Parse and return errors
  return parseAIResponse(response, provider);
}

/**
 * Builds the analysis prompt for the AI
 */
function buildAnalysisPrompt(text, spellEnabled, grammarEnabled) {
  const checks = [];
  if (spellEnabled) checks.push('spelling errors');
  if (grammarEnabled) checks.push('grammar errors');
  
  return `You are an expert English language analyzer. Analyze the following text and identify ALL ${checks.join(' and ')}.

CRITICAL REQUIREMENTS:
1. Find EVERY error - be thorough and comprehensive
2. Return ONLY valid JSON - no explanations, no markdown, no other text
3. If no errors exist, return an empty array []
4. Each error must include exact position in the text

OUTPUT FORMAT (JSON array):
[
  {
    "word": "exact text as it appears",
    "position": start_index,
    "endPosition": end_index,
    "type": "spelling" or "grammar",
    "suggestions": ["correction1", "correction2"]
  }
]

RULES:
- Ignore: code, URLs, file paths, variable names, function names, JSON keys
- Focus only on human-readable text content
- Report each error exactly as it appears
- Position indices start at 0

TEXT TO ANALYZE:
---
${text}
---

Return ONLY the JSON array:`;
}

/**
 * Calls Gemini API
 */
async function callGeminiAPI(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4000
      }
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(error.error?.message || `HTTP ${response.status}: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Calls DeepSeek API via OpenRouter
 */
async function callDeepSeekAPI(apiKey, prompt) {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  
  // Add optional headers
  try {
    const extensionUrl = chrome.runtime.getURL('');
    if (extensionUrl) {
      headers['HTTP-Referer'] = extensionUrl;
      headers['X-Title'] = 'Spell & Grammar Checker';
    }
  } catch (e) {
    // Ignore
  }
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      model: 'deepseek/deepseek-chat',
      messages: [{
        role: 'user',
        content: prompt
      }],
      temperature: 0.2,
      max_tokens: 4000
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(error.error?.message || `HTTP ${response.status}: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Parses AI response and extracts errors
 */
function parseAIResponse(data, provider) {
  // Extract content based on provider
  let content = '';
  if (provider === 'gemini') {
    content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } else {
    content = data.choices?.[0]?.message?.content || '';
  }
  
  if (!content) {
    console.warn('Empty response from AI');
    return [];
  }
  
  // Try to extract JSON array
  let errors = [];
  
  // Strategy 1: Direct JSON array match
  let jsonMatch = content.match(/\[[\s\S]*?\]/);
  
  // Strategy 2: Greedy match for large arrays
  if (!jsonMatch || jsonMatch[0].length < 10) {
    jsonMatch = content.match(/\[[\s\S]*\]/);
  }
  
  // Strategy 3: Extract from markdown code blocks
  if (!jsonMatch || jsonMatch[0].length < 10) {
    const codeBlockMatch = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (codeBlockMatch) jsonMatch = codeBlockMatch;
  }
  
  // Strategy 4: Parse entire content
  if (!jsonMatch || jsonMatch[0].length < 10) {
    try {
      const parsed = JSON.parse(content.trim());
      if (Array.isArray(parsed)) {
        errors = parsed;
      }
    } catch (e) {
      console.error('Failed to parse response as JSON:', e);
    }
  }
  
  // Parse matched JSON
  if (jsonMatch && jsonMatch[0].length >= 2) {
    try {
      errors = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Failed to parse matched JSON:', e);
      console.error('Matched content:', jsonMatch[0].substring(0, 200));
    }
  }
  
  // Validate and return
  if (!Array.isArray(errors)) {
    console.warn('Response is not an array:', typeof errors);
    return [];
  }
  
  // Validate error structure
  return errors.filter(error => {
    return error && 
           typeof error.word === 'string' &&
           typeof error.position === 'number' &&
           Array.isArray(error.suggestions) &&
           error.suggestions.length > 0;
  });
}

