// Shared UI for blocked page and content-blocker overlay
const BlockedUI = {
  css: `
    .focus-blocked-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #f0f0f5;
      z-index: 2147483647;
    }
    .focus-blocked-overlay * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    .focus-blocked-container {
      text-align: center;
      padding: 60px;
      max-width: 640px;
    }
    .focus-blocked-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
      margin-bottom: 32px;
    }
    .focus-blocked-icon {
      width: 64px;
      height: 64px;
      flex-shrink: 0;
    }
    .focus-blocked-icon img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .focus-blocked-title {
      font-size: 32px;
      font-weight: 700;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .focus-blocked-subtitle {
      font-size: 14px;
      color: #6b7280;
      margin-bottom: 56px;
      line-height: 1.5;
      letter-spacing: 0.3px;
      font-weight: 400;
      opacity: 0.85;
    }
    .focus-blocked-info {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
      margin-bottom: 64px;
      flex-wrap: wrap;
    }
    .focus-blocked-site {
      display: inline-block;
      background: rgba(102, 126, 234, 0.12);
      border: 1px solid rgba(102, 126, 234, 0.2);
      padding: 14px 32px;
      border-radius: 24px;
      font-size: 15px;
      color: #667eea;
      font-weight: 500;
    }
    .focus-blocked-timer {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      background: rgba(102, 126, 234, 0.08);
      border: 1px solid rgba(102, 126, 234, 0.15);
      border-radius: 24px;
      padding: 14px 32px;
    }
    .focus-blocked-timer-label {
      font-size: 11px;
      color: #718096;
      text-transform: uppercase;
      letter-spacing: 1.2px;
    }
    .focus-blocked-timer-value {
      font-size: 20px;
      font-weight: 700;
      color: #667eea;
    }
    .focus-blocked-footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
    }
    .focus-blocked-branding {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #4a5568;
      font-size: 12px;
      text-decoration: none;
      cursor: pointer;
      transition: color 0.2s ease;
    }
    .focus-blocked-branding:hover {
      color: #667eea;
    }
    .focus-blocked-branding-icon {
      width: 18px;
      height: 18px;
    }
    .focus-blocked-branding-icon img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .focus-blocked-divider {
      width: 1px;
      height: 16px;
      background: rgba(255,255,255,0.1);
    }
    .focus-blocked-coffee {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #4a5568;
      font-size: 12px;
      text-decoration: none;
      transition: color 0.15s ease;
      animation: focus-blocked-nudge 0.5s ease-in-out 0.6s;
    }
    .focus-blocked-coffee:hover {
      color: #f5c842;
    }
    .focus-blocked-coffee svg {
      width: 14px;
      height: 14px;
    }
    @keyframes focus-blocked-nudge {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(2px); }
      75% { transform: translateX(-2px); }
    }
  `,

  html: (site, iconUrl) => `
    <div class="focus-blocked-container">
      <div class="focus-blocked-header">
        <div class="focus-blocked-icon">
          <img src="${iconUrl}" alt="Focus Mode">
        </div>
        <h1 class="focus-blocked-title">Stay Focused!</h1>
      </div>
      <p class="focus-blocked-subtitle">This website has been blocked to help you stay productive.</p>
      <div class="focus-blocked-info">
        <div class="focus-blocked-site">${site}</div>
        <div class="focus-blocked-timer">
          <div class="focus-blocked-timer-label">Ends in</div>
          <div class="focus-blocked-timer-value" id="focus-blocked-timer-value">∞</div>
        </div>
      </div>
      <div class="focus-blocked-footer">
        <a href="#" class="focus-blocked-branding" id="focus-blocked-branding">
          <span>Powered by</span>
          <div class="focus-blocked-branding-icon"><img src="${iconUrl}" alt=""></div>
          <span>Focus Mode</span>
        </a>
        <div class="focus-blocked-divider"></div>
        <a href="https://buymeacoffee.com/arpitjpn" target="_blank" class="focus-blocked-coffee">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 21V19H20V21H2ZM20 8V5H3V8H2V4H21V8H20ZM18 17H3V8H18V17ZM19 8H21C21.55 8 22.021 8.196 22.413 8.588C22.805 8.98 23.001 9.451 23.001 10V13C23.001 13.55 22.805 14.021 22.413 14.413C22.021 14.805 21.55 15.001 21 15.001H19V13.001H21V10H19V8Z"/>
          </svg>
          <span>Buy me a coffee</span>
        </a>
      </div>
    </div>
  `,

  escapeHtml: (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  formatTime: (seconds) => {
    if (seconds <= 0) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  }
};

// Export for use in different contexts
if (typeof window !== 'undefined') {
  window.BlockedUI = BlockedUI;
}

