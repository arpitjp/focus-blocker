// Get the blocked site from the query parameter
const params = new URLSearchParams(window.location.search);
const site = params.get('site');
const url = params.get('url');

// Display blocked site
if (site) {
  document.getElementById('blockedSite').textContent = site;
} else if (url) {
  try {
    const parsedUrl = new URL(url);
    document.getElementById('blockedSite').textContent = parsedUrl.hostname;
  } catch {
    document.getElementById('blockedSite').textContent = url;
  }
} else {
  document.getElementById('blockedSite').textContent = 'Website blocked';
}

// Timer elements
const timerEl = document.getElementById('timer');
const timerValueEl = document.getElementById('timerValue');

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

// Single tick function - reads from storage every time
async function tick() {
  const result = await chrome.storage.sync.get(['blockingEnabled', 'blockingEndTime']);
  
  // If blocking disabled, go back
  if (!result.blockingEnabled) {
    window.history.back();
    return;
  }
  
  timerEl.style.display = 'block';
  
  const endTime = result.blockingEndTime;
  if (!endTime) {
    timerValueEl.innerHTML = '<span class="timer-infinite">∞ Until you turn it off</span>';
    return;
  }
  
  const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
  if (remaining > 0) {
    timerValueEl.textContent = formatTime(remaining);
  } else {
    timerValueEl.innerHTML = '<span class="timer-infinite">Session ended!</span>';
  }
}

// Run immediately and every second
tick();
setInterval(tick, 1000);

// Open extension settings when clicking branding
document.getElementById('openSettings').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
});
