// Get the blocked site from the query parameter
const params = new URLSearchParams(window.location.search);
const site = params.get('site');
const url = params.get('url');
const endTime = params.get('endTime');

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

// Timer functionality
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

function updateTimer() {
  if (!endTime) return;
  
  const now = Date.now();
  const remaining = Math.max(0, Math.floor((parseInt(endTime) - now) / 1000));
  
  if (remaining > 0) {
    timerValueEl.textContent = formatTime(remaining);
  } else {
    timerValueEl.innerHTML = '<span class="timer-infinite">Blocking ended!</span>';
    // Try to go to the original URL
    if (url) {
      setTimeout(() => {
        window.location.href = url;
      }, 1500);
    }
  }
}

// Show timer if endTime is provided
if (endTime) {
  timerEl.style.display = 'block';
  updateTimer();
  setInterval(updateTimer, 1000);
} else {
  // Show infinite message
  timerEl.style.display = 'block';
  timerValueEl.innerHTML = '<span class="timer-infinite">∞ Until you turn it off</span>';
}

// Open extension settings when clicking branding
document.getElementById('openSettings').addEventListener('click', (e) => {
  e.preventDefault();
  // Open the extension's options/popup page in a new tab
  const extensionId = chrome.runtime.id;
  chrome.tabs.create({ url: `chrome-extension://${extensionId}/popup.html` });
});
