// Ollama API client
import { state, emit } from './state.js';
import { showToast } from '../components/toast.js';

export async function ollamaFetch(path, opts = {}) {
  return fetch(state.ollamaUrl + path, opts);
}

export async function loadModels(silent = false) {
  try {
    const r = await ollamaFetch('/api/tags');
    if (!r.ok) throw new Error('HTTP ' + r.status);

    const j = await r.json();
    state.models = j.models || [];
    state.ollamaOnline = true;

    if (!state.currentModel && state.models.length) {
      state.currentModel = state.models[0].name;
    }
    if (state.currentModel && !state.models.find(m => m.name === state.currentModel)) {
      state.currentModel = state.models[0]?.name || '';
    }

    localStorage.setItem('currentModel', state.currentModel);
    emit('models-changed');
    emit('status-changed');

    if (!silent) {
      if (state.models.length === 0) {
        showToast('Ollama connecte: aucun modele installe. Ouvre les parametres pour en telecharger un.', 'error');
      } else {
        showToast(`Ollama connecte · ${state.models.length} modele${state.models.length > 1 ? 's' : ''}`, 'success');
      }
    }
    return true;
  } catch (e) {
    state.ollamaOnline = false;
    state.models = [];
    emit('models-changed');
    emit('status-changed');

    if (!silent) {
      showToast(`Ollama hors ligne (${state.ollamaUrl}) - lance "ollama serve"`, 'error');
    }
    return false;
  }
}

export async function deleteModel(name) {
  try {
    await ollamaFetch('/api/delete', { method: 'DELETE', body: JSON.stringify({ name }) });
    showToast(`Supprime: ${name}`, 'success');
    await loadModels(true);
  } catch (e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

export async function pullModel(name, onProgress) {
  try {
    const r = await ollamaFetch('/api/pull', {
      method: 'POST',
      body: JSON.stringify({ name, stream: true })
    });

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value);

      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line);
          const pct = j.completed && j.total ? ((j.completed / j.total) * 100).toFixed(0) + '%' : '';
          onProgress?.(j.status + (pct ? ` ${pct}` : ''));
        } catch {
          // skip malformed line
        }
      }
    }

    showToast(`Modele telecharge: ${name}`, 'success');
    await loadModels(true);
  } catch (e) {
    showToast('Erreur pull: ' + e.message, 'error');
    throw e;
  }
}

export async function streamChat(conv, modelOverride, onThinking, onContent, onDone) {
  state.isGenerating = true;
  state.abortController = new AbortController();
  emit('generating-changed');

  const model = modelOverride || state.currentModel;
  if (!model) {
    showToast('Aucun modele selectionne', 'error');
    state.isGenerating = false;
    emit('generating-changed');
    return;
  }

  // Build messages
  const proj = state.projects.find(p => p.id === conv.projectId);
  const sysParts = [];
  if (proj?.instructions) sysParts.push(proj.instructions);
  if (conv.params.system) sysParts.push(conv.params.system);

  if (state.activeSkill?.system) {
    sysParts.unshift(state.activeSkill.system);
  }

  // Inject persistent memories
  if (state.memories?.length) {
    const memLines = state.memories.map(m => `- ${m.content}`).join('\n');
    sysParts.push(`[Mémoire persistante — informations sur l'utilisateur]\n${memLines}\n[Fin mémoire]\n\nSi tu apprends quelque chose d'important sur l'utilisateur (préférences, infos perso, habitudes), mémorise-le en écrivant : <remember>fait à retenir</remember>`);
  } else {
    sysParts.push(`Si tu apprends quelque chose d'important sur l'utilisateur (préférences, infos perso, habitudes), mémorise-le en écrivant : <remember>fait à retenir</remember>`);
  }

  if (state.webSearchEnabled) {
    sysParts.push(`Tu as accès à internet. Des résultats de recherche web peuvent être inclus dans le contexte — utilise-les pour répondre avec des informations à jour.

Si l'utilisateur partage une URL ou que tu as besoin de lire une page précise, écris UNIQUEMENT cette balise :
<fetch_page>https://url-exacte.com</fetch_page>

Si tu as besoin d'une recherche supplémentaire, écris :
<search>ta requête</search>

Pour la météo d'une ville, écris :
<weather>nom de la ville</weather>`);
  } else {
    sysParts.push(`Pour la météo d'une ville demandée par l'utilisateur, écris : <weather>nom de la ville</weather>`);
  }

  // ask_user hint
  sysParts.push(`Si tu as besoin de plus d'informations de l'utilisateur pour répondre précisément (ex: préférences, contraintes), tu peux proposer des choix rapides en écrivant en fin de message :
<ask_user>Question courte ?|Option A|Option B|Option C</ask_user>`);

  if (state.think === false) {
    sysParts.push('IMPORTANT: Reponds directement sans reflechir a voix haute. N\'utilise AUCUNE balise <think>. Ne commence pas par un "Thinking Process". Fournis uniquement la reponse finale.\n[SYSTEM RULE]: You must provide a direct answer. DO NOT output a <think> block or a thinking process. Skip the reasoning and jump straight to the final answer.');
  }

  const msgs = [];
  if (sysParts.length) msgs.push({ role: 'system', content: sysParts.join('\n\n') });

  for (const m of conv.messages) {
    let content = m.content;
    const images = [];

    if (m._files?.length) {
      for (const f of m._files) {
        if (f.kind === 'image') images.push(f.b64);
        else if (f.text) content = `[Fichier : ${f.name}]\n\n${f.text}\n\n---\n\n` + content;
      }
    }

    const msg = { role: m.role, content };
    if (images.length) msg.images = images;
    msgs.push(msg);
  }

  const body = {
    model,
    messages: msgs,
    stream: true,
    options: {
      temperature: conv.params.temperature,
      top_p: conv.params.top_p,
      top_k: conv.params.top_k,
      repeat_penalty: conv.params.repeat_penalty,
      num_ctx: conv.params.num_ctx,
      num_predict: conv.params.num_predict,
      ...(conv.params.seed !== -1 ? { seed: conv.params.seed } : {})
    }
  };

  const THINK_HEADERS = /^(?:\s*)(?:here'?s?\s+(?:a\s+|the\s+)?thinking\s+process|thinking\s+process|let\s+me\s+think|my\s+thought\s+process|voici\s+ma\s+r[ée]flexion|mon\s+raisonnement)[:\s]*\n/i;
  function splitThink(full) {
    let think = '';
    let content = full;

    content = content.replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, (_, t) => {
      think += t;
      return '';
    });

    const openMatch = content.match(/<think(?:ing)?>([\s\S]*)$/i);
    if (openMatch) {
      think += openMatch[1];
      content = content.slice(0, openMatch.index);
    }

    const headerMatch = content.match(THINK_HEADERS);
    if (headerMatch) {
      const after = content.slice(headerMatch[0].length);
      const transition = after.match(/\n\n(?:#{1,6}\s|(?:Response|Final answer|R[ée]ponse)\s*:?\s*\n|(?=[A-ZÀ-Ÿ][a-zà-ÿ]))/);
      if (transition) {
        think = content.slice(0, headerMatch[0].length + transition.index) + '\n' + think;
        content = after.slice(transition.index).replace(/^(?:Response|Final answer|R[ée]ponse)\s*:?\s*\n/i, '').trimStart();
      }
    }

    return { think: think.trim(), content: content.trimStart() };
  }

  const escHtml = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  function extractSearchPreview(resultsText) {
    const text = String(resultsText || '');
    const items = [];
    const seen = new Set();

    const blockRe = /\*\*([^*]+)\*\*(?:\n(https?:\/\/[^\s]+))?/g;
    let m;
    while ((m = blockRe.exec(text))) {
      const title = (m[1] || '').trim();
      const url = (m[2] || '').trim();
      const key = `${title}|${url}`;
      if (!title || seen.has(key)) continue;
      seen.add(key);
      items.push({ title, url });
      if (items.length >= 8) return items;
    }

    const urlRe = /https?:\/\/[^\s]+/g;
    while ((m = urlRe.exec(text))) {
      const url = (m[0] || '').trim();
      const key = `url|${url}`;
      if (!url || seen.has(key)) continue;
      seen.add(key);
      items.push({ title: url.replace(/^https?:\/\//, ''), url });
      if (items.length >= 8) return items;
    }

    return items;
  }

  function renderSearchCard(query, phase = 'loading', links = [], detail = '') {
    const safeQuery = escHtml(String(query || '').slice(0, 90));
    const status = phase === 'loading'
      ? 'Recherche en cours...'
      : phase === 'done'
        ? `${links.length || 1} source${links.length > 1 ? 's' : ''} trouvee${links.length > 1 ? 's' : ''}`
        : 'Recherche indisponible';

    const safeDetail = detail ? `<div class="search-anim__detail">${escHtml(detail)}</div>` : '';
    const linkRows = links.length
      ? links.map(link => {
          const safeTitle = escHtml(link.title || link.url || 'Source');
          const safeUrl = escHtml(link.url || '');
          const hrefAttr = /^https?:\/\//i.test(link.url || '') ? ` href="${safeUrl}" target="_blank"` : '';
          return `<a class="search-anim__link"${hrefAttr}><span class="search-anim__link-title">${safeTitle}</span>${safeUrl ? `<span class="search-anim__url">${safeUrl}</span>` : ''}</a>`;
        }).join('')
      : [
          '<div class="search-anim__link search-anim__link--ghost">Analyse des pages...</div>',
          '<div class="search-anim__link search-anim__link--ghost">Extraction des sources...</div>',
          '<div class="search-anim__link search-anim__link--ghost">Preparation du contexte...</div>'
        ].join('');
    const hasLoop = links.length > 1;
    const trackClass = hasLoop ? 'search-anim__links-track' : 'search-anim__links-track search-anim__links-track--static';
    const trackRows = hasLoop
      ? `<div class="search-anim__links-group">${linkRows}</div><div class="search-anim__links-group" aria-hidden="true">${linkRows}</div>`
      : `<div class="search-anim__links-group">${linkRows}</div>`;

    return (
      `<div class="search-anim search-anim--${phase}">` +
      `<div class="search-anim__header">` +
      `<span class="search-anim__icon"></span>` +
      `<div class="search-anim__meta">` +
      `<div class="search-anim__title">Recherche web</div>` +
      `<div class="search-anim__query">${safeQuery}</div>` +
      `</div>` +
      `</div>` +
      `<div class="search-anim__bar"><span></span></div>` +
      `<div class="search-anim__status">${status}</div>` +
      `${safeDetail}` +
      `<div class="search-anim__links"><div class="${trackClass}">${trackRows}</div></div>` +
      `</div>`
    );
  }

  let completeContent = '';
  let completeThinkBefore = '';
  let completeThinkAfter = '';
  let lastRaw = '';
  let lastThink = '';
  let lastThinkPhase = 'before';

  // Pre-search: when web mode is ON, always attempt one retrieval.
  if (state.webSearchEnabled) {
    const lastUserContent = (conv.messages[conv.messages.length - 1]?.content || '').trim();

    if (lastUserContent) {
      onContent?.(renderSearchCard(lastUserContent, 'loading') + '\n\n');

      try {
        const { searchWeb } = await import('./web.js');
        const results = await searchWeb(lastUserContent);
        const previewLinks = extractSearchPreview(results);
        const doneCard = renderSearchCard(lastUserContent, 'done', previewLinks);
        completeContent = doneCard + '\n\n';
        onContent?.(completeContent);

        let lastUserIdx = -1;
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'user') {
            lastUserIdx = i;
            break;
          }
        }

        if (lastUserIdx >= 0) {
          msgs[lastUserIdx] = {
            ...msgs[lastUserIdx],
            content: msgs[lastUserIdx].content + '\n\n[Resultats de recherche web]\n' + results + '\n[Fin des resultats - reponds maintenant en te basant sur ces informations recentes]'
          };
        }
      } catch (e) {
        const errCard = renderSearchCard(lastUserContent, 'error', [], e?.message || 'Erreur reseau');
        completeContent = errCard + '\n\n';
        onContent?.(completeContent);
        showToast('Recherche web indisponible: reponse sans sources web.', 'error');
      }
    }
  }

  try {
    for (let iter = 0; iter < 6; iter++) {
      body.messages = msgs;

      const res = await ollamaFetch('/api/chat', {
        method: 'POST',
        signal: state.abortController.signal,
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error('HTTP ' + res.status);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let rawContent = '';
      let thinkContent = '';
      let toolCall = null;
      onThinking?.({
        phase: iter === 0 ? 'before' : 'after',
        before: completeThinkBefore,
        after: completeThinkAfter
      });

      streamLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;

          let j;
          try {
            j = JSON.parse(line);
          } catch {
            continue;
          }

          if (j.message?.thinking) {
            thinkContent += j.message.thinking;
            onThinking?.({
              phase: iter === 0 ? 'before' : 'after',
              before: iter === 0 ? thinkContent : completeThinkBefore,
              after: iter === 0 ? completeThinkAfter : thinkContent
            });
          }

          if (j.message?.content) {
            rawContent += j.message.content;
            const split = splitThink(rawContent);

            if (split.think && !thinkContent) {
              thinkContent = split.think;
              onThinking?.({
                phase: iter === 0 ? 'before' : 'after',
                before: iter === 0 ? thinkContent : completeThinkBefore,
                after: iter === 0 ? completeThinkAfter : thinkContent
              });
            }

            // Tool call detection
            const m1 = state.webSearchEnabled && split.content.match(/<search>([\s\S]*?)<\/search>/i);
            const m2 = !m1 && state.webSearchEnabled && split.content.match(/<fetch_page>([\s\S]*?)<\/fetch_page>/i);
            const m3 = !m1 && !m2 && split.content.match(/<weather>([\s\S]*?)<\/weather>/i);

            if (m1 || m2 || m3) {
              toolCall = m1
                ? { type: 'search', query: m1[1].trim() }
                : m2
                  ? { type: 'fetch_page', url: m2[1].trim() }
                  : { type: 'weather', city: m3[1].trim() };
              reader.cancel();
              break streamLoop;
            }

            onContent?.(completeContent + split.content);
          }
        }
      }

      lastRaw = rawContent;
      lastThink = thinkContent;
      lastThinkPhase = iter === 0 ? 'before' : 'after';

      if (!toolCall) {
        const split = splitThink(rawContent);

        // Extract <remember> tags, save memories, strip from content
        let finalContent = split.content;
        const rememberMatches = [...finalContent.matchAll(/<remember>([\s\S]*?)<\/remember>/gi)];
        if (rememberMatches.length) {
          finalContent = finalContent.replace(/<remember>[\s\S]*?<\/remember>/gi, '').trim();
          for (const match of rememberMatches) {
            const memText = match[1].trim();
            if (memText) {
              const mem = { id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2), content: memText, createdAt: Date.now() };
              state.memories.push(mem);
              import('../lib/db.js').then(m => m.dbPut('memories', mem));
              showToast(`💾 Mémorisé : ${memText.slice(0, 60)}`, 'success');
            }
          }
        }

        completeContent += finalContent;
        const finalThinkForIter = (thinkContent || split.think || '').trim();
        if (finalThinkForIter) {
          if (iter === 0) completeThinkBefore = finalThinkForIter;
          else completeThinkAfter = finalThinkForIter;
        }
        onDone?.(completeContent, {
          before: completeThinkBefore,
          after: completeThinkAfter
        }, model);
        break;
      }

      const split = splitThink(rawContent);
      const cleanContent = split.content
        .replace(/<search>[\s\S]*?<\/search>/gi, '')
        .replace(/<fetch_page>[\s\S]*?<\/fetch_page>/gi, '')
        .replace(/<weather>[\s\S]*?<\/weather>/gi, '')
        .trim();

      if (cleanContent) completeContent += cleanContent + '\n\n';
      const iterThink = (thinkContent || split.think || '').trim();
      if (iterThink) {
        if (iter === 0) completeThinkBefore = iterThink;
        else completeThinkAfter = iterThink;
      }

      const { searchWeb, fetchPage } = await import('./web.js');
      let toolResult = '';
      let toolError = null;

      if (toolCall.type === 'search') {
        onContent?.(completeContent + renderSearchCard(toolCall.query, 'loading') + '\n\n');
      } else if (toolCall.type === 'weather') {
        onContent?.(completeContent + '<span class="tool-call">🌤️ Récupération météo…</span>');
      } else {
        onContent?.(completeContent + '<span class="tool-call">Lecture de la page en cours...</span>');
      }

      try {
        if (toolCall.type === 'search') {
          toolResult = await searchWeb(toolCall.query);
          const previewLinks = extractSearchPreview(toolResult);
          completeContent += renderSearchCard(toolCall.query, 'done', previewLinks) + '\n\n';
          onContent?.(completeContent);
        } else if (toolCall.type === 'weather') {
          const { fetchWeather } = await import('./weather.js');
          const { html, text } = await fetchWeather(toolCall.city);
          completeContent += html + '\n\n';
          onContent?.(completeContent);
          toolResult = text; // text summary injected into model context
        } else {
          toolResult = await fetchPage(toolCall.url);
          onContent?.(completeContent);
        }
      } catch (e) {
        toolError = e;
        if (toolCall.type === 'search') {
          completeContent += renderSearchCard(toolCall.query, 'error', [], e?.message || 'Erreur reseau') + '\n\n';
          onContent?.(completeContent);
        } else {
          onContent?.(completeContent);
        }
        showToast(`Outil indisponible: ${e?.message || 'erreur inconnue'}`, 'error');
      }

      msgs.push({ role: 'assistant', content: rawContent });
      if (toolError) {
        msgs.push({
          role: 'user',
          content: `[RESULTAT D'OUTIL]\n\n[ERREUR OUTIL] ${toolError.message || 'Echec de l outil'}\n\n[FIN RESULTAT - l'outil a echoue. Continue avec les informations disponibles et indique la limite si necessaire.]`
        });
      } else {
        msgs.push({ role: 'user', content: `[RESULTAT D'OUTIL]\n\n${toolResult}\n\n[FIN RESULTAT - reponds maintenant a l'utilisateur]` });
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      const abortThinking = {
        before: completeThinkBefore || (lastThinkPhase === 'before' ? lastThink : ''),
        after: completeThinkAfter || (lastThinkPhase === 'after' ? lastThink : '')
      };
      onDone?.((completeContent || lastRaw || '') + '\n\n_[Arrete]_', abortThinking, model);
    } else {
      onDone?.('**Erreur :** ' + e.message, { before: completeThinkBefore, after: completeThinkAfter }, model);
      showToast('Erreur : ' + e.message, 'error');
    }
  }

  state.isGenerating = false;
  state.abortController = null;
  emit('generating-changed');
}

export function stopGeneration() {
  if (state.abortController) state.abortController.abort();
}
