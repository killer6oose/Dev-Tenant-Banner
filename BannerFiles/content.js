// Author: Andrew Hatton
// Purpose: Reads the site list from extension storage, checks if the current page's URL
// matches one of the configured entries (stg/uat/prod/custom, or any site the user adds),
// and draws a banner - a corner ribbon or a full-screen border frame - so it's obvious at
// a glance which environment you're on.

var STORAGE_KEY = 'dtbSettings';
var BANNER_ID = 'dtb-banner-root';
var STYLE_ID = 'dtb-banner-style';

var DEFAULT_SETTINGS = {
  enabled: true,
  tenants: []
};

// Removes any banner we previously injected, so re-renders don't stack up.
function removeBanner() {
  var existing = document.getElementById(BANNER_ID);
  if (existing) { existing.parentNode.removeChild(existing); }
  var style = document.getElementById(STYLE_ID);
  if (style) { style.parentNode.removeChild(style); }
}

// Tests a single site entry's match rule against the current URL.
// A "regex:" prefix means the rest of the string is a JS regular expression tested
// against the raw URL (case-insensitive). Otherwise it's a plain substring "contains" check.
function matchesUrl(rawMatch, url) {
  var match = (rawMatch || '').trim();
  if (match === '') { return false; }

  if (match.indexOf('regex:') === 0) {
    var pattern = match.slice(6);
    if (pattern === '') { return false; }
    try {
      return new RegExp(pattern, 'i').test(url);
    } catch (e) {
      // Bad regex typed by the user - treat as no match rather than throwing on every page.
      console.warn('Development Tenant Banner: invalid regex "' + pattern + '" - ' + e.message);
      return false;
    }
  }

  return url.toLowerCase().indexOf(match.toLowerCase()) !== -1;
}

// Finds the first enabled site whose match rule fires against the current URL.
// First match in the list order wins.
function findMatchingSite(sites) {
  var url = window.location.href;
  for (var i = 0; i < sites.length; i++) {
    var site = sites[i];
    if (!site || site.enabled === false) { continue; }
    if (matchesUrl(site.match, url)) { return site; }
  }
  return null;
}

// Resolves a site's font size setting to a CSS value. "auto" (or empty) falls back to the
// sensible default for whichever banner style is being drawn.
function resolveFontSize(site, fallbackPx) {
  var size = (site.fontSize || '').toString().trim().toLowerCase();
  if (size === '' || size === 'auto') { return fallbackPx + 'px'; }
  if (/^\d+$/.test(size)) { return size + 'px'; }
  return size; // user typed something with its own unit, e.g. "1.2em"
}

// Picks readable banner text - near-black or near-white - based on the background color's
// perceived brightness (YIQ formula), so custom or imported colors always stay legible
// instead of requiring the user to also manage a separate text color setting.
function resolveTextColor(bgHex) {
  var hex = (bgHex || '').replace('#', '');
  if (hex.length === 3) {
    hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
  }
  if (hex.length !== 6 || /[^0-9a-fA-F]/.test(hex)) { return '#ffffff'; }
  var r = parseInt(hex.substr(0, 2), 16);
  var g = parseInt(hex.substr(2, 2), 16);
  var b = parseInt(hex.substr(4, 2), 16);
  var yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#1f2328' : '#ffffff';
}

// Draws the diagonal corner-ribbon style banner.
function renderRibbon(site, corner) {
  var wrap = document.createElement('div');
  wrap.id = BANNER_ID;
  wrap.className = 'dtb-ribbon-wrap dtb-corner-' + corner;

  var color = site.color || '#c0392b';
  var ribbon = document.createElement('div');
  ribbon.className = 'dtb-ribbon';
  ribbon.textContent = site.text || site.label || 'SITE';
  ribbon.style.backgroundColor = color;
  ribbon.style.color = resolveTextColor(color);
  ribbon.style.fontSize = resolveFontSize(site, 12);

  wrap.appendChild(ribbon);
  document.body.appendChild(wrap);
}

// Draws the full-screen border-frame style banner - a colored outline around the entire
// viewport with a small centered label so the environment is identifiable at a glance.
function renderBorder(site) {
  var wrap = document.createElement('div');
  wrap.id = BANNER_ID;
  wrap.className = 'dtb-border-wrap';
  wrap.style.borderColor = site.color || '#c0392b';

  var color = site.color || '#c0392b';
  var label = document.createElement('div');
  label.className = 'dtb-border-label';
  label.textContent = site.text || site.label || 'SITE';
  label.style.backgroundColor = color;
  label.style.color = resolveTextColor(color);
  label.style.fontSize = resolveFontSize(site, 12);

  wrap.appendChild(label);
  document.body.appendChild(wrap);
}

// Injects the shared stylesheet once per page. Kept as one block (rather than per-banner
// inline styles) since the border frame and ribbon share the same base rules.
function injectStyle() {
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '.dtb-ribbon-wrap{position:fixed;width:150px;height:150px;overflow:hidden;z-index:2147483647;pointer-events:none;}' +
    '.dtb-corner-top-left{top:0;left:0;}' +
    '.dtb-corner-top-right{top:0;right:0;}' +
    '.dtb-corner-bottom-left{bottom:0;left:0;}' +
    '.dtb-corner-bottom-right{bottom:0;right:0;}' +
    '.dtb-ribbon{position:absolute;display:block;width:200px;padding:7px 0;text-align:center;' +
    'font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-weight:700;line-height:1.4;' +
    'letter-spacing:1px;text-transform:uppercase;box-shadow:0 2px 6px rgba(0,0,0,.35);}' +
    '.dtb-corner-top-left .dtb-ribbon{top:20px;left:-52px;transform:rotate(-45deg);}' +
    '.dtb-corner-top-right .dtb-ribbon{top:20px;right:-52px;transform:rotate(45deg);}' +
    '.dtb-corner-bottom-left .dtb-ribbon{bottom:20px;left:-52px;transform:rotate(45deg);}' +
    '.dtb-corner-bottom-right .dtb-ribbon{bottom:20px;right:-52px;transform:rotate(-45deg);}' +
    '.dtb-border-wrap{position:fixed;inset:0;border-style:solid;border-width:6px;' +
    'z-index:2147483647;pointer-events:none;box-sizing:border-box;}' +
    '.dtb-border-label{position:fixed;top:0;left:50%;transform:translateX(-50%);' +
    'padding:5px 16px;border-radius:0 0 6px 6px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;' +
    'font-weight:700;letter-spacing:1px;text-transform:uppercase;box-shadow:0 2px 6px rgba(0,0,0,.35);}';
  document.head.appendChild(style);
}

// Reads settings and shows or hides the banner based on whether the current URL matches.
function applyBanner() {
  chrome.storage.local.get([STORAGE_KEY], function (result) {
    var settings = result[STORAGE_KEY] || DEFAULT_SETTINGS;
    removeBanner();

    if (!settings.enabled) { return; }

    var site = findMatchingSite(settings.tenants || []);
    if (!site) { return; }

    injectStyle();

    var position = site.position || 'top-right';
    if (position === 'border') {
      renderBorder(site);
    } else {
      renderRibbon(site, position);
    }
  });
}

// document.body may not exist yet at document_idle in rare cases (e.g. XML/plain-text pages).
if (document.body) {
  applyBanner();
} else {
  document.addEventListener('DOMContentLoaded', applyBanner);
}

// Live-update the banner if settings change while the page is open (no reload needed).
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === 'local' && changes[STORAGE_KEY]) {
    applyBanner();
  }
});
