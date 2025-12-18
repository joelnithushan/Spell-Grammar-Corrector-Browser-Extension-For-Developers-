// Content script to check and highlight errors on the page
let isChecking = false;
let errorData = []; // Store errors with element references

// Signal that content script is ready
console.log('Spell & Grammar Checker content script loaded');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkPage') {
    checkPage(request.spellEnabled, request.grammarEnabled)
      .then(result => {
        sendResponse({ 
          success: true, 
          errorCount: result.errorCount,
          errors: result.errors 
        });
      })
      .catch(error => {
        console.error('Error in checkPage:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
  
  // Handle highlight request from popup
  if (request.action === 'highlightError') {
    highlightError(request.errorId);
    sendResponse({ success: true });
    return false;
  }
  
  // Handle clear highlights
  if (request.action === 'clearHighlights') {
    clearHighlights();
    sendResponse({ success: true });
    return false;
  }
  
  // Handle ping to check if script is loaded
  if (request.action === 'ping') {
    sendResponse({ success: true, ready: true });
    return false;
  }
});

async function checkPage(spellEnabled, grammarEnabled) {
  if (isChecking) {
    return { errorCount: 0, errors: [] };
  }

  isChecking = true;
  
  // Clear previous highlights and error data
  clearHighlights();
  errorData = [];

  // Get all text content from the page
  const textElements = getTextElements();
  let allErrors = [];
  let errorIdCounter = 0;

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
        // Store errors with element reference and unique ID
        errors.result.forEach(error => {
          const errorId = errorIdCounter++;
          const errorInfo = {
            id: errorId,
            word: error.word || '',
            suggestions: error.suggestions || [],
            type: error.type || 'spelling',
            position: error.position !== undefined ? error.position : text.indexOf(error.word || ''),
            element: element,
            elementText: text,
            context: getElementContext(element)
          };
          allErrors.push(errorInfo);
          errorData.push(errorInfo);
        });
      }
    } catch (error) {
      console.error('Error checking text:', error);
    }
  }

  isChecking = false;
  return { 
    errorCount: allErrors.length, 
    errors: allErrors.map(e => ({
      id: e.id,
      word: e.word,
      suggestions: e.suggestions,
      type: e.type,
      position: e.position,
      context: e.context
    }))
  };
}

function getElementContext(element) {
  // Create a unique selector for the element
  const path = [];
  let current = element;
  
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += '#' + current.id;
      path.unshift(selector);
      break;
    } else {
      let sibling = current;
      let nth = 1;
      while (sibling.previousElementSibling) {
        sibling = sibling.previousElementSibling;
        if (sibling.tagName === current.tagName) {
          nth++;
        }
      }
      if (nth > 1) {
        selector += `:nth-of-type(${nth})`;
      }
      path.unshift(selector);
    }
    current = current.parentElement;
  }
  
  return path.join(' > ');
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

function highlightError(errorId) {
  // Find the error by ID
  const error = errorData.find(e => e.id === errorId);
  if (!error) {
    console.error('Error not found:', errorId);
    return;
  }
  
  const element = error.element;
  const text = error.elementText;
  const word = error.word;
  let position = error.position;
  
  // If position is not valid, try to find the word
  if (position === undefined || position < 0) {
    position = text.indexOf(word);
  }
  
  // Clear any existing highlights first
  clearHighlights();
  
  // Store original HTML if not already stored
  if (!element.dataset.originalHtml) {
    element.dataset.originalHtml = element.innerHTML;
  }
  
  // Find and highlight the specific word
  if (position >= 0 && position < text.length) {
    const before = text.substring(0, position);
    const wordText = text.substring(position, position + word.length);
    const after = text.substring(position + word.length);
    
    // Create highlight span
    const highlightSpan = `<span class="spell-error spell-error-${error.type}" data-error-id="${errorId}" data-suggestions='${JSON.stringify(error.suggestions)}' data-type="${error.type}">${escapeHtml(wordText)}</span>`;
    const newHTML = escapeHtml(before) + highlightSpan + escapeHtml(after);
    
    // Replace element content
    element.innerHTML = newHTML;
    element.classList.add('spell-checked');
    element.dataset.hasErrors = 'true';
    
    // Scroll to element
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Add pulsing animation
    setTimeout(() => {
      const highlight = element.querySelector(`[data-error-id="${errorId}"]`);
      if (highlight) {
        highlight.classList.add('spell-error-highlighted');
        setTimeout(() => {
          highlight.classList.remove('spell-error-highlighted');
        }, 2000);
      }
    }, 100);
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
  // Restore original HTML for all elements that were modified
  document.querySelectorAll('[data-original-html]').forEach(el => {
    if (el.dataset.originalHtml) {
      el.innerHTML = el.dataset.originalHtml;
      delete el.dataset.originalHtml;
      el.classList.remove('spell-checked');
      delete el.dataset.hasErrors;
    }
  });
  
  // Also check elements with spell-checked class
  document.querySelectorAll('.spell-checked').forEach(el => {
    if (el.dataset.originalHtml) {
      el.innerHTML = el.dataset.originalHtml;
      delete el.dataset.originalHtml;
      el.classList.remove('spell-checked');
      delete el.dataset.hasErrors;
    }
  });
  
  // Remove all highlights
  document.querySelectorAll('.spell-error').forEach(el => {
    const parent = el.parentElement;
    if (parent && parent.dataset && parent.dataset.originalHtml) {
      parent.innerHTML = parent.dataset.originalHtml;
      delete parent.dataset.originalHtml;
      parent.classList.remove('spell-checked');
      delete parent.dataset.hasErrors;
    }
  });
  
  document.querySelectorAll('.suggestions-popup').forEach(el => {
    el.remove();
  });
}

