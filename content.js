// Content Script
// Extracts text from web pages and handles error highlighting

(function() {
  'use strict';
  
  // Prevent multiple initializations
  if (window.spellGrammarChecker && window.spellGrammarChecker.initialized) {
    return;
  }
  
  // Initialize namespace
  window.spellGrammarChecker = {
    initialized: true,
    isAnalyzing: false,
    errors: [],
    highlights: []
  };
  
  console.log('Spell & Grammar Checker: Content script loaded');
  
  // Message listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyzePage') {
      analyzePage(request.options)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(error => {
          console.error('Analysis error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }
    
    if (request.action === 'highlightError') {
      highlightError(request.errorId);
      sendResponse({ success: true });
      return false;
    }
    
    if (request.action === 'clearHighlights') {
      clearHighlights();
      sendResponse({ success: true });
      return false;
    }
  });
  
  /**
   * Analyzes the current page
   */
  async function analyzePage(options = {}) {
    if (window.spellGrammarChecker.isAnalyzing) {
      return { errorCount: 0, errors: [] };
    }
    
    window.spellGrammarChecker.isAnalyzing = true;
    clearHighlights();
    
    try {
      // Extract text from page
      const textData = extractPageText();
      
      if (!textData.text || textData.text.trim().length === 0) {
        window.spellGrammarChecker.isAnalyzing = false;
        return { errorCount: 0, errors: [] };
      }
      
      console.log('Extracted text length:', textData.text.length);
      
      // Limit text length for faster processing (8000 chars is optimal for speed)
      const MAX_TEXT_LENGTH = 8000;
      let textToAnalyze = textData.text;
      let textTruncated = false;
      
      if (textToAnalyze.length > MAX_TEXT_LENGTH) {
        textToAnalyze = textToAnalyze.substring(0, MAX_TEXT_LENGTH);
        textTruncated = true;
        console.log(`Text truncated from ${textData.text.length} to ${MAX_TEXT_LENGTH} characters for faster processing`);
      }
      
      // Send to background for analysis
      const response = await chrome.runtime.sendMessage({
        action: 'analyzeText',
        text: textToAnalyze,
        options: options,
        textTruncated: textTruncated
      });
      
      if (!response || !response.success) {
        throw new Error(response?.error || 'Analysis failed');
      }
      
      // Map errors back to elements
      const mappedErrors = mapErrorsToElements(response.result, textData);
      window.spellGrammarChecker.errors = mappedErrors;
      
      window.spellGrammarChecker.isAnalyzing = false;
      
      return {
        errorCount: mappedErrors.length,
        errors: mappedErrors.map(e => ({
          id: e.id,
          word: e.word,
          suggestions: e.suggestions,
          type: e.type,
          context: e.context
        })),
        textTruncated: textTruncated
      };
    } catch (error) {
      window.spellGrammarChecker.isAnalyzing = false;
      throw error;
    }
  }
  
  /**
   * Extracts visible text from the page
   */
  function extractPageText() {
    const elements = [];
    const elementMap = [];
    let fullText = '';
    let currentPosition = 0;
    
    // Get all text-containing elements
    const selectors = 'p, h1, h2, h3, h4, h5, h6, li, td, th, span, div, label, button, a, article, section, main, aside, blockquote, figcaption';
    const allElements = document.querySelectorAll(selectors);
    
    allElements.forEach(element => {
      // Skip hidden or non-visible elements
      if (!isElementVisible(element)) {
        return;
      }
      
      // Skip code blocks, scripts, styles
      if (element.closest('pre, code, script, style, noscript')) {
        return;
      }
      
      const text = element.textContent.trim();
      if (text.length < 3) {
        return;
      }
      
      const startPos = currentPosition;
      const endPos = currentPosition + text.length;
      
      elementMap.push({
        element: element,
        text: text,
        startPos: startPos,
        endPos: endPos,
        context: getElementContext(element)
      });
      
      fullText += text + '\n\n';
      currentPosition = endPos + 2; // +2 for \n\n
    });
    
    return {
      text: fullText.trim(),
      elementMap: elementMap
    };
  }
  
  /**
   * Checks if element is visible
   */
  function isElementVisible(element) {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || 
        style.visibility === 'hidden' || 
        style.opacity === '0') {
      return false;
    }
    
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  
  /**
   * Gets element context for error display
   */
  function getElementContext(element) {
    const text = element.textContent.trim();
    return text.length > 100 ? text.substring(0, 100) + '...' : text;
  }
  
  /**
   * Maps AI errors back to page elements
   */
  function mapErrorsToElements(errors, textData) {
    const mapped = [];
    let errorId = 0;
    
    errors.forEach(error => {
      const position = error.position || -1;
      
      // Find element containing this error
      const elementInfo = textData.elementMap.find(info => 
        position >= info.startPos && position < info.endPos
      );
      
      if (elementInfo) {
        const positionInElement = position - elementInfo.startPos;
        const endPosition = error.endPosition 
          ? error.endPosition - elementInfo.startPos
          : positionInElement + (error.word || '').length;
        
        mapped.push({
          id: errorId++,
          word: error.word || '',
          suggestions: error.suggestions || [],
          type: error.type || 'spelling',
          position: positionInElement,
          endPosition: endPosition,
          element: elementInfo.element,
          elementText: elementInfo.text,
          context: elementInfo.context
        });
      }
    });
    
    return mapped;
  }
  
  /**
   * Highlights an error on the page
   */
  function highlightError(errorId) {
    const error = window.spellGrammarChecker.errors.find(e => e.id === errorId);
    if (!error) return;
    
    clearHighlights();
    
    const element = error.element;
    const text = error.elementText;
    const word = error.word;
    const position = error.position;
    
    // Scroll to element
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Find text node and create highlight
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
    
    while (textNode = walker.nextNode()) {
      const nodeText = textNode.textContent;
      const nodeLength = nodeText.length;
      
      if (charCount + nodeLength > position) {
        const offset = position - charCount;
        
        if (offset + word.length <= nodeLength) {
          range.setStart(textNode, offset);
          range.setEnd(textNode, offset + word.length);
          
          const rect = range.getBoundingClientRect();
          const overlay = createHighlightOverlay(rect, error);
          
          document.body.appendChild(overlay);
          window.spellGrammarChecker.highlights.push(overlay);
          
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
    
    // Fallback: highlight entire element
    if (!found) {
      const rect = element.getBoundingClientRect();
      const overlay = createHighlightOverlay(rect, error);
      document.body.appendChild(overlay);
      window.spellGrammarChecker.highlights.push(overlay);
    }
  }
  
  /**
   * Creates a highlight overlay
   */
  function createHighlightOverlay(rect, error) {
    const overlay = document.createElement('div');
    overlay.className = 'spell-grammar-highlight';
    overlay.dataset.errorId = error.id;
    overlay.style.position = 'fixed';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.zIndex = '999999';
    overlay.style.pointerEvents = 'none';
    overlay.style.borderBottom = error.type === 'grammar' 
      ? '3px wavy #f59e0b' 
      : '3px wavy #ef4444';
    overlay.style.backgroundColor = error.type === 'grammar'
      ? 'rgba(245, 158, 11, 0.15)'
      : 'rgba(239, 68, 68, 0.15)';
    overlay.style.borderRadius = '2px';
    overlay.style.transition = 'all 0.3s ease';
    
    // Add pulse animation
    setTimeout(() => {
      overlay.style.transform = 'scale(1.02)';
      setTimeout(() => {
        overlay.style.transform = 'scale(1)';
      }, 300);
    }, 100);
    
    return overlay;
  }
  
  /**
   * Clears all highlights
   */
  function clearHighlights() {
    window.spellGrammarChecker.highlights.forEach(overlay => {
      if (overlay._cleanup) {
        overlay._cleanup();
      }
      overlay.remove();
    });
    window.spellGrammarChecker.highlights = [];
  }
  
})();



