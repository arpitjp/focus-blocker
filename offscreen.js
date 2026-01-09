// Listen for chime request
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'offscreen_playChime') {
    playChime();
    sendResponse({ success: true });
  }
  return true;
});

// Track active audio context for cleanup
let activeContext = null;

function playChime() {
  // Clean up any previous context
  if (activeContext) {
    try {
      activeContext.close();
    } catch (e) {
      // Ignore close errors
    }
    activeContext = null;
  }
  
  try {
    const ctx = new AudioContext();
    activeContext = ctx;
    const now = ctx.currentTime;
    
    // Clear, distinctive tingsha-style chime
    const f = 880; // A5 - clear and pleasant
    
    // Strike 1 - clear bell hit
    playBell(ctx, f, now, 1.2, 0.35);
    playBell(ctx, f * 2, now, 0.8, 0.15);      // Octave
    playBell(ctx, f * 2.5, now, 0.6, 0.08);    // Bright overtone
    
    // Strike 2 - slightly higher, offset
    playBell(ctx, f * 1.5, now + 0.3, 1.0, 0.25);  // Fifth
    playBell(ctx, f * 3, now + 0.3, 0.7, 0.10);
    
    // Strike 3 - resolve
    playBell(ctx, f * 2, now + 0.6, 1.4, 0.30);    // Octave up
    playBell(ctx, f * 4, now + 0.6, 0.9, 0.12);
    
    // Close context after all sounds finish (longest duration + buffer)
    setTimeout(() => {
      if (activeContext === ctx) {
        ctx.close().catch(() => {});
        activeContext = null;
      }
    }, 3000);
  } catch (e) {
    // Audio playback failed - non-critical, ignore
    activeContext = null;
  }
}

function playBell(ctx, freq, start, duration, vol) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.frequency.value = freq;
    osc.type = 'sine';
    
    // Bell envelope - instant attack, smooth decay
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(vol * 0.3, start + duration * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    
    osc.start(start);
    osc.stop(start + duration);
  } catch (e) {
    // Individual bell failed - ignore
  }
}
