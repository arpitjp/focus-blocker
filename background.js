// Starting rule ID for our blocking rules
const RULE_ID_START = 1;

// Track if we've initialized
let initialized = false;

// Mutex to prevent concurrent rule updates
let isUpdating = false;

// Keep offscreen document ready
let offscreenReady = false;

// Timer references - track all to prevent memory leaks
let timerTimeout = null;
let chimeTimeout = null;

async function ensureOffscreen() {
  if (offscreenReady) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play chime when focus session ends'
    });
    offscreenReady = true;
  } catch (e) {
    if (e.message?.includes('already exists')) {
      offscreenReady = true;
    }
  }
}

// Pre-create offscreen document on startup
ensureOffscreen();

// Play completion chime
async function playChime() {
  try {
    await ensureOffscreen();
    chrome.runtime.sendMessage({ action: 'offscreen_playChime' }).catch(() => {});
  } catch (e) {
    // Silently fail - chime is non-critical
  }
}

// Update the extension badge to show on/off status
async function updateBadge(enabled) {
  try {
    if (enabled) {
      await chrome.action.setBadgeText({ text: 'ON' });
      await chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch (e) {
    // Badge update is non-critical
  }
}

// Clear all timer references
function clearAllTimers() {
  if (timerTimeout) {
    clearTimeout(timerTimeout);
    timerTimeout = null;
  }
  if (chimeTimeout) {
    clearTimeout(chimeTimeout);
    chimeTimeout = null;
  }
  chrome.alarms.clear('focusTimerEnd').catch(() => {});
}

// Initialize once
async function initialize() {
  if (initialized) return;
  initialized = true;
  
  await updateBlockingRules();
  await checkBlockingTimer();
  await reblockTabsAfterReload();
  
  // Set up alarm for periodic timer check (backup for service worker sleep)
  chrome.alarms.create('checkBlockingTimer', { periodInMinutes: 1 });
}

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkBlockingTimer') {
    checkBlockingTimer();
  }
  if (alarm.name === 'focusTimerEnd') {
    // Timer ended - disable blocking and play chime
    try {
      await chrome.storage.sync.set({ 
        blockingEnabled: false,
        blockingEndTime: null,
        blockingDuration: null
      });
      await updateBlockingRules(true);
      playChime();
    } catch (e) {
      // Fallback to local storage
      await chrome.storage.local.set({ 
        blockingEnabled: false,
        blockingEndTime: null,
        blockingDuration: null
      });
      await updateBlockingRules(true);
    }
  }
});

// Set precise timer using setTimeout (more accurate than alarms for short durations)
function setTimerAlarm(endTime) {
  clearAllTimers();
  
  if (!endTime) return;
  
  const actualDelayMs = endTime - Date.now();
  if (actualDelayMs <= 0) return;
  
  // Play chime 2 seconds early (separate from blocking end)
  const chimeDelayMs = Math.max(0, actualDelayMs - 2000);
  chimeTimeout = setTimeout(() => {
    playChime();
  }, chimeDelayMs);
  
  // End blocking at actual time
  timerTimeout = setTimeout(async () => {
    try {
      await chrome.storage.sync.set({ 
        blockingEnabled: false,
        blockingEndTime: null,
        blockingDuration: null
      });
    } catch (e) {
      // Fallback
      await chrome.storage.local.set({ 
        blockingEnabled: false,
        blockingEndTime: null,
        blockingDuration: null
      }).catch(() => {});
    }
    await updateBlockingRules(true);
  }, actualDelayMs);
  
  // Also set alarm as backup (in case service worker sleeps)
  const delayMinutes = Math.max(actualDelayMs / 60000, 0.01);
  chrome.alarms.create('focusTimerEnd', { delayInMinutes: delayMinutes });
}

// Re-block tabs after extension reload
async function reblockTabsAfterReload() {
  try {
    const syncResult = await chrome.storage.sync.get(['blockingEnabled', 'blockedSites']);
    const localResult = await chrome.storage.local.get(['blockingEnabled', 'blockedSites']);
    
    const enabled = syncResult.blockingEnabled ?? localResult.blockingEnabled ?? false;
    const blockedSites = syncResult.blockedSites ?? localResult.blockedSites ?? [];
    
    if (!enabled || blockedSites.length === 0) return;
    
    const tabs = await chrome.tabs.query({});
    
    for (const tab of tabs) {
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;
      
      const urlLower = tab.url.toLowerCase();
      const isBlocked = blockedSites.some(site => matchesSite(urlLower, site));
      
      if (isBlocked) {
        await injectBlockerScript(tab.id);
      }
    }
  } catch (e) {
    // Non-critical - tabs will be blocked on next navigation
  }
}

// Helper function to check if URL matches a blocked site
function matchesSite(urlLower, site) {
  if (site.startsWith('*')) {
    return urlLower.includes(site.substring(1).toLowerCase());
  } else if (site.startsWith('http://') || site.startsWith('https://')) {
    return urlLower.startsWith(site.toLowerCase());
  } else {
    return urlLower.includes(site.toLowerCase());
  }
}

// Check for expired blocking timer
async function checkBlockingTimer() {
  try {
    const syncResult = await chrome.storage.sync.get(['blockingEnabled', 'blockingEndTime']);
    const localResult = await chrome.storage.local.get(['blockingEnabled', 'blockingEndTime']);
    
    const blockingEnabled = syncResult.blockingEnabled ?? localResult.blockingEnabled ?? false;
    const blockingEndTime = syncResult.blockingEndTime ?? localResult.blockingEndTime ?? null;
    
    if (blockingEnabled && blockingEndTime && Date.now() >= blockingEndTime) {
      await chrome.storage.sync.set({ 
        blockingEnabled: false,
        blockingEndTime: null,
        blockingDuration: null
      }).catch(() => {});
      await updateBlockingRules(true);
      playChime();
    }
  } catch (e) {
    // Timer check failed - will retry on next alarm
  }
}

// Initialize when script loads
initialize();

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'test') {
    sendResponse({ success: true, message: 'Background script is running' });
    return true;
  }
  
  if (message.action === 'openPopup') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'playChime') {
    playChime();
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'updateBlocking' || message.action === 'updateRules') {
    // Defer to ensure storage is updated
    setTimeout(async () => {
      await updateBlockingRules(true);
    }, 100);
    
    // Handle timer setup for updateBlocking
    if (message.action === 'updateBlocking') {
      if (message.enabled && message.endTime) {
        setTimerAlarm(message.endTime);
      } else if (!message.enabled) {
        clearAllTimers();
      }
      
      // Broadcast to all tabs
      chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { 
              action: 'timerUpdated', 
              endTime: message.endTime,
              enabled: message.enabled
            }).catch(() => {});
          }
        }
      });
    }
  }
  
  sendResponse({ success: true });
  return true;
});

// Update blocking rules based on storage state
async function updateBlockingRules(syncTabs = false) {
  if (isUpdating) return;
  isUpdating = true;
  
  try {
    const syncResult = await chrome.storage.sync.get(['blockingEnabled', 'blockedSites']);
    const localResult = await chrome.storage.local.get(['blockingEnabled', 'blockedSites']);
    
    const enabled = syncResult.blockingEnabled ?? localResult.blockingEnabled ?? false;
    const blockedSites = syncResult.blockedSites ?? localResult.blockedSites ?? [];
    
    await updateBadge(enabled);

    // Build the rules array
    const rules = [];
    if (enabled && blockedSites.length > 0) {
      let ruleId = RULE_ID_START;
      const blockedPageUrl = chrome.runtime.getURL('blocked.html');

      for (const site of blockedSites) {
        let urlFilter;
        let displaySite = site;
        
        if (site.startsWith('*')) {
          const domain = site.substring(1);
          urlFilter = '||' + domain;
          displaySite = domain;
        } else if (site.startsWith('http://') || site.startsWith('https://')) {
          try {
            const url = new URL(site);
            const domain = url.hostname.replace(/^www\./, '');
            urlFilter = '||' + domain;
            displaySite = domain;
          } catch {
            urlFilter = '||' + site;
          }
        } else {
          urlFilter = '||' + site;
        }
        
        // Rule for main page navigation
        rules.push({
          id: ruleId++,
          priority: 1,
          action: {
            type: 'redirect',
            redirect: { url: `${blockedPageUrl}?site=${encodeURIComponent(displaySite)}` }
          },
          condition: {
            urlFilter: urlFilter,
            resourceTypes: ['main_frame', 'sub_frame']
          }
        });
        
        // Rule for blocking other resources
        rules.push({
          id: ruleId++,
          priority: 1,
          action: { type: 'block' },
          condition: {
            urlFilter: urlFilter,
            resourceTypes: ['media', 'image', 'script', 'stylesheet', 'font', 'xmlhttprequest', 'websocket', 'other']
          }
        });
      }
    }

    // Get existing rule IDs and update atomically
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(rule => rule.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: rules
    });
    
    if (syncTabs) {
      await syncOpenTabs(enabled, blockedSites);
    }
    
  } catch (e) {
    // Rule update failed - will retry on next trigger
  } finally {
    isUpdating = false;
  }
}

// Sync open tabs with blocking rules
async function syncOpenTabs(blockingEnabled, blockedSites) {
  try {
    const tabs = await chrome.tabs.query({});
    
    for (const tab of tabs) {
      if (!tab.url || !tab.id) continue;
      
      const isBlockedPage = tab.url.includes('blocked.html') && tab.url.includes(chrome.runtime.id);
      
      // If blocking is disabled, unblock blocked pages
      if (!blockingEnabled || blockedSites.length === 0) {
        if (isBlockedPage) {
          chrome.tabs.goBack(tab.id).catch(() => {});
        }
        continue;
      }
      
      // Skip chrome:// and extension pages
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;
      
      // Check if tab URL matches any blocked site
      const urlLower = tab.url.toLowerCase();
      const isBlocked = blockedSites.some(site => matchesSite(urlLower, site));
      
      if (isBlocked) {
        await injectBlockerScript(tab.id);
      }
    }
  } catch (e) {
    // Tab sync failed - non-critical
  }
}

// Listen for storage changes to update rules
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' || areaName === 'local') {
    if (changes.blockingEnabled || changes.blockedSites) {
      updateBlockingRules(true);
    }
  }
});

// Block websites using tabs.onUpdated listener
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' && !changeInfo.url) return;
  
  const url = tab.url || changeInfo.url;
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;
  
  try {
    const syncResult = await chrome.storage.sync.get(['blockingEnabled', 'blockedSites']);
    const localResult = await chrome.storage.local.get(['blockingEnabled', 'blockedSites']);
    
    const enabled = syncResult.blockingEnabled ?? localResult.blockingEnabled ?? false;
    const blockedSites = syncResult.blockedSites ?? localResult.blockedSites ?? [];
    
    if (!enabled || blockedSites.length === 0) return;
    
    const urlLower = url.toLowerCase();
    const isBlocked = blockedSites.some(site => matchesSite(urlLower, site));
    
    if (isBlocked) {
      await injectBlockerScript(tabId);
    }
  } catch (e) {
    // Tab update handling failed - non-critical
  }
});

// Inject the blocker content script into a tab
async function injectBlockerScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-blocker.js']
    });
  } catch (e) {
    // Script injection failed - likely invalid tab
  }
}
