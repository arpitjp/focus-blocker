// Starting rule ID for our blocking rules
const RULE_ID_START = 1;

// Log immediately when script loads
console.log('🚀 Background script loaded!');

// Track if we've initialized
let initialized = false;

// Mutex to prevent concurrent rule updates
let isUpdating = false;

// Update the extension badge to show on/off status
async function updateBadge(enabled) {
  if (enabled) {
    await chrome.action.setBadgeText({ text: 'ON' });
    await chrome.action.setBadgeBackgroundColor({ color: '#22c55e' }); // Green
  } else {
    await chrome.action.setBadgeText({ text: '' }); // No badge when off
  }
}

// Initialize once
async function initialize() {
  if (initialized) {
    console.log('Already initialized, skipping...');
    return;
  }
  initialized = true;
  
  console.log('Initializing extension...');
  await updateBlockingRules();
  await checkBlockingTimer();
  
  // Re-block any tabs that should be blocked (handles extension reload)
  await reblockTabsAfterReload();
  
  // Set up alarm for periodic timer check (more reliable than setInterval in service workers)
  chrome.alarms.create('checkBlockingTimer', { periodInMinutes: 1 });
  console.log('✅ Initialization complete');
}

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkBlockingTimer') {
    checkBlockingTimer();
  }
});

// Re-block tabs after extension reload
async function reblockTabsAfterReload() {
  try {
    const syncResult = await chrome.storage.sync.get(['blockingEnabled', 'blockedSites']);
    const localResult = await chrome.storage.local.get(['blockingEnabled', 'blockedSites']);
    
    const enabled = syncResult.blockingEnabled ?? localResult.blockingEnabled ?? false;
    const blockedSites = syncResult.blockedSites ?? localResult.blockedSites ?? [];
    
    if (!enabled || blockedSites.length === 0) return;
    
    console.log('🔄 Re-blocking tabs after reload...');
    
    const tabs = await chrome.tabs.query({});
    
    for (const tab of tabs) {
      if (!tab.url) continue;
      
      // Skip chrome:// and extension pages
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;
      
      const urlLower = tab.url.toLowerCase();
      
      // Check if this tab matches any blocked site
      const matchedSite = blockedSites.find(site => {
        if (site.startsWith('*')) {
          const domain = site.substring(1).toLowerCase();
          return urlLower.includes(domain);
        } else if (site.startsWith('http://') || site.startsWith('https://')) {
          return urlLower.startsWith(site.toLowerCase());
        } else {
          return urlLower.includes(site.toLowerCase());
        }
      });
      
      if (matchedSite) {
        console.log(`🚫 Re-blocking tab ${tab.id}:`, tab.url);
        await injectBlockerScript(tab.id);
      }
    }
  } catch (error) {
    console.error('Error re-blocking tabs:', error);
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
      // Timer expired, disable blocking
      await chrome.storage.sync.set({ 
        blockingEnabled: false,
        blockingEndTime: null,
        blockingDuration: null
      });
      await chrome.storage.local.set({ 
        blockingEnabled: false,
        blockingEndTime: null,
        blockingDuration: null
      });
      await updateBlockingRules(true); // Sync tabs when timer expires
    }
  } catch (error) {
    console.error('Error checking blocking timer:', error);
  }
}

// Initialize when script loads
initialize();

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Message received:', message);
  
  if (message.action === 'test') {
    console.log('✅ Test message received - background script is working!');
    sendResponse({ success: true, message: 'Background script is running' });
    return true;
  }
  
  if (message.action === 'openPopup') {
    // Open the extension popup in a new tab
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'updateBlocking' || message.action === 'updateRules') {
    console.log('🔄 Updating blocking rules due to message...');
    // Wait a bit longer to ensure storage has been fully updated
    setTimeout(async () => {
      await updateBlockingRules(true); // Sync tabs on user action
      // Verify rules were applied
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      console.log('Total dynamic rules after update:', rules.length);
    }, 200);
    // If blocking is enabled with a timer, ensure we check it
    if (message.action === 'updateBlocking' && message.enabled && message.endTime) {
      // Timer will be checked by the interval, but we can also check immediately if needed
      setTimeout(checkBlockingTimer, 1000);
    }
  }
  sendResponse({ success: true });
  return true; // Keep the message channel open for async response
});

// Update blocking rules based on storage state
async function updateBlockingRules(syncTabs = false) {
  // Prevent concurrent updates
  if (isUpdating) {
    console.log('⏳ Update already in progress, skipping...');
    return;
  }
  isUpdating = true;
  
  try {
    // Check both sync (Google account) and local storage
    console.log('Loading from storage...');
    const syncResult = await chrome.storage.sync.get(['blockingEnabled', 'blockedSites']);
    const localResult = await chrome.storage.local.get(['blockingEnabled', 'blockedSites']);
    
    console.log('Sync result:', syncResult);
    console.log('Local result:', localResult);
    
    // Prefer sync storage, fallback to local
    const enabled = syncResult.blockingEnabled ?? localResult.blockingEnabled ?? false;
    const blockedSites = syncResult.blockedSites ?? localResult.blockedSites ?? [];

    console.log('=== BLOCKING RULES UPDATE ===');
    console.log('Blocking enabled:', enabled);
    console.log('Blocked sites:', blockedSites);
    
    // Update badge indicator
    await updateBadge(enabled);

    // Build the rules array
    const rules = [];
    if (enabled && blockedSites.length > 0) {
      let ruleId = RULE_ID_START;
      const blockedPageUrl = chrome.runtime.getURL('blocked.html');
      console.log('Blocked page URL:', blockedPageUrl);

      blockedSites.forEach((site) => {
        let urlFilter;
        let displaySite = site;
        
        if (site.startsWith('*')) {
          // Wildcard - blocks domain and all subdomains
          // *youtube.com → ||youtube.com (matches youtube.com and all subdomains)
          const domain = site.substring(1); // Remove the * prefix
          urlFilter = domain;
          displaySite = domain;
        } else if (site.startsWith('http://') || site.startsWith('https://')) {
          // Specific URL with protocol - block only this exact URL pattern
          urlFilter = site;
          displaySite = site;
        } else {
          // Fallback - treat as domain
          urlFilter = site;
        }
        
        // Use redirect to the blocked page with site info
          rules.push({
            id: ruleId++,
            priority: 1,
            action: {
            type: 'redirect',
            redirect: {
              url: `${blockedPageUrl}?site=${encodeURIComponent(displaySite)}`
            }
            },
            condition: {
            urlFilter: urlFilter,
            resourceTypes: ['main_frame', 'sub_frame']
          }
        });
      });
    }
    
    console.log('Rules to be added:', JSON.stringify(rules, null, 2));

    // Get existing rule IDs
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(rule => rule.id);
    console.log('Existing rule IDs:', existingRuleIds);

    // Atomic update: remove old and add new in one call
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingRuleIds,
        addRules: rules
      });
    } catch (ruleError) {
      console.error('❌ Error in updateDynamicRules:', ruleError.message);
      console.error('Rules that failed:', JSON.stringify(rules, null, 2));
      throw ruleError;
    }

    // Verify
    const finalRules = await chrome.declarativeNetRequest.getDynamicRules();
    console.log(`✅ Update complete. Active rules: ${finalRules.length}`);
    if (finalRules.length > 0) {
      console.log('Rules:', JSON.stringify(finalRules, null, 2));
    }
    
    // Auto-sync: Update currently open tabs (only when explicitly requested)
    if (syncTabs) {
      await syncOpenTabs(enabled, blockedSites);
    }
    
  } catch (error) {
    console.error('❌ ERROR updating rules:', error);
    console.error('Error message:', error.message);
  } finally {
    isUpdating = false;
  }
}

// Sync open tabs with blocking rules
async function syncOpenTabs(blockingEnabled, blockedSites) {
  try {
    // Only need to inject blocker when enabling
    // When disabling, the content script's storage listener handles overlay removal automatically
    if (!blockingEnabled || blockedSites.length === 0) {
      console.log('Blocking disabled - content scripts will auto-remove overlays');
      return;
    }
    
    const tabs = await chrome.tabs.query({});
    
    for (const tab of tabs) {
      if (!tab.url) continue;
      
      // Skip chrome:// and extension pages
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;
      
      // Check if tab URL matches any blocked site
      const matchedSite = blockedSites.find(site => {
        if (site.startsWith('*')) {
          const domain = site.substring(1).toLowerCase();
          return tab.url.toLowerCase().includes(domain);
        } else if (site.startsWith('http://') || site.startsWith('https://')) {
          return tab.url.toLowerCase().startsWith(site.toLowerCase());
        } else {
          return tab.url.toLowerCase().includes(site.toLowerCase());
        }
      });
      
      if (matchedSite) {
        console.log(`🔄 Blocking tab ${tab.id}:`, tab.url);
        await injectBlockerScript(tab.id);
      }
    }
  } catch (error) {
    console.error('Error syncing tabs:', error);
  }
}

// Listen for storage changes to update rules
chrome.storage.onChanged.addListener((changes, areaName) => {
  // Listen to both sync and local storage changes
  if (areaName === 'sync' || areaName === 'local') {
    // Check if blocking-related settings changed
    if (changes.blockingEnabled || changes.blockedSites) {
      updateBlockingRules(true); // Sync tabs on storage change (user action)
    }
  }
});

// Block websites using tabs.onUpdated listener
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Check when page completes loading or URL changes
  if (changeInfo.status !== 'complete' && !changeInfo.url) return;
  
  const url = tab.url || changeInfo.url;
  if (!url) return;
  
  // Skip extension pages and chrome:// pages
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;
  
  console.log('📍 Tab updated:', url, 'status:', changeInfo.status);
  
  try {
    // Get blocking state
    const syncResult = await chrome.storage.sync.get(['blockingEnabled', 'blockedSites']);
    const localResult = await chrome.storage.local.get(['blockingEnabled', 'blockedSites']);
    
    const enabled = syncResult.blockingEnabled ?? localResult.blockingEnabled ?? false;
    const blockedSites = syncResult.blockedSites ?? localResult.blockedSites ?? [];
    
    if (!enabled || blockedSites.length === 0) return;
    
    const urlLower = url.toLowerCase();
    
    // Check if URL matches any blocked site
    const matchedSite = blockedSites.find(site => {
      if (site.startsWith('*')) {
        const domain = site.substring(1).toLowerCase();
        return urlLower.includes(domain);
      } else if (site.startsWith('http://') || site.startsWith('https://')) {
        return urlLower.startsWith(site.toLowerCase());
      } else {
        return urlLower.includes(site.toLowerCase());
      }
    });
    
    if (matchedSite) {
      console.log('🚫 Blocking via content script:', url);
      
      // Inject the blocker content script
      await injectBlockerScript(tabId);
    }
  } catch (error) {
    console.error('Error in tabs listener:', error);
  }
});

// Inject the blocker content script into a tab
async function injectBlockerScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-blocker.js']
    });
    console.log('✅ Blocker script injected into tab', tabId);
  } catch (error) {
    console.error('Error injecting blocker script:', error);
  }
}

console.log('✅ Tab listener registered');

