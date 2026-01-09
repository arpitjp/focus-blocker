// Get the blocked site from the query parameter
const params = new URLSearchParams(window.location.search);
const site = params.get('site');
const url = params.get('url');

// Display blocked site
const blockedSiteEl = document.getElementById('blockedSite');
if (site) {
  blockedSiteEl.textContent = site;
} else if (url) {
  try {
    const parsedUrl = new URL(url);
    blockedSiteEl.textContent = parsedUrl.hostname;
  } catch {
    blockedSiteEl.textContent = url;
  }
} else {
  blockedSiteEl.textContent = 'Website blocked';
}

// Timer elements
const timerEl = document.getElementById('timer');
const timerValueEl = document.getElementById('timerValue');

// State
let timerInterval = null;
let storageListener = null;
let currentEndTime = null;

function formatTime(seconds) {
  if (seconds <= 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

function updateTimerDisplay() {
  if (!currentEndTime) {
    timerValueEl.innerHTML = '<span class="timer-infinite">∞ Until you turn it off</span>';
    return;
  }
  
  const remaining = Math.max(0, Math.floor((currentEndTime - Date.now()) / 1000));
  if (remaining > 0) {
    timerValueEl.textContent = formatTime(remaining);
  } else {
    timerValueEl.innerHTML = '<span class="timer-infinite">Session ended!</span>';
  }
}

// Storage change listener - more efficient than polling
storageListener = (changes, areaName) => {
  if (areaName !== 'sync' && areaName !== 'local') return;
  
  // If blocking disabled, go back
  if (changes.blockingEnabled?.newValue === false) {
    cleanup();
    window.history.back();
    return;
  }
  
  // Update timer if end time changed
  if (changes.blockingEndTime !== undefined) {
    currentEndTime = changes.blockingEndTime.newValue;
    updateTimerDisplay();
  }
};

// Initial load from storage
async function initialize() {
  try {
    const result = await chrome.storage.sync.get(['blockingEnabled', 'blockingEndTime']);
    
    if (!result.blockingEnabled) {
      window.history.back();
      return;
    }
    
    timerEl.style.display = 'block';
    currentEndTime = result.blockingEndTime || null;
    updateTimerDisplay();
    
    // Start interval for countdown (only updates display, doesn't poll storage)
    timerInterval = setInterval(updateTimerDisplay, 1000);
    
    // Listen for storage changes
    chrome.storage.onChanged.addListener(storageListener);
  } catch (e) {
    // Storage read failed - show infinite timer
    timerEl.style.display = 'block';
    timerValueEl.innerHTML = '<span class="timer-infinite">∞ Until you turn it off</span>';
  }
}

// Cleanup function
function cleanup() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (storageListener) {
    chrome.storage.onChanged.removeListener(storageListener);
    storageListener = null;
  }
}

// Clean up on page unload
window.addEventListener('beforeunload', cleanup);

// Open extension settings when clicking branding
document.getElementById('openSettings')?.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') }).catch(() => {});
});

// Initialize
initialize();
