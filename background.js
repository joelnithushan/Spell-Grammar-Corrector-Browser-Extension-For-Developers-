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
  
  // Validate OpenRouter key format
  if (provider === 'deepseek') {
    if (!trimmedKey.startsWith('sk-')) {
      throw new Error('Invalid OpenRouter API key format. Keys must start with "sk-". ' +
        'Please check your API key in settings. Get your key from https://openrouter.ai/keys');
    }
    
    // Additional validation: OpenRouter keys are typically longer
    if (trimmedKey.length < 20) {
      console.warn('OpenRouter API key seems too short. Typical keys are 40+ characters.');
    }
  }
  
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
 * Builds the analysis prompt for the AI (optimized for speed)
 */
function buildAnalysisPrompt(text, spellEnabled, grammarEnabled) {
  const checks = [];
  if (spellEnabled) checks.push('spelling');
  if (grammarEnabled) checks.push('grammar');
  
  // Optimized prompt - shorter and more direct for faster processing
  return `Find ALL ${checks.join(' and ')} errors. Return ONLY JSON array, no other text.

Format: [{"word":"text","position":0,"endPosition":4,"type":"spelling","suggestions":["correct"]}]

Rules: Ignore code/URLs/variables. Focus on human-readable text. Positions start at 0.

Text:
${text}

JSON only:`;
}

/**
 * Calls Gemini API
 */
async function callGeminiAPI(apiKey, prompt) {
  // Use gemini-2.5-flash (latest, optimized for cost and speed) or fallback to older versions
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];
  let model = models[0];
  let url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  console.log('Gemini API Request:', {
    model: model,
    url: url.replace(apiKey, 'API_KEY_HIDDEN'),
    promptLength: prompt.length
  });
  
  let response = await fetch(url, {
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
  
  // If model not found, try fallback models
  if (!response.ok) {
    let errorText = '';
    let errorDetails = null;
    
    try {
      errorText = await response.text();
      console.error('Gemini API Error Response:', errorText);
      
      try {
        errorDetails = JSON.parse(errorText);
      } catch (e) {
        // Not JSON
      }
    } catch (e) {
      console.error('Error reading Gemini response:', e);
    }
    
    // Try fallback models if current model is not found
    if (response.status === 404 || 
        (errorDetails?.error?.message?.includes('not found') || 
         errorDetails?.error?.message?.includes('not supported'))) {
      
      console.log(`Model ${model} not available, trying fallback models...`);
      
      for (let i = 1; i < models.length; i++) {
        model = models[i];
        url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        console.log(`Trying fallback model: ${model}`);
        
        try {
          response = await fetch(url, {
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
          
          if (response.ok) {
            console.log(`Successfully using fallback model: ${model}`);
            break;
          }
        } catch (e) {
          console.error(`Fallback model ${model} also failed:`, e);
        }
      }
    }
    
    // If still not ok after trying fallbacks, throw error
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      if (errorDetails) {
        errorMessage = errorDetails.error?.message || errorDetails.message || errorMessage;
      } else if (errorText) {
        errorMessage = errorText;
      }
      
      // Provide helpful error message
      if (errorMessage.includes('not found') || errorMessage.includes('not supported')) {
          errorMessage = `Model error: ${errorMessage}. ` +
            `Tried models: ${models.join(', ')}. ` +
            `Please check your Google AI API key and ensure it has access to Gemini models. ` +
            `Get your key from https://aistudio.google.com/apikey`;
      }
      
      console.error('Gemini API Error:', {
        status: response.status,
        statusText: response.statusText,
        errorMessage: errorMessage,
        errorDetails: errorDetails,
        modelsTried: models
      });
      
      throw new Error(errorMessage);
    }
  }
  
  return await response.json();
}

/**
 * Calls DeepSeek API via OpenRouter
 */
async function callDeepSeekAPI(apiKey, prompt) {
  // Validate and clean API key
  const cleanKey = apiKey.trim();
  
  if (!cleanKey) {
    throw new Error('API key is empty. Please set your OpenRouter API key in settings.');
  }
  
  if (!cleanKey.startsWith('sk-')) {
    throw new Error('Invalid OpenRouter API key format. Keys must start with "sk-". Get your key from https://openrouter.ai/keys');
  }
  
  // Log key info for debugging (without exposing full key)
  console.log('OpenRouter API Request:', {
    keyLength: cleanKey.length,
    keyPrefix: cleanKey.substring(0, 10) + '...',
    keyStartsWithSk: cleanKey.startsWith('sk-')
  });
  
  const headers = {
    'Authorization': `Bearer ${cleanKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': chrome.runtime.getURL('') || 'https://github.com/joelnithushan/Spell-Grammar-Corrector-Browser-Extension-For-Developers-',
    'X-Title': 'Spell & Grammar Checker Extension'
  };
  
  const requestBody = {
    model: 'deepseek/deepseek-chat',
    messages: [{
      role: 'user',
      content: prompt
    }],
    temperature: 0.1, // Lower temperature for faster, more deterministic responses
    max_tokens: 3000, // Reduced for faster responses
    stream: false // Ensure non-streaming for faster processing
  };
  
  console.log('Sending request to OpenRouter:', {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: requestBody.model,
    promptLength: prompt.length
  });
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    let errorDetails = null;
    
    try {
      const errorText = await response.text();
      console.error('OpenRouter API Error Response:', errorText);
      
      try {
        errorDetails = JSON.parse(errorText);
        errorMessage = errorDetails.error?.message || errorDetails.message || errorMessage;
      } catch (parseError) {
        errorMessage = errorText || errorMessage;
      }
    } catch (e) {
      console.error('Error reading response:', e);
    }
    
    // Provide more helpful error messages for OpenRouter
    const lowerError = errorMessage.toLowerCase();
    if (response.status === 401 || 
        lowerError.includes('auth') || 
        lowerError.includes('cookie') || 
        lowerError.includes('key') ||
        lowerError.includes('user') ||
        lowerError.includes('org') ||
        lowerError.includes('invalid')) {
      
      // Check if it's specifically the cookie error
      if (lowerError.includes('cookie')) {
        errorMessage = `Invalid API Key: The OpenRouter API key you provided is not valid or has expired. ` +
          `Please verify your key at https://openrouter.ai/keys and ensure it starts with "sk-". ` +
          `Make sure you copy the entire key without any extra spaces.`;
      } else {
        errorMessage = `Authentication failed: ${errorMessage}. ` +
          `Please verify your OpenRouter API key is correct and starts with "sk-". ` +
          `Get or verify your key at https://openrouter.ai/keys`;
      }
    }
    
    console.error('OpenRouter API Error:', {
      status: response.status,
      statusText: response.statusText,
      errorMessage: errorMessage,
      errorDetails: errorDetails
    });
    
    throw new Error(errorMessage);
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



