// Markdown, highlight.js, and KaTeX rendering
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try { return hljs.highlight(code, { language: lang }).value; } catch { /* skip */ }
    }
    try { return hljs.highlightAuto(code).value; } catch { return code; }
  }
});

export function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 ** 2) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

// Parse content and extract artifacts
export function parseContent(raw) {
  const artifacts = [];

  // Detect titled code blocks as artifacts (even unclosed ones during streaming)
  let cleaned = raw.replace(/```(html|jsx|react|svg|markdown|md)\s+title="([^"]+)"\n([\s\S]*?)(?:```|$)/g, (m, type, title, code) => {
    artifacts.push({ id: 'art_' + Date.now() + '_' + artifacts.length, type: type.toLowerCase(), title, code: code.trim(), complete: m.endsWith('```') });
    return `@@ARTIFACT:${artifacts.length - 1}@@`;
  });

  // Detect normal HTML/JSX/React/JS/CSS etc code blocks as artifacts (even unclosed)
  cleaned = cleaned.replace(/```(\w+)?\n([\s\S]*?)(?:```|$)/g, (m, lang, code) => {
    if (['html', 'jsx', 'react', 'svg', 'js', 'javascript', 'css', 'python', 'py'].includes((lang || '').toLowerCase())) {
      artifacts.push({ id: 'art_' + Date.now() + '_' + artifacts.length, type: lang.toLowerCase(), title: 'Code ' + (lang ? lang.toUpperCase() : ''), code: code.trim(), complete: m.endsWith('```') });
      return `@@ARTIFACT:${artifacts.length - 1}@@`;
    }
    return m;
  });

  // Extract <ask_user> blocks BEFORE markdown parsing (DOMPurify would strip them)
  const askWidgets = [];
  cleaned = cleaned.replace(/<ask_user>([\s\S]*?)<\/ask_user>/gi, (_, inner) => {
    const parts = inner.split('|').map(p => p.trim()).filter(Boolean);
    if (!parts.length) return '';
    // First part ending with '?' is a question label, otherwise all parts are options
    let question = '';
    let options = parts;
    if (parts[0].endsWith('?') && parts.length > 1) {
      question = parts[0];
      options = parts.slice(1);
    }
    const btns = options.map(o =>
      `<button class="ask-choice-btn" onclick='window.__chooseOption(${JSON.stringify(o)})'>${escapeHtml(o)}</button>`
    ).join('');
    const qHtml = question ? `<div class="ask-user__question">${escapeHtml(question)}</div>` : '';
    askWidgets.push(`<div class="ask-user">${qHtml}<div class="ask-user__options">${btns}</div></div>`);
    return `@@ASKUSER:${askWidgets.length - 1}@@`;
  });

  let html;
  try {
    html = DOMPurify.sanitize(marked.parse(cleaned), { ADD_ATTR: ['target'] });
  } catch {
    html = escapeHtml(cleaned);
  }

  // Replace artifact placeholders with actual target divs for chat.js
  html = html.replace(/@@ARTIFACT:(\d+)@@/g, '<div class="artifact-placeholder" data-index="$1"></div>');

  // Restore ask_user widgets
  html = html.replace(/@@ASKUSER:(\d+)@@/g, (_, i) => askWidgets[+i] || '');

  // Add copy buttons to code blocks and language headers
  html = html.replace(/<pre><code class="language-(\w+)">/g, (m, lang) => {
    return `<div class="code-block"><div class="code-header"><span class="code-lang">${lang}</span><button class="code-copy-btn" onclick="this.parentElement.parentElement.querySelector('code').innerText && navigator.clipboard.writeText(this.parentElement.parentElement.querySelector('code').innerText).then(() => { this.textContent = 'Copié ✓'; setTimeout(() => this.textContent = 'Copier', 1500); })">Copier</button></div><pre><code class="language-${lang}">`;
  });
  html = html.replace(/<pre><code>/g, '<div class="code-block"><div class="code-header"><span class="code-lang">text</span><button class="code-copy-btn" onclick="navigator.clipboard.writeText(this.parentElement.parentElement.querySelector(\'code\').innerText).then(() => { this.textContent = \'Copié ✓\'; setTimeout(() => this.textContent = \'Copier\', 1500); })">Copier</button></div><pre><code>');
  html = html.replace(/<\/code><\/pre>/g, '</code></pre></div>');

  return { html, artifacts };
}

// Apply syntax highlighting to elements
export function highlightCode(container) {
  container.querySelectorAll('pre code').forEach(b => {
    try { hljs.highlightElement(b); } catch { /* skip */ }
  });
}

// Apply KaTeX rendering
export async function renderMath(container) {
  try {
    const katex = await import('katex');
    const renderMathInElement = (await import('katex/contrib/auto-render')).default;
    renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false }
      ],
      throwOnError: false
    });
  } catch { /* KaTeX not loaded */ }
}
