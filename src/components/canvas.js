// Canvas / Artifact panel — Claude-style code preview
import { state, emit } from '../lib/state.js';
import { escapeHtml } from '../lib/markdown.js';
import hljs from 'highlight.js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { showToast } from './toast.js';

export function renderCanvas() {
  return `
  <section class="canvas" id="canvasPanel">
    <div class="canvas__head">
      <div class="canvas__title-wrap">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        <h3 class="canvas__title" id="canvasTitle">Artifact</h3>
      </div>
      <div class="canvas__tabs">
        <button class="canvas__tab canvas__tab--active" id="tabPreview" onclick="window.__switchCanvasTab('preview')">Aperçu</button>
        <button class="canvas__tab" id="tabCode" onclick="window.__switchCanvasTab('code')">Code</button>
      </div>
      <div class="canvas__actions">
        <button class="canvas__action-btn" onclick="window.__copyArtifact()" title="Copier">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="canvas__action-btn" onclick="window.__downloadArtifact()" title="Télécharger">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        </button>
        <button class="canvas__action-btn" onclick="window.__closeCanvas()" title="Fermer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
    <div class="canvas__body">
      <div class="canvas__preview canvas__pane--active" id="canvasPreview"></div>
      <div class="canvas__code" id="canvasCode"><pre><code id="canvasCodeInner"></code></pre></div>
    </div>
  </section>`;
}

export function openArtifact(a) {
  state.currentArtifact = a;
  state.artifactOpen = true;
  document.getElementById('app').classList.add('app--canvas');

  document.getElementById('canvasTitle').textContent = a.title;
  const codeEl = document.getElementById('canvasCodeInner');
  codeEl.textContent = a.code;
  try { hljs.highlightElement(codeEl); } catch { /* skip */ }
  renderArtifactPreview(a);
  switchCanvasTab('preview');
}

let previewDebounce;
export function updateCanvasContent(code) {
  if (!state.currentArtifact) return;
  state.currentArtifact.code = code;
  
  // Update code tab natively
  const codeEl = document.getElementById('canvasCodeInner');
  if (codeEl) {
    codeEl.textContent = code;
    // Don't syntax highlight on every token for performance
  }

  // Debounce iframe reloading to avoid freezing
  clearTimeout(previewDebounce);
  previewDebounce = setTimeout(() => {
    // Only update preview if it's open or we want to keep it fresh
    renderArtifactPreview(state.currentArtifact);
    if (codeEl) {
      try { hljs.highlightElement(codeEl); } catch {}
    }
  }, 1000);
}

function renderArtifactPreview(a) {
  const p = document.getElementById('canvasPreview');
  p.innerHTML = '';


  if (a.type === 'markdown' || a.type === 'md') {
    p.innerHTML = `<div class="canvas__md-preview">${DOMPurify.sanitize(marked.parse(a.code))}</div>`;
  } else if (a.type === 'svg') {
    p.innerHTML = `<div class="canvas__svg-preview">${a.code}</div>`;
  } else {
    const iframe = document.createElement('iframe');
    iframe.className = 'canvas__iframe';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-forms';

    let src = a.code;
    if (a.type === 'jsx' || a.type === 'react') {
      src = `<!DOCTYPE html><html><head>
        <script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
        <script src="https://cdn.tailwindcss.com"><\/script>
        </head><body><div id="root"></div>
        <script type="text/babel">${a.code};
        const r=ReactDOM.createRoot(document.getElementById('root'));
        r.render(React.createElement(typeof App!=='undefined'?App:()=>React.createElement('div','Define an App component')));
        <\/script></body></html>`;
    } else if (!/<!DOCTYPE|<html/i.test(src)) {
      src = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"><\/script></head><body>${src}</body></html>`;
    }

    iframe.srcdoc = src;
    p.appendChild(iframe);
  }
}

export function switchCanvasTab(tab) {
  document.getElementById('tabPreview').classList.toggle('canvas__tab--active', tab === 'preview');
  document.getElementById('tabCode').classList.toggle('canvas__tab--active', tab === 'code');
  document.getElementById('canvasPreview').classList.toggle('canvas__pane--active', tab === 'preview');
  document.getElementById('canvasCode').classList.toggle('canvas__pane--active', tab === 'code');
}

export function closeCanvas() {
  state.artifactOpen = false;
  state.currentArtifact = null;
  document.getElementById('app').classList.remove('app--canvas');
}

export function copyArtifact() {
  if (!state.currentArtifact) return;
  navigator.clipboard.writeText(state.currentArtifact.code);
  showToast('Code copié', 'success');
}

export function downloadArtifact() {
  if (!state.currentArtifact) return;
  const a = state.currentArtifact;
  const ext = { html: 'html', jsx: 'jsx', react: 'jsx', svg: 'svg', md: 'md', markdown: 'md' }[a.type] || 'txt';
  const blob = new Blob([a.code], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = a.title.replace(/\s+/g, '_') + '.' + ext;
  link.click();
  URL.revokeObjectURL(url);
}
