// DOM elements
const blockingToggle = document.getElementById('blockingToggle');
const siteInput = document.getElementById('siteInput');
const addSiteBtn = document.getElementById('addSiteBtn');
const blockedSitesList = document.getElementById('blockedSitesList');
const durationContainer = document.getElementById('durationContainer');
const durationSelect = document.getElementById('durationSelect');
const customDuration = document.getElementById('customDuration');
const customMinutes = document.getElementById('customMinutes');
const timerText = document.getElementById('timerText');

let countdownInterval = null;

// Listen for storage changes (when background disables blocking)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.blockingEnabled && changes.blockingEnabled.newValue === false) {
    blockingToggle.checked = false;
    durationContainer.style.display = 'none';
    stopCountdown();
  }
});

// Save to sync storage (persists across uninstall/reinstall with Chrome sync enabled)
async function saveToStorage(data) {
  try {
    // Save to sync storage - this persists across devices and reinstalls
    await chrome.storage.sync.set(data);
    console.log('Saved to sync storage:', Object.keys(data));
  } catch (error) {
    console.error('Error saving to sync storage:', error);
    // If sync fails (quota exceeded, not signed in), data won't persist across reinstall
    // But will work within the current install
  }
}

// Load saved state from sync storage (persists across uninstall/reinstall with Chrome sync)
async function loadState(retryCount = 0) {
  // Get from sync storage - this persists across uninstall/reinstall if Chrome sync is enabled
  const syncResult = await chrome.storage.sync.get(['blockingEnabled', 'blockedSites', 'blockingEndTime', 'blockingDuration', 'lastDurationOption', 'lastCustomMinutes']);
  
  // Check if sync has data
  const hasSyncData = syncResult.blockedSites && syncResult.blockedSites.length > 0;
  
  // If no sync data and this is first load, retry after a delay (sync might not be ready yet)
  if (!hasSyncData && retryCount < 3) {
    console.log(`No sync data found, retrying... (attempt ${retryCount + 1})`);
    setTimeout(() => loadState(retryCount + 1), 500);
    if (retryCount === 0) {
      // Show empty state immediately, will update when data arrives
      displayBlockedSites([]);
    }
    return;
  }
  
  const blockingEnabled = syncResult.blockingEnabled ?? false;
  const blockedSites = syncResult.blockedSites ?? [];
  const blockingEndTime = syncResult.blockingEndTime ?? null;
  const blockingDuration = syncResult.blockingDuration ?? null;
  const lastDurationOption = syncResult.lastDurationOption ?? 'infinite';
  const lastCustomMinutes = syncResult.lastCustomMinutes ?? null;
  
  console.log('Loaded state from sync:', { blockingEnabled, blockedSites: blockedSites.length });
  
  blockingToggle.checked = blockingEnabled;
  displayBlockedSites(blockedSites);
  
  // Always set the last selected duration option
  durationSelect.value = lastDurationOption;
  if (lastDurationOption === 'custom' && lastCustomMinutes) {
    customMinutes.value = lastCustomMinutes;
    customDuration.style.display = 'flex';
  } else {
    customDuration.style.display = 'none';
  }
  
  // Show duration dropdown if enabled
  if (blockingEnabled) {
    durationContainer.style.display = 'block';
    // Start countdown if there's an end time (not infinite)
    if (blockingEndTime && blockingDuration !== 'infinite') {
      startCountdown(blockingEndTime);
    }
  } else {
    durationContainer.style.display = 'none';
    stopCountdown();
  }
}

// Listen for storage changes (in case sync data arrives after initial load)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.blockedSites) {
    console.log('Sync storage updated, reloading state...');
    loadState();
  }
});


// Format time remaining
function formatTimeRemaining(seconds) {
  if (seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

// Start countdown timer
function startCountdown(endTime) {
  stopCountdown();
  
  const updateTimer = () => {
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
    
    if (remaining > 0) {
      timerText.textContent = `Auto-off in ${formatTimeRemaining(remaining)}`;
      timerText.style.display = 'block';
    } else {
      timerText.textContent = 'Ending...';
      timerText.style.display = 'block';
      // Don't auto-disable here - let background handle it
      // This prevents race conditions with the background timer
    }
  };
  
  updateTimer();
  countdownInterval = setInterval(updateTimer, 1000);
}

// Stop countdown timer
function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  timerText.style.display = 'none';
}

// Get duration in minutes (returns null for infinite)
function getDurationMinutes() {
  const selectedValue = durationSelect.value;
  if (selectedValue === 'infinite') {
    return null; // No timer for infinite
  }
  if (selectedValue === 'custom') {
    const customMins = parseInt(customMinutes.value, 10);
    return customMins && customMins > 0 ? customMins : null;
  }
  return parseFloat(selectedValue);
}

// Display blocked sites list
function displayBlockedSites(sites) {
  blockedSitesList.innerHTML = '';
  
  if (sites.length === 0) {
    const emptyState = document.createElement('li');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No blocked sites. Add one above.';
    blockedSitesList.appendChild(emptyState);
    return;
  }

  sites.forEach((site, index) => {
    const li = document.createElement('li');
    const siteName = document.createElement('span');
    siteName.className = 'site-name';
    siteName.textContent = site;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => removeSite(index));
    
    li.appendChild(siteName);
    li.appendChild(deleteBtn);
    blockedSitesList.appendChild(li);
  });
}

// Handle toggle change
async function handleToggleChange() {
  const enabled = blockingToggle.checked;
  const selectedDuration = durationSelect.value;
  
  // Always save the last selected duration option
  await saveToStorage({ 
    lastDurationOption: selectedDuration,
    lastCustomMinutes: selectedDuration === 'custom' ? customMinutes.value : null
  });
  
  if (enabled) {
    // Show duration dropdown
    durationContainer.style.display = 'block';
    
    // Always enable blocking first
    await saveToStorage({ blockingEnabled: enabled });
    chrome.runtime.sendMessage({ action: 'updateBlocking', enabled });
    
    // Get duration and set timer if valid (null for infinite)
    const durationMinutes = getDurationMinutes();
    if (durationMinutes) {
      // Timed blocking
      const endTime = Date.now() + (durationMinutes * 60 * 1000);
      await saveToStorage({ 
        blockingEndTime: endTime,
        blockingDuration: selectedDuration,
        customMinutes: selectedDuration === 'custom' ? durationMinutes : null
      });
      startCountdown(endTime);
      
      // Notify background script with timer info - this will re-sync all tabs
      chrome.runtime.sendMessage({ 
        action: 'updateBlocking', 
        enabled,
        endTime,
        duration: selectedDuration
      });
    } else {
      // Infinite or no valid duration - enable without timer
      await saveToStorage({ 
        blockingEndTime: null,
        blockingDuration: selectedDuration
      });
      stopCountdown();
    }
  } else {
    // Hide duration dropdown and stop timer
    durationContainer.style.display = 'none';
    customDuration.style.display = 'none';
    stopCountdown();
    await saveToStorage({ 
      blockingEnabled: enabled,
      blockingEndTime: null,
      blockingDuration: null
    });
    chrome.runtime.sendMessage({ action: 'updateBlocking', enabled });
  }
}

// Toggle blocking on/off
blockingToggle.addEventListener('change', handleToggleChange);

// Handle duration selection change
durationSelect.addEventListener('change', async () => {
  const selectedValue = durationSelect.value;
  
  // Save the last selected option
  await saveToStorage({ 
    lastDurationOption: selectedValue,
    lastCustomMinutes: selectedValue === 'custom' ? customMinutes.value : null
  });
  
  if (selectedValue === 'custom') {
    customDuration.style.display = 'flex';
    customMinutes.focus();
  } else {
    customDuration.style.display = 'none';
    // If blocking is already enabled, update the timer
    if (blockingToggle.checked) {
      handleToggleChange();
    }
  }
});

// Handle custom minutes input
customMinutes.addEventListener('input', async () => {
  // Save the custom minutes value
  await saveToStorage({ lastCustomMinutes: customMinutes.value });
  
  if (blockingToggle.checked && durationSelect.value === 'custom') {
    const minutes = getDurationMinutes();
    if (minutes && minutes > 0) {
      handleToggleChange();
    }
  }
});

// Handle custom minutes enter key
customMinutes.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const minutes = getDurationMinutes();
    if (minutes && minutes > 0) {
      blockingToggle.checked = true;
      handleToggleChange();
    }
  }
});

// Add a site to blocked list
addSiteBtn.addEventListener('click', async () => {
  const site = siteInput.value.trim();
  if (!site) {
    alert('Please enter a website');
    return;
  }

  // Normalize the site (remove protocol, www, trailing slash)
  const normalizedSite = normalizeSite(site);
  
  // Check both storages
  const syncResult = await chrome.storage.sync.get(['blockedSites']);
  const localResult = await chrome.storage.local.get(['blockedSites']);
  const blockedSites = syncResult.blockedSites ?? localResult.blockedSites ?? [];
  
  if (blockedSites.includes(normalizedSite)) {
    alert('This site is already blocked');
    return;
  }

  blockedSites.push(normalizedSite);
  await saveToStorage({ blockedSites });
  
  siteInput.value = '';
  displayBlockedSites(blockedSites);
  
  // Notify background script to update blocking rules
  // Add a small delay to ensure storage is updated
  setTimeout(() => {
    chrome.runtime.sendMessage({ action: 'updateRules' });
  }, 100);
});

// Remove a site from blocked list
async function removeSite(index) {
  // Check both storages
  const syncResult = await chrome.storage.sync.get(['blockedSites']);
  const localResult = await chrome.storage.local.get(['blockedSites']);
  const blockedSites = syncResult.blockedSites ?? localResult.blockedSites ?? [];
  blockedSites.splice(index, 1);
  await saveToStorage({ blockedSites });
  displayBlockedSites(blockedSites);
  
  // Notify background script to update blocking rules
  // Add a small delay to ensure storage is updated
  setTimeout(() => {
    chrome.runtime.sendMessage({ action: 'updateRules' });
  }, 100);
}

// Normalize site URL
// Always converts to *domain format for consistent blocking
function normalizeSite(site) {
  const trimmed = site.trim().toLowerCase();
  
  // Check if already has * prefix
  if (trimmed.startsWith('*')) {
    // Already wildcard format, just clean up
    return trimmed.replace(/\/$/, '');
  }
  
  // Check if it has a protocol - extract domain
  if (/^https?:\/\//.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const domain = url.hostname.replace(/^www\./, '');
      return '*' + domain;
    } catch {
      // If URL parsing fails, fall through to simple cleaning
    }
  }
  
  // No protocol - clean up and add * prefix
  const cleaned = trimmed
    .replace(/^www\./, '')
    .replace(/\/$/, '');
  
  return '*' + cleaned;
}

// Allow Enter key to add site
siteInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addSiteBtn.click();
  }
});

// Test function to verify background script is running
async function testBackgroundScript() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'test' });
    console.log('Background script response:', response);
    alert('Background script is running! Check console for details.');
  } catch (error) {
    console.error('Error communicating with background script:', error);
    alert('Error: ' + error.message);
  }
}

// Export blocked sites to JSON file
document.getElementById('exportBtn').addEventListener('click', async () => {
  const result = await chrome.storage.sync.get(['blockedSites']);
  const blockedSites = result.blockedSites || [];
  
  if (blockedSites.length === 0) {
    alert('No sites to export');
    return;
  }
  
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    blockedSites: blockedSites
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `focus-mode-sites-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
});

// Import blocked sites from JSON file
const importFile = document.getElementById('importFile');

document.getElementById('importBtn').addEventListener('click', () => {
  importFile.click();
});

importFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Validate the data
    if (!data.blockedSites || !Array.isArray(data.blockedSites)) {
      alert('Invalid file format');
      return;
    }
    
    // Get existing sites
    const result = await chrome.storage.sync.get(['blockedSites']);
    const existingSites = result.blockedSites || [];
    
    // Merge and dedupe
    const allSites = [...new Set([...existingSites, ...data.blockedSites])];
    
    // Save
    await saveToStorage({ blockedSites: allSites });
    displayBlockedSites(allSites);
    
    // Notify background
    chrome.runtime.sendMessage({ action: 'updateRules' });
    
    alert(`Imported ${data.blockedSites.length} sites (${allSites.length} total after merge)`);
  } catch (error) {
    alert('Error importing file: ' + error.message);
  }
  
  // Reset file input
  importFile.value = '';
});

// Initialize
loadState();

// Uncomment the line below to test background script communication
// testBackgroundScript();

