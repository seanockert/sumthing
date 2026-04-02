// TinySums app — UI glue: textarea, results, localStorage, copy

import { evaluate } from './evaluator.js';
import { formatResult } from './formatter.js';
import { highlightAll } from './highlighter.js';
import { fetchRates } from './currency.js';

const STORAGE_KEY = 'tinysums_v2';
const DEBOUNCE_MS = 300;

const DEFAULT_INPUT = `// Define values to use below
days = 15

// Define some variables
food: $12 x days
transport: $3.50 x days

// Add up all the above
sum

// Use units like kg
20kg plus 1900g

// Convert units
5km in miles 
1.5tbsp in grams
2 cups in ml
1 gallon in l
68f to c
64mph in km/h

// Percentages
32% off $429
34/78 in percent

// Or compound interest
$4000.22 at 3% pa

// Convert currencies
1000 JPY in AUD

// Dates and timezones
today
weeks in 2026
15:30 GMT in AEST`;

// ============================================================
// DOM references
// ============================================================

const textarea = document.getElementById('input');
const highlightLayer = document.getElementById('highlight');
const outputContainer = document.getElementById('output');
const toast = document.getElementById('toast');
const themeToggle = document.getElementById('themeToggle');

// ============================================================
// State
// ============================================================

let debounceTimer = null;
let rafPending = false;
let scrollRafPending = false;
const HAS_FIELD_SIZING = CSS.supports('field-sizing', 'content');

// ============================================================
// Core update loop
// ============================================================

// Instant visual feedback — batched to one update per frame
function syncVisuals() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    highlightLayer.innerHTML = highlightAll(textarea.value);
    autoResize();
    rafPending = false;
  });
}

// Expensive work — parsing + evaluation, debounced
function evalAndSave() {
  const input = textarea.value;
  const results = evaluate(input);
  renderOutput(results);
  localStorage.setItem(STORAGE_KEY, input);
}

function renderOutput(results) {
  const existing = outputContainer.children;

  for (let i = 0; i < results.length; i++) {
    const formatted = formatResult(results[i]);
    let div = existing[i];

    if (!div) {
      div = document.createElement('div');
      div.className = 'result-line';
      outputContainer.appendChild(div);
    }

    const btn = div.firstChild;
    if (formatted) {
      if (btn && btn.tagName === 'BUTTON') {
        // Reuse existing button
        if (btn.textContent !== formatted) {
          btn.textContent = formatted;
          btn.onclick = () => copyToClipboard(formatted);
        }
      } else {
        // Create new button
        div.innerHTML = '';
        const newBtn = document.createElement('button');
        newBtn.className = 'result-value';
        newBtn.textContent = formatted;
        newBtn.title = 'Click to copy';
        newBtn.onclick = () => copyToClipboard(formatted);
        div.appendChild(newBtn);
      }
    } else if (btn) {
      div.innerHTML = '';
    }
  }

  // Remove excess rows
  while (existing.length > results.length) {
    outputContainer.removeChild(outputContainer.lastChild);
  }
}

function autoResize() {
  if (!HAS_FIELD_SIZING) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }
}

// ============================================================
// Clipboard
// ============================================================

let toastTimer = null;

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast();
  } catch (e) {
    // Fallback for older browsers
    const tmp = document.createElement('textarea');
    tmp.value = text;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);
    showToast();
  }
}

function showToast() {
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 1200);
}

// ============================================================
// Theme
// ============================================================

const THEME_KEY = 'tinysums_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    applyTheme(saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark');
  }
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ============================================================
// Event listeners
// ============================================================

textarea.addEventListener('input', () => {
  // Highlighting + resize: immediate so text is never invisible
  syncVisuals();
  // Parsing + results: debounced since it's heavier
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(evalAndSave, DEBOUNCE_MS);
});

// Sync scroll between textarea and highlight layer
textarea.addEventListener('scroll', () => {
  if (scrollRafPending) return;
  scrollRafPending = true;
  requestAnimationFrame(() => {
    highlightLayer.scrollTop = textarea.scrollTop;
    highlightLayer.scrollLeft = textarea.scrollLeft;
    scrollRafPending = false;
  });
});

// Highlight corresponding output line on hover
let activeResultLine = null;
let cachedPaddingTop = 0;
let cachedLineHeight = 1;

function cacheTextareaMetrics() {
  const style = getComputedStyle(textarea);
  cachedPaddingTop = parseFloat(style.paddingTop);
  cachedLineHeight = parseFloat(style.lineHeight);
}

textarea.addEventListener('mousemove', (e) => {
  const y = e.clientY - textarea.getBoundingClientRect().top - cachedPaddingTop + textarea.scrollTop;
  const resultLine = outputContainer.children[Math.floor(y / cachedLineHeight)] || null;
  if (resultLine === activeResultLine) return;
  if (activeResultLine) activeResultLine.classList.remove('active');
  if (resultLine) resultLine.classList.add('active');
  activeResultLine = resultLine;
});

textarea.addEventListener('mouseleave', () => {
  if (activeResultLine) {
    activeResultLine.classList.remove('active');
    activeResultLine = null;
  }
});

// ============================================================
// Initialize
// ============================================================

async function init() {
  initTheme();
  const saved = localStorage.getItem(STORAGE_KEY);
  textarea.value = saved || DEFAULT_INPUT;
  syncVisuals();
  evalAndSave();
  cacheTextareaMetrics();
  window.addEventListener('resize', cacheTextareaMetrics);
  textarea.focus();

  // Fetch currency rates in background, re-evaluate when ready
  const success = await fetchRates();
  if (success) evalAndSave();
}

init();
