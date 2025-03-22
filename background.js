// background.js - Handles proxy settings in the background
let currentProxy = null;

// Initialize when extension is first installed or updated
chrome.runtime.onInstalled.addListener(function() {
  console.log('Extension installed or updated');
  
  // Check if we have the proxy permission
  chrome.permissions.contains({
    permissions: ['proxy']
  }, function(result) {
    console.log('Has proxy permission:', result);
    if (!result) {
      console.error('Missing proxy permission! Proxy switching will not work!');
    }
  });
  
  // Add error handler for proxy errors
  chrome.proxy.onProxyError.addListener(function(details) {
    console.error('Proxy error:', details);
  });
  
  // Check for stored proxy configuration
  chrome.storage.sync.get(['currentProxy'], function(result) {
    console.log('Retrieved stored proxy:', result);
    if (result.currentProxy) {
      setProxyConfig(result.currentProxy);
    }
  });
});

// Function to convert PAC content to ASCII-only by encoding non-ASCII domains
function convertPacToAscii(pacContent) {
  // Replace any non-ASCII characters with their escaped representation
  let convertedContent = pacContent.replace(/[^\x00-\x7F]/g, function(char) {
    return '\\u' + ('0000' + char.charCodeAt(0).toString(16)).slice(-4);
  });
  
  return convertedContent;
}

// Function to help debug PAC issues
function debugPacSettings(pacConfig) {
  console.log('Debugging PAC configuration:');
  console.log('- PAC source:', pacConfig.pacSource);
  
  if (pacConfig.pacSource === 'url') {
    console.log('- PAC URL:', pacConfig.pacUrl);
    
    // Test if URL is accessible
    fetch(pacConfig.pacUrl, { method: 'GET' })
      .then(response => {
        console.log('- PAC URL status:', response.status);
        if (!response.ok) {
          console.error('  Cannot access PAC URL:', response.statusText);
          return;
        }
        
        return response.text();
      })
      .then(text => {
        if (text) {
          console.log('- PAC file size:', text.length, 'bytes');
          console.log('- PAC file contains FindProxyForURL:', text.includes('FindProxyForURL'));
          console.log('- First 100 chars:', text.substring(0, 100).replace(/\n/g, ' '));
          console.log('- Contains non-ASCII characters:', /[^\x00-\x7F]/.test(text));
        }
      })
      .catch(error => {
        console.error('  Error fetching PAC URL:', error.message);
      });
  } else if (pacConfig.pacSource === 'content') {
    console.log('- PAC file name:', pacConfig.fileName);
    console.log('- PAC content length:', pacConfig.pacContent ? pacConfig.pacContent.length : 0);
    console.log('- PAC file contains FindProxyForURL:', 
      pacConfig.pacContent ? pacConfig.pacContent.includes('FindProxyForURL') : false);
    console.log('- Contains non-ASCII characters:', 
      pacConfig.pacContent ? /[^\x00-\x7F]/.test(pacConfig.pacContent) : false);
  }
}

// Function to create a simple PAC script
function createSimplePacScript(proxyString) {
  return `function FindProxyForURL(url, host) {
  // Default to the specified proxy
  return "${proxyString}";
}`;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'setProxy') {
    setProxyConfig(request.proxy);
    sendResponse({success: true});
    return true;
  }
  
  if (request.action === 'setDirectConnection') {
    clearProxyConfig();
    sendResponse({success: true});
    return true;
  }
  
  if (request.action === 'getProxyStatus') {
    if (currentProxy) {
      let proxyInfo;
      if (currentProxy.configType === 'pac') {
        if (currentProxy.pacSource === 'url') {
          proxyInfo = `${currentProxy.name} (PAC URL: ${currentProxy.pacUrl})`;
        } else {
          proxyInfo = `${currentProxy.name} (PAC File: ${currentProxy.fileName})`;
        }
      } else {
        proxyInfo = `${currentProxy.name} (${currentProxy.type}://${currentProxy.host}:${currentProxy.port})`;
      }
      
      sendResponse({
        proxyInUse: true,
        proxyInfo: proxyInfo
      });
    } else {
      sendResponse({proxyInUse: false});
    }
    return true;
  }
  
  if (request.action === 'testPacScript') {
    try {
      const pacScript = request.pacScript;
      
      // Check for required function
      if (!pacScript.includes('function FindProxyForURL')) {
        throw new Error('PAC file must contain a properly defined FindProxyForURL function');
      }
      
      // Check for basic syntax issues
      const bracketCount = {
        '{': (pacScript.match(/\{/g) || []).length,
        '}': (pacScript.match(/\}/g) || []).length,
        '(': (pacScript.match(/\(/g) || []).length,
        ')': (pacScript.match(/\)/g) || []).length
      };
      
      if (bracketCount['{'] !== bracketCount['}']) {
        throw new Error(`Syntax error: Mismatched curly braces (${bracketCount['{']} vs ${bracketCount['}']})}`);
      }
      
      if (bracketCount['('] !== bracketCount[')']) {
        throw new Error(`Syntax error: Mismatched parentheses (${bracketCount['(']} vs ${bracketCount[')']})}`);
      }
      
      // Check for non-ASCII characters
      const hasNonAscii = /[^\x00-\x7F]/.test(pacScript);
      
      // Check for common PAC functions
      const recommendedFunctions = ['isInNet', 'dnsResolve', 'shExpMatch', 'isPlainHostName'];
      const missingFunctions = recommendedFunctions.filter(func => !pacScript.includes(func));
      
      // Create warning messages
      let warnings = [];
      if (hasNonAscii) {
        warnings.push('PAC file contains non-ASCII characters which will be automatically converted');
      }
      
      if (missingFunctions.length > 0) {
        warnings.push(`PAC file might be missing common helper functions: ${missingFunctions.join(', ')}`);
      }
      
      sendResponse({
        success: true,
        warnings: warnings.length > 0 ? warnings.join('. ') : null
      });
    } catch (error) {
      console.error('PAC script validation error:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    }
    return true;
  }
  
  if (request.action === 'testProxyConnection') {
    testProxyConnection()
      .then(result => {
        sendResponse({
          success: true,
          proxyInfo: result
        });
      })
      .catch(error => {
        console.error('Proxy test error:', error);
        sendResponse({
          success: false,
          error: error.message || 'Unable to connect through the proxy'
        });
      });
    return true; // Required for async response
  }
  
  if (request.action === 'createSimplePac') {
    const proxyString = request.proxyString;
    const simplePacScript = createSimplePacScript(proxyString);
    
    sendResponse({
      success: true,
      pacScript: simplePacScript
    });
    return true;
  }
});

// Function to test if proxy is working
async function testProxyConnection() {
  try {
    // Get current proxy settings
    const settings = await new Promise((resolve) => {
      chrome.proxy.settings.get({}, resolve);
    });
    
    // Log proxy settings for debugging
    console.log('Current proxy settings:', settings);
    
    // Try to fetch a known URL through the proxy
    const response = await fetch('https://httpbin.org/ip', {
      method: 'GET',
      cache: 'no-cache' // Bypass cache to ensure we're testing the actual connection
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Connection test result:', data);
    
    let infoMessage = '';
    
    // Determine what kind of connection is in use
    if (settings.value.mode === 'direct') {
      infoMessage = 'Connected directly (no proxy). IP: ' + data.origin;
    } else if (settings.value.mode === 'pac_script') {
      infoMessage = 'Connected through PAC script. IP: ' + data.origin;
    } else if (settings.value.mode === 'fixed_servers') {
      infoMessage = 'Connected through fixed proxy. IP: ' + data.origin;
    } else {
      infoMessage = 'Connection successful. IP: ' + data.origin;
    }
    
    return infoMessage;
  } catch (error) {
    console.error('Test connection error:', error);
    
    // Get more specific error information
    let errorMsg = 'Connection failed: ' + error.message;
    
    // Check if this is a proxy error
    if (error.message.includes('ERR_PROXY_CONNECTION_FAILED') || 
        error.message.includes('ERR_TUNNEL_CONNECTION_FAILED')) {
      errorMsg = 'Cannot connect to proxy server. Please check your proxy settings.';
    } else if (error.message.includes('ERR_NAME_NOT_RESOLVED')) {
      errorMsg = 'DNS lookup failed. Check your internet connection or proxy server.';
    }
    
    throw new Error(errorMsg);
  }
}

// Set proxy configuration
async function setProxyConfig(proxy) {
  currentProxy = proxy;
  
  // Save current proxy to sync storage
  chrome.storage.sync.set({currentProxy: proxy});
  
  // Add detailed debugging for PAC configurations
  if (proxy.configType === 'pac') {
    debugPacSettings(proxy);
  }
  
  let config;
  
  // Check if this is a PAC file configuration or manual configuration
  if (proxy.configType === 'pac') {
    console.log('Setting PAC proxy configuration');
    // Configure PAC file settings
    config = {
      mode: "pac_script",
      pacScript: {}
    };
    
    if (proxy.pacSource === 'url') {
      try {
        // Fetch the PAC content from URL to check for non-ASCII characters
        const response = await fetch(proxy.pacUrl);
        if (!response.ok) {
          console.error(`Failed to fetch PAC URL: ${response.status} ${response.statusText}`);
          chrome.runtime.sendMessage({
            action: 'pacError',
            error: `Failed to access PAC URL: ${response.status} ${response.statusText}`
          });
          return;
        }
        
        const pacContent = await response.text();
        
        // Check for non-ASCII characters
        if (/[^\x00-\x7F]/.test(pacContent)) {
          console.warn('PAC file from URL contains non-ASCII characters which will be converted');
          
          // Convert to ASCII-only
          const asciiPacContent = convertPacToAscii(pacContent);
          
          // Use the content directly instead of the URL
          config.pacScript.data = asciiPacContent;
        } else {
          // If no encoding issues, use the URL directly
          config.pacScript.url = proxy.pacUrl;
        }
        
        config.pacScript.mandatory = true;
        console.log('Using PAC URL:', proxy.pacUrl);
      } catch (error) {
        console.error('Error fetching PAC URL:', error);
        chrome.runtime.sendMessage({
          action: 'pacError',
          error: `Failed to access PAC URL: ${error.message}`
        });
        return;
      }
    } else {
      // Use PAC script content directly
      // Basic validation without eval
      if (!proxy.pacContent.includes('FindProxyForURL')) {
        console.error('PAC file content does not contain FindProxyForURL function');
        chrome.runtime.sendMessage({
          action: 'pacError',
          error: 'Invalid PAC file: FindProxyForURL function not found'
        });
        return;
      }
      
      // Check for non-ASCII characters
      if (/[^\x00-\x7F]/.test(proxy.pacContent)) {
        console.warn('PAC file contains non-ASCII characters, converting to ASCII-only');
        
        // Convert the PAC content to ASCII-only before setting it
        const asciiPacContent = convertPacToAscii(proxy.pacContent);
        
        // Log the original and converted content for debugging
        console.log('Original PAC content (first 100 chars):', proxy.pacContent.substring(0, 100) + '...');
        console.log('ASCII-only PAC content (first 100 chars):', asciiPacContent.substring(0, 100) + '...');
        
        config.pacScript.data = asciiPacContent;
      } else {
        config.pacScript.data = proxy.pacContent;
      }
      
      config.pacScript.mandatory = true;
      console.log('Using PAC content from file:', proxy.fileName);
    }
  } else {
    console.log('Setting manual proxy configuration');
    // Configure manual proxy settings
    config = {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: proxy.type,
          host: proxy.host,
          port: parseInt(proxy.port, 10)
        },
        bypassList: ["localhost", "127.0.0.1"]
      }
    };
    
    console.log('Manual proxy details:', proxy.type, proxy.host, proxy.port);
  }
  
  console.log('Applying proxy configuration:', JSON.stringify(config));
  
  // Apply the proxy settings with better error handling
  chrome.proxy.settings.set(
    {value: config, scope: 'regular'},
    async function() {
      if (chrome.runtime.lastError) {
        // Extract more detailed error information
        let errorMessage = 'Unknown error occurred';
        try {
          if (chrome.runtime.lastError.message) {
            errorMessage = chrome.runtime.lastError.message;
          } else {
            errorMessage = JSON.stringify(chrome.runtime.lastError);
          }
        } catch (e) {
          errorMessage = 'Error details could not be displayed';
        }
        
        console.error('Error applying proxy settings:', errorMessage);
        
        // Handle the ASCII error specifically
        if (errorMessage.includes('ASCII') && proxy.configType === 'pac') {
          // Special handling for the ASCII error
          chrome.runtime.sendMessage({
            action: 'pacAsciiError',
            originalError: errorMessage,
            proxyConfig: proxy
          });
        } else {
          // Generic error handling
          chrome.runtime.sendMessage({
            action: 'proxyError',
            error: `Error applying proxy settings: ${errorMessage}`
          });
        }
        
        // If there was an error, revert to direct connection
        if (proxy.configType === 'pac') {
          clearProxyConfig();
        }
      } else {
        console.log('Proxy settings applied successfully');
        // Check if the settings were applied correctly
        chrome.proxy.settings.get({}, function(details) {
          console.log('Current effective proxy settings:', JSON.stringify(details));
          
          // Verify the proxy mode was set correctly
          if (details.value.mode !== config.mode) {
            console.error('Proxy mode mismatch, settings not applied correctly');
            chrome.runtime.sendMessage({
              action: 'proxyError',
              error: 'Proxy settings could not be applied. Check permissions.'
            });
          }
        });
      }
    }
  );
}

function clearProxyConfig() {
  currentProxy = null;
  
  // Remove current proxy from sync storage
  chrome.storage.sync.remove(['currentProxy']);
  
  const config = {
    mode: "direct"
  };
  
  console.log('Clearing proxy settings, using direct connection');
  
  // Reset to direct connection
  chrome.proxy.settings.set(
    {value: config, scope: 'regular'},
    function() {
      if (chrome.runtime.lastError) {
        console.error('Error applying proxy settings:', JSON.stringify(chrome.runtime.lastError));
        
        // Extract more detailed error message
        let errorMessage = 'Unknown error occurred';
        if (chrome.runtime.lastError.message) {
          errorMessage = chrome.runtime.lastError.message;
        } else {
          try {
            errorMessage = JSON.stringify(chrome.runtime.lastError);
          } catch (e) {
            errorMessage = 'Error details could not be displayed';
          }
        }
        
        // Notify the popup about the error
        chrome.runtime.sendMessage({
          action: 'proxyError',
          error: `Error clearing proxy settings: ${errorMessage}`
        });
      } else {
        console.log('Proxy settings cleared successfully');
        // Check if the settings were applied correctly
        chrome.proxy.settings.get({}, function(details) {
          console.log('Current proxy settings after clearing:', JSON.stringify(details));
        });
      }
    }
  );
}
