// Content script that overlays a "blocked" message on blocked sites

(async function() {
  // Check if already initialized
  if (window.__focusBlockerInitialized) return;
  window.__focusBlockerInitialized = true;

  // Load shared UI
  let BlockedUI;
  try {
    const response = await fetch(chrome.runtime.getURL('blocked-ui.js'));
    const code = await response.text();
    eval(code);
    BlockedUI = window.BlockedUI;
  } catch (e) {
    console.error('Failed to load BlockedUI');
    return;
  }

  // Store references for cleanup
  let timerInterval = null;
  let storageListener = null;
  let messageListener = null;
  let mediaObserver = null;
  let mediaKillerInterval = null;
  let currentEndTime = null;

  // Stop all media on the page
  function killAllMedia() {
    const videos = document.getElementsByTagName('video');
    for (let i = 0; i < videos.length; i++) {
      videos[i].pause();
      videos[i].muted = true;
      videos[i].src = '';
    }
    
    const audios = document.getElementsByTagName('audio');
    for (let i = 0; i < audios.length; i++) {
      audios[i].pause();
      audios[i].muted = true;
      audios[i].src = '';
    }
    
    const iframes = document.getElementsByTagName('iframe');
    for (let i = 0; i < iframes.length; i++) {
      iframes[i].src = 'about:blank';
    }
  }

  function cleanup() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (mediaKillerInterval) { clearInterval(mediaKillerInterval); mediaKillerInterval = null; }
    if (mediaObserver) { mediaObserver.disconnect(); mediaObserver = null; }
    if (storageListener) { chrome.storage.onChanged.removeListener(storageListener); storageListener = null; }
    if (messageListener) { chrome.runtime.onMessage.removeListener(messageListener); messageListener = null; }
    window.__focusBlockerInitialized = false;
  }

  function removeOverlay() {
    const overlay = document.getElementById('focus-blocked-overlay');
    if (overlay) {
      cleanup();
      overlay.remove();
      document.body.style.overflow = '';
    }
  }

  function updateTimerDisplay(endTime) {
    currentEndTime = endTime;
    const timerValue = document.getElementById('focus-blocked-timer-value');
    if (!timerValue) return;
    
    if (!endTime) {
      timerValue.textContent = '∞';
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      return;
    }
    
    const update = () => {
      const remaining = Math.max(0, Math.floor((currentEndTime - Date.now()) / 1000));
      if (remaining > 0) {
        timerValue.textContent = BlockedUI.formatTime(remaining);
      } else {
        removeOverlay();
      }
    };
    
    update();
    if (!timerInterval) {
      timerInterval = setInterval(update, 1000);
    }
  }

  // Storage change listener
  storageListener = (changes, areaName) => {
    if (areaName !== 'sync' && areaName !== 'local') return;
    if (changes.blockingEnabled?.newValue === false) {
      removeOverlay();
      return;
    }
    if (changes.blockingEndTime !== undefined) {
      updateTimerDisplay(changes.blockingEndTime.newValue);
    }
  };
  chrome.storage.onChanged.addListener(storageListener);
  
  // Message listener
  messageListener = (message) => {
    if (message.action === 'timerUpdated') {
      if (message.enabled === false) {
        removeOverlay();
      } else {
        updateTimerDisplay(message.endTime);
      }
    }
  };
  chrome.runtime.onMessage.addListener(messageListener);

  // Get blocking info from storage
  chrome.storage.sync.get(['blockingEnabled', 'blockedSites', 'blockingEndTime'], (syncResult) => {
    chrome.storage.local.get(['blockingEnabled', 'blockedSites', 'blockingEndTime'], (localResult) => {
      const enabled = syncResult.blockingEnabled ?? localResult.blockingEnabled ?? false;
      const blockedSites = syncResult.blockedSites ?? localResult.blockedSites ?? [];
      const endTime = syncResult.blockingEndTime ?? localResult.blockingEndTime ?? null;

      if (!enabled || blockedSites.length === 0) {
        cleanup();
        return;
      }

      const currentUrl = window.location.href.toLowerCase();
      
      const matchedSite = blockedSites.find(site => {
        if (site.startsWith('*')) {
          return currentUrl.includes(site.substring(1).toLowerCase());
        } else if (site.startsWith('http://') || site.startsWith('https://')) {
          return currentUrl.startsWith(site.toLowerCase());
        } else {
          return currentUrl.includes(site.toLowerCase());
        }
      });

      if (matchedSite) {
        const displaySite = matchedSite.startsWith('*') ? matchedSite.substring(1) : matchedSite;
        showBlockedOverlay(displaySite, endTime);
      } else {
        cleanup();
      }
    });
  });

  function showBlockedOverlay(site, endTime) {
    if (document.getElementById('focus-blocked-overlay')) return;

    killAllMedia();
    mediaKillerInterval = setInterval(killAllMedia, 2000);
    
    mediaObserver = new MutationObserver(() => killAllMedia());
    if (document.body) {
      mediaObserver.observe(document.body, { childList: true, subtree: true });
    }

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = BlockedUI.css;
    document.head.appendChild(style);

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'focus-blocked-overlay';
    overlay.className = 'focus-blocked-overlay';
    overlay.innerHTML = BlockedUI.html(
      BlockedUI.escapeHtml(site), 
      chrome.runtime.getURL('icon128.png')
    );

    document.documentElement.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    if (endTime) {
      updateTimerDisplay(endTime);
    }

    // Handle branding click
    document.getElementById('focus-blocked-branding')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'openPopup' }).catch(() => {});
    });
  }
})();
