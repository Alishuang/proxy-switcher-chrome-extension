// Save PAC configuration to storage
function savePacConfig(pacConfig) {
  chrome.storage.sync.get(['proxies'], function(result) {
    const proxies = result.proxies || [];
    proxies.push(pacConfig);
    chrome.storage.sync.set({proxies: proxies}, function() {
      loadSavedProxies();
      clearInputFields('pac');
      // Collapse the add proxy section after adding
      document.getElementById('add-proxy-content').classList.remove('expanded');
      document.getElementById('add-proxy-chevron').classList.remove('expanded');
    });
  });
}

document.addEventListener('DOMContentLoaded', function() {
  // Load saved proxies and current status when popup opens
  loadSavedProxies();
  getCurrentProxyStatus();
  
  // Setup collapsible sections
  const addProxyToggle = document.getElementById('add-proxy-toggle');
  const addProxyContent = document.getElementById('add-proxy-content');
  const addProxyChevron = document.getElementById('add-proxy-chevron');
  
  addProxyToggle.addEventListener('click', function() {
    if (addProxyContent.classList.contains('expanded')) {
      addProxyContent.classList.remove('expanded');
      addProxyChevron.classList.remove('expanded');
    } else {
      addProxyContent.classList.add('expanded');
      addProxyChevron.classList.add('expanded');
    }
  });
  
  // Tab switching functionality
  const tabButtons = document.querySelectorAll('.tab-button');
  tabButtons.forEach(button => {
    button.addEventListener('click', function() {
      // Remove active class from all tabs
      tabButtons.forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      
      // Add active class to current tab
      this.classList.add('active');
      const tabName = this.getAttribute('data-tab');
      document.getElementById(tabName + '-config').classList.add('active');
    });
  });
  
  // PAC source selection (URL or File)
  const pacSourceRadios = document.querySelectorAll('input[name="pacSource"]');
  pacSourceRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      if (this.value === 'url') {
        document.getElementById('pac-url-input').style.display = 'block';
        document.getElementById('pac-file-input').style.display = 'none';
      } else {
        document.getElementById('pac-url-input').style.display = 'none';
        document.getElementById('pac-file-input').style.display = 'block';
      }
    });
  });
  
  // File upload handling
  document.getElementById('pacFileUpload').addEventListener('change', function(event) {
    const fileNameSpan = document.getElementById('selectedFileName');
    if (this.files.length > 0) {
      fileNameSpan.textContent = this.files[0].name;
    } else {
      fileNameSpan.textContent = 'No file selected';
    }
  });
  
  // Add a new manual proxy configuration
  document.getElementById('addProxy').addEventListener('click', function() {
    const name = document.getElementById('proxyName').value;
    const type = document.getElementById('proxyType').value;
    const host = document.getElementById('proxyHost').value;
    const port = parseInt(document.getElementById('proxyPort').value, 10);
    
    if (!name || !host || isNaN(port)) {
      alert('Please fill in all fields correctly.');
      return;
    }
    
    const proxyConfig = {
      name: name,
      configType: 'manual', // Specify this is a manual configuration
      type: type,
      host: host,
      port: port
    };
    
    chrome.storage.sync.get(['proxies'], function(result) {
      const proxies = result.proxies || [];
      proxies.push(proxyConfig);
      chrome.storage.sync.set({proxies: proxies}, function() {
        loadSavedProxies();
        clearInputFields('manual');
        // Collapse the add proxy section after adding
        addProxyContent.classList.remove('expanded');
        addProxyChevron.classList.remove('expanded');
      });
    });
  });
  
  // Improved PAC file handling with CSP-friendly validation
  document.getElementById('addPacConfig').addEventListener('click', function() {
    const name = document.getElementById('pacName').value;
    const pacSource = document.querySelector('input[name="pacSource"]:checked').value;
    
    if (!name) {
      alert('Please enter a name for the PAC configuration.');
      return;
    }
    
    if (pacSource === 'url') {
      const pacUrl = document.getElementById('pacUrl').value;
      if (!pacUrl) {
        alert('Please enter a URL for the PAC file.');
        return;
      }
      
      // Validate URL format
      try {
        new URL(pacUrl);
      } catch (e) {
        alert('Please enter a valid URL (e.g., http://example.com/proxy.pac)');
        return;
      }
      
      // Check if URL uses http/https protocol
      if (!pacUrl.startsWith('http://') && !pacUrl.startsWith('https://')) {
        alert('PAC URL must start with http:// or https://');
        return;
      }
      
      const pacConfig = {
        name: name,
        configType: 'pac',
        pacSource: 'url',
        pacUrl: pacUrl
      };
      
      // Test URL accessibility before saving
      fetch(pacUrl, { method: 'HEAD' })
        .then(response => {
          if (!response.ok) {
            alert(`Cannot access PAC URL: ${response.status} ${response.statusText}`);
            return;
          }
          savePacConfig(pacConfig);
        })
        .catch(error => {
          alert(`Cannot access PAC URL: ${error.message}`);
        });
    } else {
      const fileInput = document.getElementById('pacFileUpload');
      if (fileInput.files.length === 0) {
        alert('Please select a PAC file.');
        return;
      }
      
      const file = fileInput.files[0];
      
      // Check file extension
      const fileExtension = file.name.split('.').pop().toLowerCase();
      if (fileExtension !== 'pac' && fileExtension !== 'js') {
        alert('Please select a .pac or .js file.');
        return;
      }
      
      const reader = new FileReader();
      
      reader.onload = function(e) {
        try {
          const pacContent = e.target.result;
          
          // Basic validation: check if the file contains the FindProxyForURL function
          if (!pacContent.includes('FindProxyForURL')) {
            alert('Invalid PAC file: The file must contain a FindProxyForURL function.');
            return;
          }
          
          // Check for non-ASCII characters and warn the user
          if (/[^\x00-\x7F]/.test(pacContent)) {
            console.warn('PAC file contains non-ASCII characters which will be converted to Unicode escapes');
          }
          
          // Test the PAC script with our safer method
          chrome.runtime.sendMessage({
            action: 'testPacScript',
            pacScript: pacContent
          }, function(response) {
            if (!response.success) {
              alert(`Invalid PAC file: ${response.error}`);
              return;
            }
            
            const pacConfig = {
              name: name,
              configType: 'pac',
              pacSource: 'content',
              pacContent: pacContent,
              fileName: file.name
            };
            
            savePacConfig(pacConfig);
            
            if (response.warnings) {
              // Show warnings but still save the PAC file
              alert(`PAC file added with warnings: ${response.warnings}`);
            }
          });
        } catch (error) {
          alert(`Error processing PAC file: ${error.message}`);
        }
      };
      
      reader.onerror = function() {
        alert('Error reading the PAC file. Please try again.');
      };
      
      reader.readAsText(file);
    }
  });
  
  // Use direct connection (no proxy)
  document.getElementById('directConnection').addEventListener('click', function() {
    chrome.runtime.sendMessage({action: 'setDirectConnection'}, function(response) {
      // Uncheck all radio buttons when using direct connection
      const radioButtons = document.querySelectorAll('input[name="proxy-selection"]');
      radioButtons.forEach(radio => {
        radio.checked = false;
      });
      
      getCurrentProxyStatus();
    });
  });
  
  // Test proxy connection
  document.getElementById('testProxyConnection').addEventListener('click', function() {
    const button = this;
    const originalContent = button.innerHTML;
    
    // Show loading state
    button.disabled = true;
    button.innerHTML = `
      <div class="spinner"></div>
      Testing Connection...
    `;
    
    chrome.runtime.sendMessage({action: 'testProxyConnection'}, function(response) {
      // Reset button state
      button.disabled = false;
      button.innerHTML = originalContent;
      
      // Update status display
      const statusDiv = document.getElementById('currentStatus');
      if (response && response.success) {
        statusDiv.className = 'status active';
        statusDiv.innerHTML = `
          <i class="material-icons">check_circle</i>
          ${response.proxyInfo}
        `;
      } else {
        statusDiv.className = 'status error';
        statusDiv.innerHTML = `
          <i class="material-icons">error</i>
          ${response ? response.error : 'Connection test failed'}
        `;
      }
    });
  });
  
  // Add error message listener
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'proxyError' || request.action === 'pacError') {
      const statusDiv = document.getElementById('currentStatus');
      statusDiv.className = 'status error';
      statusDiv.innerHTML = `
        <i class="material-icons">error</i>
        ${request.error}
      `;
      
      // If using a direct connection due to error, update the UI
      if (request.action === 'pacError') {
        const radioButtons = document.querySelectorAll('input[name="proxy-selection"]');
        radioButtons.forEach(radio => {
          radio.checked = false;
        });
      }
    } else if (request.action === 'pacAsciiError') {
      // Handle the ASCII error specifically
      const statusDiv = document.getElementById('currentStatus');
      statusDiv.className = 'status error';
      statusDiv.innerHTML = `
        <i class="material-icons">error</i>
        PAC script contains non-ASCII characters that Chrome cannot process.
        <button id="useSimplePac" class="btn btn-secondary btn-sm">Use Simplified PAC</button>
      `;
      
      // Store the original proxy config for the simplified PAC generation
      document.getElementById('useSimplePac').addEventListener('click', function() {
        const proxyConfig = request.proxyConfig;
        
        // Show a prompt to get the proxy string
        const proxyType = prompt('Enter proxy type (PROXY, SOCKS, SOCKS5):', 'PROXY');
        const proxyHost = prompt('Enter proxy host:', '');
        const proxyPort = prompt('Enter proxy port:', '8080');
        
        if (!proxyType || !proxyHost || !proxyPort) {
          alert('Please provide all proxy details');
          return;
        }
        
        const proxyString = `${proxyType} ${proxyHost}:${proxyPort}`;
        
        chrome.runtime.sendMessage({
          action: 'createSimplePac',
          proxyString: proxyString
        }, function(response) {
          if (response && response.success) {
            // Create a new PAC config with the simplified script
            const simplePacConfig = {
              name: proxyConfig.name + ' (Simplified)',
              configType: 'pac',
              pacSource: 'content',
              pacContent: response.pacScript,
              fileName: 'simplified-pac.js'
            };
            
            // Save and apply the new PAC
            chrome.storage.sync.get(['proxies'], function(result) {
              const proxies = result.proxies || [];
              proxies.push(simplePacConfig);
              chrome.storage.sync.set({proxies: proxies}, function() {
                chrome.runtime.sendMessage({
                  action: 'setProxy',
                  proxy: simplePacConfig
                }, function() {
                  loadSavedProxies();
                  getCurrentProxyStatus();
                });
              });
            });
          } else {
            alert('Failed to create simplified PAC script');
          }
        });
      });
      
      // If using a direct connection due to error, update the UI
      const radioButtons = document.querySelectorAll('input[name="proxy-selection"]');
      radioButtons.forEach(radio => {
        radio.checked = false;
      });
    }
  });
});

// Load saved proxies from storage
function loadSavedProxies() {
  const savedProxiesDiv = document.getElementById('savedProxies');
  savedProxiesDiv.innerHTML = '';
  
  chrome.storage.sync.get(['proxies', 'currentProxy'], function(result) {
    const proxies = result.proxies || [];
    const currentProxy = result.currentProxy || null;
    
    if (proxies.length === 0) {
      savedProxiesDiv.innerHTML = '<div class="no-proxies">No saved proxies yet</div>';
      return;
    }
    
    proxies.forEach(function(proxy, index) {
      const proxyItem = document.createElement('li');
      proxyItem.className = 'proxy-item';
      
      // Radio button
      const radioDiv = document.createElement('div');
      radioDiv.className = 'proxy-radio';
      
      const radioBtn = document.createElement('input');
      radioBtn.type = 'radio';
      radioBtn.name = 'proxy-selection';
      
      // Check if this proxy is the current one
      if (currentProxy && sameProxy(proxy, currentProxy)) {
        radioBtn.checked = true;
      }
      
      radioBtn.addEventListener('change', function() {
        if (this.checked) {
          chrome.runtime.sendMessage({
            action: 'setProxy',
            proxy: proxy
          }, function(response) {
            getCurrentProxyStatus();
          });
        }
      });
      
      radioDiv.appendChild(radioBtn);
      proxyItem.appendChild(radioDiv);
      
      // Proxy info
      const infoDiv = document.createElement('div');
      infoDiv.className = 'proxy-info';
      
      // Proxy name
      const nameDiv = document.createElement('div');
      nameDiv.className = 'proxy-name';
      nameDiv.textContent = proxy.name;
      infoDiv.appendChild(nameDiv);
      
      // Proxy URL/details
      const urlDiv = document.createElement('div');
      urlDiv.className = 'proxy-url';
      
      if (proxy.configType === 'pac') {
        if (proxy.pacSource === 'url') {
          urlDiv.textContent = `PAC URL: ${proxy.pacUrl}`;
        } else {
          urlDiv.textContent = `PAC File: ${proxy.fileName}`;
        }
      } else {
        urlDiv.textContent = `${proxy.type.toUpperCase()}://${proxy.host}:${proxy.port}`;
      }
      
      infoDiv.appendChild(urlDiv);
      proxyItem.appendChild(infoDiv);
      
      // Delete button
      const deleteButton = document.createElement('button');
      deleteButton.className = 'action-icon';
      deleteButton.innerHTML = '<i class="material-icons">delete_outline</i>';
      deleteButton.title = 'Delete';
      deleteButton.addEventListener('click', function(event) {
        // Prevent the click from triggering the radio button
        event.stopPropagation();
        
        if (confirm(`Delete proxy "${proxy.name}"?`)) {
          chrome.storage.sync.get(['proxies', 'currentProxy'], function(result) {
            const updatedProxies = result.proxies.filter((_, i) => i !== index);
            
            // If deleting the current proxy, clear proxy settings
            if (result.currentProxy && sameProxy(proxy, result.currentProxy)) {
              chrome.runtime.sendMessage({action: 'setDirectConnection'});
              chrome.storage.sync.remove(['currentProxy']);
            }
            
            chrome.storage.sync.set({proxies: updatedProxies}, function() {
              loadSavedProxies();
              getCurrentProxyStatus();
            });
          });
        }
      });
      
      proxyItem.appendChild(deleteButton);
      savedProxiesDiv.appendChild(proxyItem);
    });
    
    // After loading all proxies, check if we need to clear all radio buttons
    // (when using direct connection)
    chrome.proxy.settings.get({}, function(config) {
      if (config.value.mode === "direct") {
        const radioButtons = document.querySelectorAll('input[name="proxy-selection"]');
        radioButtons.forEach(radio => {
          radio.checked = false;
        });
      }
    });
  });
}

// Helper function to check if two proxies are the same
function sameProxy(proxy1, proxy2) {
  if (proxy1.configType !== proxy2.configType) return false;
  
  if (proxy1.configType === 'pac') {
    if (proxy1.pacSource !== proxy2.pacSource) return false;
    if (proxy1.pacSource === 'url') {
      return proxy1.pacUrl === proxy2.pacUrl;
    } else {
      return proxy1.fileName === proxy2.fileName;
    }
  } else {
    return proxy1.type === proxy2.type && 
           proxy1.host === proxy2.host && 
           proxy1.port === proxy2.port;
  }
}

// Get current proxy status
function getCurrentProxyStatus() {
  chrome.runtime.sendMessage({action: 'getProxyStatus'}, function(response) {
    const statusDiv = document.getElementById('currentStatus');
    statusDiv.className = 'status active';
    
    if (response.proxyInUse) {
      statusDiv.innerHTML = `
        <i class="material-icons">check_circle</i>
        ${response.proxyInfo}
      `;
    } else {
      statusDiv.innerHTML = `
        <i class="material-icons">public</i>
        Using Direct Connection
      `;
    }
  });
}

// Clear input fields after adding a proxy
function clearInputFields(type) {
  if (type === 'manual' || type === undefined) {
    document.getElementById('proxyName').value = '';
    document.getElementById('proxyHost').value = '';
    document.getElementById('proxyPort').value = '';
  } else if (type === 'pac') {
    document.getElementById('pacName').value = '';
    document.getElementById('pacUrl').value = '';
    document.getElementById('pacFileUpload').value = '';
    document.getElementById('selectedFileName').textContent = 'No file selected';
  }
}