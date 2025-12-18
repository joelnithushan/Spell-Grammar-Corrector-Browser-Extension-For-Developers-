// Content script to check and highlight errors on the page
// Use IIFE to prevent conflicts when script is injected multiple times
(function() {
  'use strict';
  
  // Check if already initialized
  if (window.spellGrammarChecker && window.spellGrammarChecker.initialized) {
    console.log('Spell & Grammar Checker already initialized, skipping...');
    return;
  }
  
  // Initialize namespace
  window.spellGrammarChecker = {
    isChecking: false,
    errorData: [],
    initialized: true
  };
  
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
    if (window.spellGrammarChecker.isChecking) {
      return { errorCount: 0, errors: [] };
    }

    window.spellGrammarChecker.isChecking = true;
    
    // Clear previous highlights and error data
    clearHighlights();
    window.spellGrammarChecker.errorData = [];

    // Get all text content from the page
    const textElements = getTextElements();
    
    // Build a map of element to its text and position in the full text
    const elementMap = [];
    let fullText = '';
    let currentPosition = 0;
    
    textElements.forEach(element => {
      const text = element.textContent.trim();
      if (text.length < 3) return; // Skip very short texts
      
      const startPosition = currentPosition;
      const endPosition = currentPosition + text.length;
      
      elementMap.push({
        element: element,
        text: text,
        startPosition: startPosition,
        endPosition: endPosition,
        context: getElementContext(element)
      });
      
      // Add text with separator to track element boundaries
      fullText += text + '\n\n';
      currentPosition = endPosition + 2; // +2 for the \n\n separator
    });

    if (fullText.trim().length === 0) {
      window.spellGrammarChecker.isChecking = false;
      return { errorCount: 0, errors: [] };
    }

    try {
      // Send entire page text in one API request
      const textToCheck = fullText.trim();
      console.log('Sending text to API, length:', textToCheck.length);
      console.log('Text preview:', textToCheck.substring(0, 200));
      
      const response = await chrome.runtime.sendMessage({
        action: 'checkText',
        text: textToCheck,
        spellEnabled: spellEnabled,
        grammarEnabled: grammarEnabled
      });

      console.log('API Response:', response);

      if (!response || !response.success) {
        console.error('API request failed:', response?.error);
        window.spellGrammarChecker.isChecking = false;
        return { errorCount: 0, errors: [], error: response?.error || 'API request failed' };
      }

      if (!response.result || response.result.length === 0) {
        console.log('No errors found by AI');
        window.spellGrammarChecker.isChecking = false;
        return { errorCount: 0, errors: [] };
      }

      console.log('Found', response.result.length, 'errors from AI');

      // Map errors back to their elements
      let allErrors = [];
      let errorIdCounter = 0;

      response.result.forEach(error => {
        const errorPosition = error.position !== undefined ? error.position : -1;
        
        // Find which element contains this error
        const elementInfo = elementMap.find(info => 
          errorPosition >= info.startPosition && errorPosition < info.endPosition
        );

        if (elementInfo) {
          // Calculate position within the element's text
          const positionInElement = errorPosition - elementInfo.startPosition;
          const endPosition = error.endPosition !== undefined 
            ? error.endPosition - elementInfo.startPosition 
            : positionInElement + (error.word || '').length;
          
          const errorId = errorIdCounter++;
          const errorInfo = {
            id: errorId,
            word: error.word || '',
            suggestions: error.suggestions || [],
            type: error.type || 'spelling',
            position: positionInElement,
            endPosition: endPosition,
            element: elementInfo.element,
            elementText: elementInfo.text,
            context: elementInfo.context
          };
          allErrors.push(errorInfo);
          window.spellGrammarChecker.errorData.push(errorInfo);
        } else {
          // If position not found, try to find by word in element text
          elementMap.forEach(elementInfo => {
            const wordIndex = elementInfo.text.indexOf(error.word || '');
            if (wordIndex >= 0) {
              const errorId = errorIdCounter++;
              const errorInfo = {
                id: errorId,
                word: error.word || '',
                suggestions: error.suggestions || [],
                type: error.type || 'spelling',
                position: wordIndex,
                endPosition: wordIndex + (error.word || '').length,
                element: elementInfo.element,
                elementText: elementInfo.text,
                context: elementInfo.context
              };
              allErrors.push(errorInfo);
              window.spellGrammarChecker.errorData.push(errorInfo);
            }
          });
        }
      });

      window.spellGrammarChecker.isChecking = false;
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
    } catch (error) {
      console.error('Error checking page:', error);
      window.spellGrammarChecker.isChecking = false;
      return { errorCount: 0, errors: [] };
    }
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
    const selectors = 'p, h1, h2, h3, h4, h5, h6, li, td, th, span, div, label, button, a, article, section, main, aside, blockquote, figcaption';
    const elements = Array.from(document.querySelectorAll(selectors));
    
    return elements.filter(el => {
      // Skip script, style, and other non-content elements
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') {
        return false;
      }
      
      // Filter out elements that are hidden
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      
      // Skip if element is too small (likely not visible)
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        return false;
      }
      
      // Check if element has meaningful text content
      const text = el.textContent.trim();
      
      // Skip if no text or only whitespace
      if (text.length < 2) {
        return false;
      }
      
      // Skip if contains script/style/iframe
      if (el.querySelector('script, style, iframe, noscript')) {
        return false;
      }
      
      // Include if has text content (either direct or from children)
      return text.length > 0;
    });
  }

  function highlightError(errorId) {
    // Find the error by ID
    const error = window.spellGrammarChecker.errorData.find(e => e.id === errorId);
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

})();
