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
  
  // Scroll to element first
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  // Create a visual overlay without modifying the page HTML
  // Use Range API to find the exact text position
  const range = document.createRange();
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let textNode = null;
  let charCount = 0;
  let found = false;
  
  // Find the text node containing our word
  while (textNode = walker.nextNode()) {
    const nodeText = textNode.textContent;
    const nodeLength = nodeText.length;
    
    if (charCount + nodeLength > position) {
      // Found the text node containing our word
      const offset = position - charCount;
      
      if (offset + word.length <= nodeLength) {
        // Create range for the specific word
        range.setStart(textNode, offset);
        range.setEnd(textNode, offset + word.length);
        
        // Create overlay div positioned absolutely
        const rect = range.getBoundingClientRect();
        const overlay = document.createElement('div');
        overlay.className = `spell-error-overlay spell-error-${error.type}`;
        overlay.dataset.errorId = errorId;
        overlay.style.position = 'fixed';
        overlay.style.left = rect.left + 'px';
        overlay.style.top = rect.top + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        overlay.style.zIndex = '999999';
        overlay.style.pointerEvents = 'none';
        overlay.style.borderBottom = error.type === 'grammar' ? '3px wavy #f59e0b' : '3px wavy #ef4444';
        overlay.style.backgroundColor = error.type === 'grammar' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)';
        overlay.style.borderRadius = '2px';
        overlay.style.transition = 'all 0.3s ease';
        
        document.body.appendChild(overlay);
        
        // Add pulsing animation
        setTimeout(() => {
          overlay.classList.add('spell-error-highlighted');
          setTimeout(() => {
            overlay.classList.remove('spell-error-highlighted');
          }, 2000);
        }, 100);
        
        // Update position on scroll/resize
        const updatePosition = () => {
          const newRect = range.getBoundingClientRect();
          overlay.style.left = newRect.left + 'px';
          overlay.style.top = newRect.top + 'px';
          overlay.style.width = newRect.width + 'px';
          overlay.style.height = newRect.height + 'px';
        };
        
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        
        // Store cleanup function
        overlay.dataset.cleanup = 'true';
        overlay._cleanup = () => {
          window.removeEventListener('scroll', updatePosition, true);
          window.removeEventListener('resize', updatePosition);
        };
        
        found = true;
        break;
      }
    }
    
    charCount += nodeLength;
  }
  
  // Fallback: if we can't find exact position, just highlight the element
  if (!found) {
    const rect = element.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = `spell-error-overlay spell-error-${error.type}`;
    overlay.dataset.errorId = errorId;
    overlay.style.position = 'fixed';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.zIndex = '999999';
    overlay.style.pointerEvents = 'none';
    overlay.style.border = error.type === 'grammar' ? '3px solid #f59e0b' : '3px solid #ef4444';
    overlay.style.backgroundColor = error.type === 'grammar' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    overlay.style.borderRadius = '4px';
    
    document.body.appendChild(overlay);
    
    setTimeout(() => {
      overlay.classList.add('spell-error-highlighted');
      setTimeout(() => {
        overlay.classList.remove('spell-error-highlighted');
      }, 2000);
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
  // Remove all overlay highlights (non-intrusive)
  document.querySelectorAll('.spell-error-overlay').forEach(overlay => {
    if (overlay._cleanup) {
      overlay._cleanup();
    }
    overlay.remove();
  });
  
  // Remove any old-style highlights (for backward compatibility)
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

