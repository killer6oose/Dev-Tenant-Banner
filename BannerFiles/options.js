// Author: Andrew Hatton
// Purpose: Full-page settings tab - the site table (name, match rule, color, font size,
// position, enabled), plus import/export. This replaces the old cramped popup UI for
// anything beyond a quick per-page toggle.

const STORAGE_KEY = 'dtbSettings';

const DEFAULT_SETTINGS = {
  enabled: true,
  tenants: []
};

// A curated set of readable, easy-on-the-eyes banner colors, in place of a free-form
// color picker. Banner text color is chosen automatically per-color for contrast
// (see resolveTextColor in content.js), so no color here needs a matching text option.
const COLOR_PALETTE = [
  { name: 'Red', value: '#c0392b' },
  { name: 'Amber', value: '#e0a800' },
  { name: 'Green', value: '#1a9c5c' },
  { name: 'Blue', value: '#2f6fed' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Teal', value: '#0891b2' },
  { name: 'Pink', value: '#c2255c' },
  { name: 'Slate', value: '#475569' }
];

const POSITIONS = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'border', label: 'Border (full frame)' }
];

let settings = null;

const enabledToggle = document.getElementById('enabledToggle');
const tenantRowsEl = document.getElementById('tenantRows');
const addTenantBtn = document.getElementById('addTenantBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const exportBtn = document.getElementById('exportBtn');
const importFile = document.getElementById('importFile');
const importUrlInput = document.getElementById('importUrl');
const importUrlBtn = document.getElementById('importUrlBtn');
const ioMessage = document.getElementById('ioMessage');

function newId() {
  return 'site-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
}

function save() {
  chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

function showMessage(text, isError) {
  ioMessage.textContent = text;
  ioMessage.className = 'dtb-io-message ' + (isError ? 'dtb-error' : 'dtb-ok');
}

// ── Preview swatch (mirrors content.js rendering rules at a glance) ──
function updatePreviewSwatch(swatchEl, site) {
  swatchEl.dataset.position = site.position || 'top-right';
  swatchEl.style.setProperty('--pv-color', site.color || '#c0392b');
}

// ── Table row rendering ──
function renderRow(site, index, total) {
  const tr = document.createElement('tr');

  // Name
  const nameTd = document.createElement('td');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Name';
  nameInput.value = site.label || '';
  nameInput.addEventListener('input', () => {
    site.label = nameInput.value;
    // The banner prefers "text" over "label" if both are set, but this table has no
    // separate "text" field to edit - so clear any leftover text (e.g. from a site added
    // via the popup's quick-add button) whenever the name changes, so the banner always
    // reflects what's typed here instead of getting stuck on an old value.
    site.text = '';
    save();
  });
  nameTd.appendChild(nameInput);
  tr.appendChild(nameTd);

  // Match
  const matchTd = document.createElement('td');
  const matchCell = document.createElement('div');
  matchCell.className = 'dtb-match-cell';

  const matchInput = document.createElement('input');
  matchInput.type = 'text';
  matchInput.placeholder = 'URL contains, or regex:pattern';
  matchInput.value = site.match || '';
  matchInput.addEventListener('input', () => { site.match = matchInput.value; save(); });
  matchCell.appendChild(matchInput);

  const buildBtn = document.createElement('button');
  buildBtn.type = 'button';
  buildBtn.className = 'dtb-build-regex-btn';
  buildBtn.innerHTML = '<span aria-hidden="true">🪄</span> Build';
  buildBtn.title = 'Build a regex pattern with guided questions';
  buildBtn.addEventListener('click', () => openRegexModal(matchInput, site));
  matchCell.appendChild(buildBtn);

  matchTd.appendChild(matchCell);
  tr.appendChild(matchTd);

  // Color - a small palette of prebaked, readable colors instead of a free-form picker.
  const colorTd = document.createElement('td');
  colorTd.className = 'dtb-color-cell';

  const colorSwatchBtn = document.createElement('button');
  colorSwatchBtn.type = 'button';
  colorSwatchBtn.className = 'dtb-color-swatch-btn';
  colorSwatchBtn.style.backgroundColor = site.color || '#c0392b';
  colorSwatchBtn.title = 'Choose banner color';
  colorSwatchBtn.setAttribute('aria-label', 'Choose banner color');
  colorTd.appendChild(colorSwatchBtn);

  const colorPopover = document.createElement('div');
  colorPopover.className = 'dtb-color-popover';
  COLOR_PALETTE.forEach((preset) => {
    const swatchOption = document.createElement('button');
    swatchOption.type = 'button';
    swatchOption.className = 'dtb-color-swatch';
    swatchOption.style.backgroundColor = preset.value;
    swatchOption.title = preset.name;
    swatchOption.setAttribute('aria-label', preset.name);
    if ((site.color || '').toLowerCase() === preset.value.toLowerCase()) {
      swatchOption.classList.add('dtb-selected');
    }
    swatchOption.addEventListener('click', () => {
      site.color = preset.value;
      colorSwatchBtn.style.backgroundColor = preset.value;
      colorPopover.querySelectorAll('.dtb-color-swatch').forEach((el) => el.classList.remove('dtb-selected'));
      swatchOption.classList.add('dtb-selected');
      updatePreviewSwatch(swatch, site);
      save();
      closeAllColorPopovers();
    });
    colorPopover.appendChild(swatchOption);
  });
  colorTd.appendChild(colorPopover);

  colorSwatchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = colorPopover.classList.contains('dtb-open');
    closeAllColorPopovers();
    if (!isOpen) { colorPopover.classList.add('dtb-open'); }
  });

  tr.appendChild(colorTd);

  // Font size
  const fontTd = document.createElement('td');
  const fontInput = document.createElement('input');
  fontInput.type = 'text';
  fontInput.placeholder = 'Auto';
  fontInput.value = site.fontSize && site.fontSize !== 'auto' ? site.fontSize : '';
  fontInput.addEventListener('input', () => { site.fontSize = fontInput.value || 'auto'; save(); });
  fontTd.appendChild(fontInput);
  tr.appendChild(fontTd);

  // Position
  const posTd = document.createElement('td');
  const posSelect = document.createElement('select');
  POSITIONS.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.value;
    opt.textContent = p.label;
    if ((site.position || 'top-right') === p.value) opt.selected = true;
    posSelect.appendChild(opt);
  });
  posSelect.addEventListener('change', () => {
    site.position = posSelect.value;
    updatePreviewSwatch(swatch, site);
    save();
  });
  posTd.appendChild(posSelect);
  tr.appendChild(posTd);

  // Preview
  const previewTd = document.createElement('td');
  const swatch = document.createElement('div');
  swatch.className = 'dtb-preview-swatch';
  const shape = document.createElement('div');
  shape.className = 'dtb-preview-shape';
  swatch.appendChild(shape);
  updatePreviewSwatch(swatch, site);
  previewTd.appendChild(swatch);
  tr.appendChild(previewTd);

  // Enabled
  const enabledTd = document.createElement('td');
  const enabledCheckbox = document.createElement('input');
  enabledCheckbox.type = 'checkbox';
  enabledCheckbox.checked = site.enabled !== false;
  enabledCheckbox.addEventListener('change', () => { site.enabled = enabledCheckbox.checked; save(); });
  enabledTd.appendChild(enabledCheckbox);
  tr.appendChild(enabledTd);

  // Row controls
  const controlsTd = document.createElement('td');

  const upBtn = document.createElement('button');
  upBtn.className = 'dtb-icon-btn';
  upBtn.textContent = '↑';
  upBtn.title = 'Move up (checked before rows below)';
  upBtn.disabled = index === 0;
  upBtn.addEventListener('click', () => {
    [settings.tenants[index - 1], settings.tenants[index]] = [settings.tenants[index], settings.tenants[index - 1]];
    save();
    renderTable();
  });
  controlsTd.appendChild(upBtn);

  const downBtn = document.createElement('button');
  downBtn.className = 'dtb-icon-btn';
  downBtn.textContent = '↓';
  downBtn.title = 'Move down';
  downBtn.disabled = index === total - 1;
  downBtn.addEventListener('click', () => {
    [settings.tenants[index + 1], settings.tenants[index]] = [settings.tenants[index], settings.tenants[index + 1]];
    save();
    renderTable();
  });
  controlsTd.appendChild(downBtn);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'dtb-icon-btn';
  removeBtn.textContent = '✕';
  removeBtn.title = 'Remove site';
  removeBtn.addEventListener('click', () => {
    settings.tenants = settings.tenants.filter((t) => t.id !== site.id);
    save();
    renderTable();
  });
  controlsTd.appendChild(removeBtn);

  tr.appendChild(controlsTd);

  return tr;
}

// Closes any open color popover - called before opening a new one, and on outside clicks.
function closeAllColorPopovers() {
  document.querySelectorAll('.dtb-color-popover.dtb-open').forEach((el) => el.classList.remove('dtb-open'));
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dtb-color-cell')) { closeAllColorPopovers(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeAllColorPopovers(); }
});

function renderTable() {
  tenantRowsEl.innerHTML = '';
  settings.tenants.forEach((site, index) => {
    tenantRowsEl.appendChild(renderRow(site, index, settings.tenants.length));
  });
}

function renderAll() {
  enabledToggle.checked = settings.enabled;
  renderTable();
}

enabledToggle.addEventListener('change', () => {
  settings.enabled = enabledToggle.checked;
  save();
});

addTenantBtn.addEventListener('click', () => {
  settings.tenants.push({ id: newId(), label: '', match: '', text: '', color: '#2f6fed', fontSize: 'auto', position: 'top-right', enabled: true });
  save();
  renderTable();
});

clearAllBtn.addEventListener('click', () => {
  if (!confirm('Clear all sites and reset settings to defaults?')) return;
  settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  settings.tenants.forEach((t) => { t.id = newId(); });
  save();
  renderAll();
});

// ── Export ──
exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Development-tenant-banner-settings.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Validates and applies an imported settings object, tolerating a raw tenant array too.
function applyImportedSettings(parsed) {
  let incoming = parsed;
  if (Array.isArray(parsed)) {
    incoming = { enabled: true, tenants: parsed };
  }
  if (!incoming || !Array.isArray(incoming.tenants)) {
    throw new Error('File does not look like a Development Tenant Banner settings export.');
  }

  incoming.tenants.forEach((t) => {
    if (!t.id) t.id = newId();
    if (!t.position) t.position = 'top-right';
    if (!t.fontSize) t.fontSize = 'auto';
  });

  settings = {
    enabled: incoming.enabled !== false,
    tenants: incoming.tenants
  };
  save();
  renderAll();
}

// ── Import from local file ──
importFile.addEventListener('change', () => {
  const file = importFile.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      applyImportedSettings(JSON.parse(reader.result));
      showMessage('Imported ' + settings.tenants.length + ' site(s) from ' + file.name + '.', false);
    } catch (e) {
      showMessage('Import failed: ' + e.message, true);
    }
    importFile.value = '';
  };
  reader.onerror = () => {
    showMessage('Could not read that file.', true);
    importFile.value = '';
  };
  reader.readAsText(file);
});

// ── Import from a hosted URL ──
// Fetching an arbitrary URL needs host permission for that origin. Rather than declaring
// broad host permissions up front (which triggers extra store review scrutiny), this asks
// for permission to just that one origin, only when the user actually imports from it.
importUrlBtn.addEventListener('click', () => {
  const raw = importUrlInput.value.trim();
  if (!raw) { showMessage('Enter a URL first.', true); return; }

  let origin;
  try {
    origin = new URL(raw).origin + '/*';
  } catch (e) {
    showMessage('That does not look like a valid URL.', true);
    return;
  }

  chrome.permissions.request({ origins: [origin] }, (granted) => {
    if (!granted) {
      showMessage('Permission was not granted, so the file could not be fetched.', true);
      return;
    }
    fetch(raw)
      .then((r) => {
        if (!r.ok) throw new Error('Server returned ' + r.status);
        return r.json();
      })
      .then((data) => {
        applyImportedSettings(data);
        showMessage('Imported ' + settings.tenants.length + ' site(s) from ' + raw + '.', false);
      })
      .catch((e) => {
        showMessage('Import failed: ' + e.message, true);
      });
  });
});

chrome.storage.local.get([STORAGE_KEY], (result) => {
  settings = result[STORAGE_KEY] || JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (!result[STORAGE_KEY]) save();
  renderAll();
});

// ── Regex builder wizard ──────────────────────────────────────────────
// Lets someone who doesn't know regex answer a plain-English question and get a
// working pattern out, with a live preview and an optional test-URL check before
// it's written back into the row's match field.

const regexModalOverlay = document.getElementById('regexModalOverlay');
const regexModalClose = document.getElementById('regexModalClose');
const regexType = document.getElementById('regexType');
const regexFieldSingle = document.getElementById('regexFieldSingle');
const regexSingleLabel = document.getElementById('regexSingleLabel');
const regexSingleInput = document.getElementById('regexSingleInput');
const regexFieldList = document.getElementById('regexFieldList');
const regexListInput = document.getElementById('regexListInput');
const regexOutput = document.getElementById('regexOutput');
const regexTestUrl = document.getElementById('regexTestUrl');
const regexTestResult = document.getElementById('regexTestResult');
const regexUseBtn = document.getElementById('regexUseBtn');
const regexCancelBtn = document.getElementById('regexCancelBtn');

// The row currently being edited by the wizard - set when it's opened, cleared on close.
let regexTarget = null; // { matchInput, site }

const REGEX_TYPE_LABELS = {
  exact: 'Domain',
  subdomains: 'Domain',
  prefix: 'Hostname prefix',
  wildcard: 'Pattern (use * for "anything")',
  raw: 'Regex pattern'
};

const REGEX_TYPE_PLACEHOLDERS = {
  exact: 'example.com',
  subdomains: 'example.com',
  prefix: 'internal-app',
  wildcard: 'internal-*.example.com',
  raw: '^https?:\\/\\/(dev|test)\\.example\\.com'
};

// Escapes regex special characters in plain text so it's treated literally.
function escapeRegexLiteral(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Turns the wizard's current answers into a regex pattern string (no "regex:" prefix).
function buildRegexFromWizard() {
  const type = regexType.value;

  if (type === 'anyof') {
    const words = regexListInput.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!words.length) return '';
    return '(' + words.map(escapeRegexLiteral).join('|') + ')';
  }

  const val = regexSingleInput.value.trim();
  if (!val) return '';

  if (type === 'exact') {
    return '^https?:\\/\\/' + escapeRegexLiteral(val) + '([\\/:?#]|$)';
  }
  if (type === 'subdomains') {
    return '^https?:\\/\\/([a-z0-9-]+\\.)*' + escapeRegexLiteral(val) + '([\\/:?#]|$)';
  }
  if (type === 'prefix') {
    return '^https?:\\/\\/' + escapeRegexLiteral(val);
  }
  if (type === 'wildcard') {
    // Escape everything literally, then turn the escaped "\*" back into a real wildcard.
    return escapeRegexLiteral(val).replace(/\\\*/g, '.*');
  }
  if (type === 'raw') {
    return val; // user is typing the regex directly - no escaping
  }
  return '';
}

// Refreshes which input field is shown based on the selected match type.
function updateRegexFieldVisibility() {
  const type = regexType.value;
  const isList = type === 'anyof';
  regexFieldList.style.display = isList ? '' : 'none';
  regexFieldSingle.style.display = isList ? 'none' : '';
  if (!isList) {
    regexSingleLabel.textContent = REGEX_TYPE_LABELS[type] || 'Value';
    regexSingleInput.placeholder = REGEX_TYPE_PLACEHOLDERS[type] || '';
  }
}

// Recomputes the pattern and, if a test URL is filled in, shows whether it matches.
function refreshRegexOutput() {
  const pattern = buildRegexFromWizard();
  regexOutput.value = pattern;

  const testValue = regexTestUrl.value.trim();
  if (!testValue) {
    regexTestResult.textContent = '';
    regexTestResult.className = 'dtb-io-message';
    return;
  }
  if (!pattern) {
    regexTestResult.textContent = 'Fill in the fields above to generate a pattern.';
    regexTestResult.className = 'dtb-io-message';
    return;
  }
  try {
    const isMatch = new RegExp(pattern, 'i').test(testValue);
    regexTestResult.textContent = isMatch ? '✓ Matches' : '✗ Does not match';
    regexTestResult.className = 'dtb-io-message ' + (isMatch ? 'dtb-ok' : 'dtb-error');
  } catch (e) {
    regexTestResult.textContent = 'Invalid pattern: ' + e.message;
    regexTestResult.className = 'dtb-io-message dtb-error';
  }
}

function openRegexModal(matchInput, site) {
  regexTarget = { matchInput, site };

  // Start from a sensible default each time - editing an existing raw regex is still
  // possible via the "I'll type my own regex" option below.
  regexType.value = 'exact';
  regexSingleInput.value = '';
  regexListInput.value = '';
  regexTestUrl.value = '';

  // If the row already has a regex: pattern, drop the user straight into "raw" mode
  // pre-filled with it, so editing an existing pattern doesn't mean starting over.
  const existing = (site.match || '').trim();
  if (existing.indexOf('regex:') === 0) {
    regexType.value = 'raw';
    regexSingleInput.value = existing.slice(6);
  }

  updateRegexFieldVisibility();
  refreshRegexOutput();
  regexModalOverlay.classList.add('dtb-open');
}

function closeRegexModal() {
  regexModalOverlay.classList.remove('dtb-open');
  regexTarget = null;
}

regexType.addEventListener('change', () => {
  updateRegexFieldVisibility();
  refreshRegexOutput();
});
regexSingleInput.addEventListener('input', refreshRegexOutput);
regexListInput.addEventListener('input', refreshRegexOutput);
regexTestUrl.addEventListener('input', refreshRegexOutput);

regexModalClose.addEventListener('click', closeRegexModal);
regexCancelBtn.addEventListener('click', closeRegexModal);
regexModalOverlay.addEventListener('click', (e) => {
  if (e.target === regexModalOverlay) closeRegexModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && regexModalOverlay.classList.contains('dtb-open')) closeRegexModal();
});

regexUseBtn.addEventListener('click', () => {
  const pattern = buildRegexFromWizard();
  if (!pattern) {
    regexTestResult.textContent = 'Fill in the fields above first.';
    regexTestResult.className = 'dtb-io-message dtb-error';
    return;
  }
  if (!regexTarget) { closeRegexModal(); return; }

  const value = 'regex:' + pattern;
  regexTarget.site.match = value;
  regexTarget.matchInput.value = value;
  save();
  closeRegexModal();
});
