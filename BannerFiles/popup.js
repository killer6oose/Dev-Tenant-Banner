// Author: Andrew Hatton
// Purpose: Compact per-page popup. This is a quick "is this page's banner on or off"
// toggle, not the full editor - full settings live on the options page (options.js).

const STORAGE_KEY = 'dtbSettings';

const statusCard = document.getElementById('statusCard');
const openOptionsBtn = document.getElementById('openOptionsBtn');

openOptionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Same match logic as content.js - kept in sync manually since this is a small,
// single-purpose popup script with no shared module loader in play.
function matchesUrl(rawMatch, url) {
  const match = (rawMatch || '').trim();
  if (match === '') return false;

  if (match.indexOf('regex:') === 0) {
    const pattern = match.slice(6);
    if (pattern === '') return false;
    try {
      return new RegExp(pattern, 'i').test(url);
    } catch (e) {
      return false;
    }
  }

  return url.toLowerCase().indexOf(match.toLowerCase()) !== -1;
}

function findMatchingSite(url, tenants) {
  for (const site of tenants) {
    if (!site || site.enabled === false) continue;
    if (matchesUrl(site.match, url)) return site;
  }
  return null;
}

function renderGloballyOff() {
  statusCard.innerHTML = '';
  const msg = document.createElement('div');
  msg.className = 'dtb-global-off';
  msg.textContent = 'The banner is turned off globally. Turn it back on from full settings.';
  statusCard.appendChild(msg);
}

function renderNoMatch(host, onAdd) {
  statusCard.innerHTML = '';
  const msg = document.createElement('div');
  msg.className = 'dtb-status-empty';
  msg.textContent = host
    ? `No site configured for ${host}.`
    : 'No site configured for this page.';
  statusCard.appendChild(msg);

  if (host && onAdd) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'dtb-btn dtb-btn-primary';
    addBtn.textContent = 'Add a banner to this site';
    addBtn.addEventListener('click', onAdd);
    statusCard.appendChild(addBtn);
  }
}

function renderMatch(site, host, onToggle) {
  statusCard.innerHTML = '';

  const row = document.createElement('div');
  row.className = 'dtb-status-row';

  const swatch = document.createElement('div');
  swatch.className = 'dtb-status-swatch';
  swatch.style.backgroundColor = site.color || '#c0392b';
  row.appendChild(swatch);

  const textWrap = document.createElement('div');
  textWrap.className = 'dtb-status-text';

  const label = document.createElement('div');
  label.className = 'dtb-status-label';
  label.textContent = site.label || site.text || 'Site';
  textWrap.appendChild(label);

  const hostEl = document.createElement('div');
  hostEl.className = 'dtb-status-host';
  hostEl.textContent = host || '';
  textWrap.appendChild(hostEl);

  row.appendChild(textWrap);

  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'dtb-toggle-switch';
  toggleLabel.title = 'Turn this site\'s banner on or off';

  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.checked = site.enabled !== false;
  toggleInput.addEventListener('change', () => onToggle(toggleInput.checked));
  toggleLabel.appendChild(toggleInput);

  const slider = document.createElement('span');
  slider.className = 'dtb-toggle-slider';
  toggleLabel.appendChild(slider);

  row.appendChild(toggleLabel);
  statusCard.appendChild(row);
}

function loadAndRender() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.url) {
      statusCard.innerHTML = '<div class="dtb-status-loading">This page is unavailable.</div>';
      return;
    }

    let host = '';
    try { host = new URL(tab.url).hostname; } catch (e) { host = tab.url; }

    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const settings = result[STORAGE_KEY];
      if (!settings) {
        renderNoMatch(host, () => addSiteForHost(host, settings));
        return;
      }

      if (!settings.enabled) {
        renderGloballyOff();
        return;
      }

      const site = findMatchingSite(tab.url, settings.tenants || []);
      if (!site) {
        renderNoMatch(host, () => addSiteForHost(host, settings));
        return;
      }

      renderMatch(site, host, (isEnabled) => {
        site.enabled = isEnabled;
        chrome.storage.local.set({ [STORAGE_KEY]: settings });
      });
    });
  });
}

// Adds a new site entry for the current host with sensible defaults (blue, top-right,
// auto font size), so a first-time user can get a banner showing without leaving the
// popup. They can refine the label, color, or match rule later from full settings.
function addSiteForHost(host, existingSettings) {
  if (!host) return;

  const settings = existingSettings || { enabled: true, tenants: [] };
  if (!Array.isArray(settings.tenants)) settings.tenants = [];

  settings.tenants.push({
    id: 'site-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    label: host,
    match: host,
    // "text" intentionally left blank - the banner falls back to "label" (the editable
    // Name field), so renaming the site in full settings always updates what the banner
    // shows instead of getting stuck on the hostname it was created with.
    text: '',
    color: '#2f6fed',
    fontSize: 'auto',
    position: 'top-right',
    enabled: true
  });

  chrome.storage.local.set({ [STORAGE_KEY]: settings }, () => {
    loadAndRender();
  });
}

loadAndRender();
