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

// Save to both sync (Google account) and local storage for persistence
async function saveToBothStorages(data) {
  try {
    // Save to sync storage (Google account - syncs across devices)
    await chrome.storage.sync.set(data);
    // Also save to local storage (persists across uninstall/reinstall)
    await chrome.storage.local.set(data);
  } catch (error) {
    console.error('Error saving to sync storage:', error);
    // If sync fails (quota exceeded), at least save locally
    await chrome.storage.local.set(data);
  }
}

// Load saved state from both sync and local storage
async function loadState() {
  // Check both sync (Google account) and local storage
  const syncResult = await chrome.storage.sync.get(['blockingEnabled', 'blockedSites', 'blockingEndTime', 'blockingDuration', 'lastDurationOption', 'lastCustomMinutes']);
  const localResult = await chrome.storage.local.get(['blockingEnabled', 'blockedSites', 'blockingEndTime', 'blockingDuration', 'lastDurationOption', 'lastCustomMinutes']);
  
  // Prefer sync storage, fallback to local
  const blockingEnabled = syncResult.blockingEnabled ?? localResult.blockingEnabled ?? false;
  const blockedSites = syncResult.blockedSites ?? localResult.blockedSites ?? [];
  const blockingEndTime = syncResult.blockingEndTime ?? localResult.blockingEndTime ?? null;
  const blockingDuration = syncResult.blockingDuration ?? localResult.blockingDuration ?? null;
  const lastDurationOption = syncResult.lastDurationOption ?? localResult.lastDurationOption ?? 'infinite';
  const lastCustomMinutes = syncResult.lastCustomMinutes ?? localResult.lastCustomMinutes ?? null;
  
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
  
  // Ensure both storages are in sync
  await saveToBothStorages({ blockingEnabled, blockedSites, blockingEndTime, blockingDuration });
}


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
      timerText.style.display = 'none';
      stopCountdown();
      // Auto-disable blocking
      blockingToggle.checked = false;
      handleToggleChange();
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
  return parseInt(selectedValue, 10);
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
  await saveToBothStorages({ 
    lastDurationOption: selectedDuration,
    lastCustomMinutes: selectedDuration === 'custom' ? customMinutes.value : null
  });
  
  if (enabled) {
    // Show duration dropdown
    durationContainer.style.display = 'block';
    
    // Always enable blocking first
    await saveToBothStorages({ blockingEnabled: enabled });
    chrome.runtime.sendMessage({ action: 'updateBlocking', enabled });
    
    // Get duration and set timer if valid (null for infinite)
    const durationMinutes = getDurationMinutes();
    if (durationMinutes) {
      // Timed blocking
      const endTime = Date.now() + (durationMinutes * 60 * 1000);
      await saveToBothStorages({ 
        blockingEndTime: endTime,
        blockingDuration: selectedDuration,
        customMinutes: selectedDuration === 'custom' ? durationMinutes : null
      });
      startCountdown(endTime);
      
      // Notify background script with timer info
      chrome.runtime.sendMessage({ 
        action: 'updateBlocking', 
        enabled,
        endTime,
        duration: selectedDuration
      });
    } else {
      // Infinite or no valid duration - enable without timer
      await saveToBothStorages({ 
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
    await saveToBothStorages({ 
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
  await saveToBothStorages({ 
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
  await saveToBothStorages({ lastCustomMinutes: customMinutes.value });
  
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
  await saveToBothStorages({ blockedSites });
  
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
  await saveToBothStorages({ blockedSites });
  displayBlockedSites(blockedSites);
  
  // Notify background script to update blocking rules
  // Add a small delay to ensure storage is updated
  setTimeout(() => {
    chrome.runtime.sendMessage({ action: 'updateRules' });
  }, 100);
}

// Normalize site URL
// If no protocol, prefix with * to indicate wildcard (blocks all subdomains)
// If protocol exists, keep as-is (blocks only that specific URL)
function normalizeSite(site) {
  const trimmed = site.trim().toLowerCase();
  
  // Check if it has a protocol
  const hasProtocol = /^https?:\/\//.test(trimmed);
  
  // Check if already has * prefix
  const hasWildcard = trimmed.startsWith('*');
  
  if (hasProtocol || hasWildcard) {
    // Keep as-is, just clean up trailing slash and www
    return trimmed
      .replace(/^(https?:\/\/)www\./, '$1')
      .replace(/\/$/, '');
  } else {
    // No protocol and no wildcard - add * prefix to indicate it blocks all subdomains
    const cleaned = trimmed
      .replace(/^www\./, '')
      .replace(/\/$/, '');
    
    return '*' + cleaned;
  }
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

// Initialize
loadState();

// Uncomment the line below to test background script communication
// testBackgroundScript();

