// Content script to check and highlight errors on the page
let isChecking = false;

// Signal that content script is ready
console.log('Spell & Grammar Checker content script loaded');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkPage') {
    checkPage(request.spellEnabled, request.grammarEnabled)
      .then(result => {
        sendResponse({ success: true, errorCount: result.errorCount });
      })
      .catch(error => {
        console.error('Error in checkPage:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
  
  // Handle ping to check if script is loaded
  if (request.action === 'ping') {
    sendResponse({ success: true, ready: true });
    return false;
  }
});

async function checkPage(spellEnabled, grammarEnabled) {
  if (isChecking) {
    return { errorCount: 0 };
  }

  isChecking = true;
  
  // Clear previous highlights
  clearHighlights();

  // Get all text content from the page
  const textElements = getTextElements();
  let totalErrors = 0;

  // Process text in chunks to avoid overwhelming the API
  for (const element of textElements) {
    const text = element.textContent.trim();
    if (text.length < 3) continue; // Skip very short texts

    try {
      // Send to background script for API call
      const errors = await chrome.runtime.sendMessage({
        action: 'checkText',
        text: text,
        spellEnabled: spellEnabled,
        grammarEnabled: grammarEnabled
      });

      if (errors.success && errors.result && errors.result.length > 0) {
        highlightErrors(element, errors.result, text);
        totalErrors += errors.result.length;
      }
    } catch (error) {
      console.error('Error checking text:', error);
    }
  }

  isChecking = false;
  return { errorCount: totalErrors };
}

function getTextElements() {
  // Get all text-containing elements, excluding script, style, etc.
  const selectors = 'p, h1, h2, h3, h4, h5, h6, li, td, th, span, div, label, button, a';
  const elements = Array.from(document.querySelectorAll(selectors));
  
  return elements.filter(el => {
    // Filter out elements that are hidden or contain only other elements
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    
    // Check if element has meaningful text content
    const text = el.textContent.trim();
    return text.length > 0 && !el.querySelector('script, style, iframe');
  });
}

function highlightErrors(element, errors, originalText) {
  if (!errors || errors.length === 0) return;
  
  // Store original HTML if not already stored
  if (!element.dataset.originalHtml) {
    element.dataset.originalHtml = element.innerHTML;
  }
  
  // Sort errors by position (descending) to avoid index shifting
  const sortedErrors = [...errors].sort((a, b) => {
    const posA = a.position !== undefined ? a.position : originalText.indexOf(a.word || '');
    const posB = b.position !== undefined ? b.position : originalText.indexOf(b.word || '');
    return posB - posA;
  });
  
  let processedText = originalText;
  const localHighlights = [];
  
  // Build highlighted text by replacing errors with markers
  sortedErrors.forEach((error, index) => {
    const word = error.word || '';
    let position = error.position;
    
    if (position === undefined || position < 0) {
      position = processedText.indexOf(word);
    }
    
    if (position >= 0 && position < processedText.length) {
      const before = processedText.substring(0, position);
      const wordText = processedText.substring(position, position + word.length);
      const after = processedText.substring(position + word.length);
      
      // Create highlight element data
      const highlightData = {
        word: wordText,
        suggestions: error.suggestions || [],
        type: error.type || 'spelling',
        position: position
      };
      
      // Replace with marker
      processedText = before + `__HIGHLIGHT_${index}__` + after;
      localHighlights.push(highlightData);
    }
  });
  
  // Rebuild the text with highlights
  if (localHighlights.length > 0) {
    let finalHTML = processedText;
    
    // Replace markers with actual highlight spans
    localHighlights.forEach((highlightData, index) => {
      const marker = `__HIGHLIGHT_${index}__`;
      const highlightSpan = `<span class="spell-error spell-error-${highlightData.type}" data-suggestions='${JSON.stringify(highlightData.suggestions)}' data-type="${highlightData.type}">${escapeHtml(highlightData.word)}</span>`;
      finalHTML = finalHTML.replace(marker, highlightSpan);
    });
    
    // Replace element content
    element.innerHTML = finalHTML;
    
    // Add click handlers to all highlights
    element.querySelectorAll('.spell-error').forEach(highlight => {
      highlight.addEventListener('click', (e) => {
        e.stopPropagation();
        const suggestions = JSON.parse(highlight.dataset.suggestions || '[]');
        showSuggestions(highlight, suggestions);
      });
    });
    
    element.classList.add('spell-checked');
    element.dataset.hasErrors = 'true';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showSuggestions(element, suggestions) {
  // Remove existing suggestion popup
  const existing = document.querySelector('.suggestions-popup');
  if (existing) {
    existing.remove();
  }

  if (!suggestions || suggestions.length === 0) {
    return;
  }

  // Create popup
  const popup = document.createElement('div');
  popup.className = 'suggestions-popup';
  
  const title = document.createElement('div');
  title.className = 'suggestions-title';
  title.textContent = 'Suggestions:';
  popup.appendChild(title);

  suggestions.forEach((suggestion, index) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.textContent = suggestion;
    item.addEventListener('click', () => {
      replaceWord(element, suggestion);
      popup.remove();
    });
    popup.appendChild(item);
  });

  // Position popup near the element
  const rect = element.getBoundingClientRect();
  popup.style.left = rect.left + 'px';
  popup.style.top = (rect.bottom + 5) + 'px';
  
  document.body.appendChild(popup);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function closePopup(e) {
      if (!popup.contains(e.target) && e.target !== element) {
        popup.remove();
        document.removeEventListener('click', closePopup);
      }
    });
  }, 100);
}

function replaceWord(element, replacement) {
  if (element.parentElement) {
    element.textContent = replacement;
    element.classList.remove('spell-error');
    element.classList.add('spell-corrected');
  }
}

function clearHighlights() {
  // Remove all highlights
  document.querySelectorAll('.spell-error').forEach(el => {
    el.classList.remove('spell-error');
  });
  
  document.querySelectorAll('.suggestions-popup').forEach(el => {
    el.remove();
  });
  
  highlights = [];
}

