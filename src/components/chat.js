// Chat messages component
import { state, SKILLS } from '../lib/state.js';
import { parseContent, highlightCode, renderMath, escapeHtml, fmtBytes } from '../lib/markdown.js';

export function renderWelcome() {
  return `
  <div class="welcome" id="welcome">
    <div class="welcome__header">
      <span class="welcome__sparkle">✸</span>
      <h1 class="welcome__title">Bienvenue, Clement.</h1>
    </div>
    <div class="welcome__subtitle">Ton atelier d'IA locale, propulse par Ollama.</div>
  </div>`;
}

export function renderMessages(conv) {
  if (!conv || !conv.messages.length) return renderWelcome();

  let html = '<div class="messages__inner">';
  conv.messages.forEach((m, i) => {
    html += renderMessage(m, i);
  });
  html += '</div>';
  return html;
}

function splitSearchCardHtml(html) {
  if (!html || !html.includes('search-anim')) return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const searchEl = tmp.querySelector('.search-anim');
  if (!searchEl) return null;

  const nodeToHtml = (node) => {
    if (node.nodeType === 3) return node.textContent || '';
    const wrap = document.createElement('div');
    wrap.appendChild(node.cloneNode(true));
    return wrap.innerHTML;
  };

  let before = '';
  let after = '';
  let seenSearch = false;
  Array.from(tmp.childNodes).forEach(node => {
    if (node === searchEl) {
      seenSearch = true;
      return;
    }
    if (!seenSearch) before += nodeToHtml(node);
    else after += nodeToHtml(node);
  });

  return {
    before,
    search: searchEl.outerHTML,
    after
  };
}

export function renderMessage(m, idx) {
  const isUser = m.role === 'user';
  let contentHtml = '';

  if (m.attachments?.length) {
    contentHtml += '<div class="msg__attachments">';
    contentHtml += m.attachments.map(a => `
      <span class="msg__file">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        ${escapeHtml(a.name)} <span class="msg__file-size">${fmtBytes(a.size)}</span>
      </span>
    `).join('');
    contentHtml += '</div>';
  }

  const thinkingBefore = m.thinkingBefore || m.thinking || '';
  const thinkingAfter = m.thinkingAfter || '';

  if (thinkingBefore) {
    contentHtml += renderThinkingBlock(thinkingBefore, false);
  } else if (m._isStreaming && !m.content) {
    contentHtml += `<div class="msg__loading"><span class="msg__loading-dots"><span></span><span></span><span></span></span></div>`;
  }

  const parsed = parseContent(m.content || '');
  const segmented = thinkingAfter ? splitSearchCardHtml(parsed.html) : null;
  if (segmented) {
    contentHtml += segmented.before;
    contentHtml += segmented.search;
    contentHtml += renderThinkingBlock(thinkingAfter, false);
    contentHtml += segmented.after;
  } else {
    contentHtml += parsed.html;
    if (thinkingAfter) {
      contentHtml += renderThinkingBlock(thinkingAfter, false);
    }
  }

  if (parsed.artifacts && parsed.artifacts.length) {
    parsed.artifacts.forEach((a, i) => {
      let cardHtml;
      if (m._isStreaming && !a.complete) {
        cardHtml = `
          <div class="artifact-card artifact-card--streaming">
            <div class="artifact-card__head">
              <div class="artifact-card__icon artifact-card__icon--spin"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div>
              <div class="artifact-card__info">
                <div class="artifact-card__title">Creation de ${escapeHtml(a.title)}...</div>
                <div class="artifact-card__meta">${a.type.toUpperCase()}</div>
              </div>
            </div>
          </div>`;
      } else {
        cardHtml = renderArtifactCard(a);
      }
      contentHtml = contentHtml.replace(`<div class="artifact-placeholder" data-index="${i}"></div>`, cardHtml);
    });
  }

  return `
  <div class="msg ${isUser ? 'msg--user' : 'msg--assistant'}" data-idx="${idx}">
    <div class="msg__body">
      <div class="msg__content">${contentHtml}</div>
      <div class="msg__actions">
        <button onclick="window.__copyMessage(${idx})" title="Copier">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        ${!isUser ? `
        <button onclick="window.__regenerate(${idx})" title="Regenerer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M3 21v-5h5"/></svg>
        </button>` : ''}
        ${isUser ? `
        <button onclick="window.__editMessage(${idx})" title="Editer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>` : ''}
      </div>
    </div>
  </div>`;
}

export function renderThinkingBlock(thinking, active) {
  if (!thinking && !active) return '';
  const label = active ? 'Reflexion en cours...' : 'Afficher le raisonnement';
  return `
  <div class="thinking ${active ? 'thinking--active thinking--open' : ''}" data-thinking>
    <div class="thinking__head" onclick="this.parentElement.classList.toggle('thinking--open')">
      <svg class="thinking__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      <span class="thinking__label">${label}</span>
      ${active ? '<span class="thinking__preview"></span>' : ''}
    </div>
    <div class="thinking__body">${escapeHtml(thinking || '')}</div>
  </div>`;
}

export function renderArtifactCard(a) {
  const data = JSON.stringify(a).replace(/"/g, '&quot;');
  return `
  <div class="artifact-card" onclick="window.__openArtifactFromCard(this)" data-artifact="${data}">
    <div class="artifact-card__head">
      <div class="artifact-card__icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
      </div>
      <div class="artifact-card__info">
        <div class="artifact-card__title">${escapeHtml(a.title)}</div>
        <div class="artifact-card__meta">${a.type.toUpperCase()} · ${a.code.length} caracteres</div>
      </div>
      <svg class="artifact-card__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18l6-6-6-6"/></svg>
    </div>
  </div>`;
}

export function createStreamingMessage(container) {
  const msg = document.createElement('div');
  msg.className = 'msg msg--assistant';
  const loadingText = state.think === false ? 'Generation' : 'Reflexion';
  msg.innerHTML = `
    <div class="msg__body">
      <div class="msg__content">
        <div class="msg__loading">
          <span class="msg__loading-text">${loadingText}</span>
          <span class="msg__loading-dots"><span></span><span></span><span></span></span>
        </div>
      </div>
    </div>`;
  container.appendChild(msg);
  return msg;
}

export function updateStreamingMessage(msgEl, thinking, content, isStreaming) {
  const body = msgEl.querySelector('.msg__content');
  if (!body) return;

  const thinkPayload = (thinking && typeof thinking === 'object')
    ? { before: thinking.before || '', after: thinking.after || '', phase: thinking.phase || '' }
    : { before: String(thinking || ''), after: '', phase: 'before' };
  function makeThinkBlock() {
    const block = document.createElement('div');
    block.className = 'thinking';
    block.style.display = 'none';
    block.innerHTML = `
      <div class="thinking__head">
        <svg class="thinking__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        <span class="thinking__label">Reflexion en cours...</span>
        <span class="thinking__preview"></span>
      </div>
      <div class="thinking__body"></div>`;
    block.querySelector('.thinking__head').addEventListener('click', () => {
      block.classList.toggle('thinking--open');
      block._userToggled = true;
    });
    block._body = block.querySelector('.thinking__body');
    block._preview = block.querySelector('.thinking__preview');
    return block;
  }

  if (!body._streamReady) {
    body.innerHTML = '';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'stream-content';
    const searchSlot = document.createElement('div');
    searchSlot.className = 'stream-content__search';
    const textSlot = document.createElement('div');
    textSlot.className = 'stream-content__text';
    const thinkBefore = makeThinkBlock();
    const thinkAfter = makeThinkBlock();

    body.appendChild(thinkBefore);
    contentDiv.appendChild(searchSlot);
    contentDiv.appendChild(textSlot);
    body.appendChild(contentDiv);
    body.appendChild(thinkAfter);
    body._streamReady = true;
    body._contentDiv = contentDiv;
    body._searchSlot = searchSlot;
    body._textSlot = textSlot;
    body._thinkBefore = thinkBefore;
    body._thinkAfter = thinkAfter;
  }

  const setThinkVisual = (block, text, active) => {
    const hasText = Boolean(text);
    block.style.display = (hasText || active) ? '' : 'none';
    if (hasText) {
      block._body.innerHTML = parseContent(text).html;
      const lastLine = text.trim().split('\n').pop() || '';
      block._preview.textContent = lastLine.slice(-80);
    } else {
      block._body.innerHTML = '<em>En attente du raisonnement...</em>';
      block._preview.textContent = '';
    }
    block.classList.toggle('thinking--active', active);
    if (active && !block._userToggled) {
      block.classList.add('thinking--open');
      block.querySelector('.thinking__label').textContent = 'Reflexion en cours...';
    } else {
      if (!block._userToggled) block.classList.remove('thinking--open');
      block.querySelector('.thinking__label').textContent = 'Afficher le raisonnement';
      block._preview.textContent = '';
    }
  };

  const activeBefore = isStreaming && thinkPayload.phase !== 'after';
  const activeAfter = isStreaming && thinkPayload.phase === 'after';
  setThinkVisual(body._thinkBefore, thinkPayload.before, activeBefore);
  setThinkVisual(body._thinkAfter, thinkPayload.after, activeAfter);

  if (content) {
    if (isStreaming) {
      if (!body._textSlot._fastMode) {
        body._textSlot._fastMode = true;
        body._textSlot.classList.add('stream-content--raw');
      }
      const parsed = parseContent(content);
      const searchCardMatch = parsed.html.includes('search-anim');
      if (searchCardMatch) {
        const tmp = document.createElement('div');
        tmp.innerHTML = parsed.html;
        const nextSearchEl = tmp.querySelector('.search-anim');
        const nextSearchHtml = nextSearchEl ? nextSearchEl.outerHTML : '';
        if (nextSearchHtml !== (body._searchSlot._lastHtml || '')) {
          body._searchSlot.innerHTML = nextSearchHtml;
          body._searchSlot._lastHtml = nextSearchHtml;
        }
        if (nextSearchEl) nextSearchEl.remove();
        const restHtml = tmp.innerHTML;
        if (restHtml !== (body._textSlot._lastHtml || '')) {
          body._textSlot.innerHTML = restHtml;
          body._textSlot._lastHtml = restHtml;
        }
      } else {
        if (body._searchSlot._lastHtml) {
          body._searchSlot.innerHTML = '';
          body._searchSlot._lastHtml = '';
        }
        if (parsed.html !== (body._textSlot._lastHtml || '')) {
          body._textSlot.innerHTML = parsed.html;
          body._textSlot._lastHtml = parsed.html;
        }
      }

      body._textSlot.querySelectorAll('.artifact-placeholder').forEach(ph => {
        const a = parsed.artifacts[ph.dataset.index];
        if (!a) return;
        if (!a.complete) {
          ph.className = 'artifact-card artifact-card--streaming';
          ph.innerHTML = `
            <div class="artifact-card__head">
              <div class="artifact-card__icon artifact-card__icon--spin"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div>
              <div class="artifact-card__info">
                <div class="artifact-card__title">Creation de ${escapeHtml(a.title)}...</div>
                <div class="artifact-card__meta">${a.type.toUpperCase()}</div>
              </div>
            </div>`;
          if (window.__activeStreamingArtifactIndex !== ph.dataset.index) {
            window.__activeStreamingArtifactIndex = ph.dataset.index;
            window.__openArtifact(a);
          } else {
            import('./canvas.js').then(m => m.updateCanvasContent(a.code));
          }
        } else {
          ph.outerHTML = renderArtifactCard(a);
          window.__activeStreamingArtifactIndex = null;
        }
      });
    } else {
      window.__activeStreamingArtifactIndex = null;
      body._textSlot._fastMode = false;
      body._textSlot.classList.remove('stream-content--raw');
      const parsed = parseContent(content);
      let finalHtml = parsed.html;
      if (parsed.artifacts && parsed.artifacts.length) {
        parsed.artifacts.forEach((a, i) => {
          finalHtml = finalHtml.replace(`<div class="artifact-placeholder" data-index="${i}"></div>`, renderArtifactCard(a));
        });
      }
      body._contentDiv.innerHTML = finalHtml;
      highlightCode(body._contentDiv);
      renderMath(body._contentDiv);
    }
  }

  const hasSearchCard = Boolean(body._contentDiv.querySelector('.search-anim'));
  if (hasSearchCard) {
    body.classList.add('msg__content--searching');
    if (body.firstElementChild !== body._thinkBefore) {
      body.insertBefore(body._thinkBefore, body._contentDiv);
    }
    const searchEl = body._contentDiv.querySelector('.search-anim');
    if (searchEl) {
      searchEl.insertAdjacentElement('afterend', body._thinkAfter);
    } else if (body._contentDiv.nextElementSibling !== body._thinkAfter) {
      body.appendChild(body._thinkAfter);
    }
  } else {
    body.classList.remove('msg__content--searching');
    if (body.firstElementChild !== body._thinkBefore) {
      body.insertBefore(body._thinkBefore, body._contentDiv);
    }
    if (body._contentDiv.nextElementSibling !== body._thinkAfter) {
      body.appendChild(body._thinkAfter);
    }
  }
}
