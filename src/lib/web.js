// Web tools: DuckDuckGo search + page reader

const PROXIES = [
  url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  url => `https://thingproxy.freeboard.io/fetch/${url}`
];

function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return 'https://' + raw;
}

function decodeDuckDuckGoHref(href) {
  const raw = String(href || '').trim();
  if (!raw) return '';
  try {
    const asUrl = new URL(raw, 'https://duckduckgo.com');
    const uddg = asUrl.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : asUrl.href;
  } catch {
    return raw;
  }
}

function pushResult(results, title, url, snippet) {
  const cleanTitle = String(title || '').replace(/\s+/g, ' ').trim();
  const cleanUrl = String(url || '').trim();
  const cleanSnippet = String(snippet || '').replace(/\s+/g, ' ').trim();
  if (!cleanTitle && !cleanSnippet) return;

  const dedupeKey = `${cleanTitle}\n${cleanUrl}\n${cleanSnippet}`.toLowerCase();
  if (results._seen.has(dedupeKey)) return;

  results._seen.add(dedupeKey);
  results.items.push({
    title: cleanTitle || cleanUrl || 'Resultat',
    url: cleanUrl,
    snippet: cleanSnippet
  });
}

function formatResults(query, results) {
  return `Resultats de recherche pour "${query}" :\n\n` + results
    .slice(0, 8)
    .map(r => `**${r.title}**${r.url ? '\n' + r.url : ''}${r.snippet ? '\n' + r.snippet : ''}`)
    .join('\n\n');
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeQuery(query) {
  const raw = String(query || '').toLowerCase();
  const noAccent = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const words = noAccent.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const stop = new Set([
    'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou', 'pour', 'sur', 'dans',
    'with', 'for', 'the', 'and', 'best', 'meilleur', 'modele', 'model', 'source'
  ]);
  return words.filter(w => w.length > 2 && !stop.has(w)).slice(0, 8).join(' ');
}

async function timedFetch(url, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function collectRelatedTopics(topics, acc) {
  for (const topic of topics || []) {
    if (topic?.Text) {
      acc.push({
        title: topic.Text.split(' - ')[0] || 'Sujet lie',
        url: topic.FirstURL || '',
        snippet: topic.Text
      });
      continue;
    }
    if (Array.isArray(topic?.Topics)) {
      collectRelatedTopics(topic.Topics, acc);
    }
  }
}

async function readerFetch(url, timeout = 14000) {
  const normalized = normalizeUrl(url);
  if (!normalized) throw new Error('URL invalide');

  const readerUrl = 'https://r.jina.ai/http://' + normalized.replace(/^https?:\/\//i, '');
  const res = await timedFetch(readerUrl, timeout);
  if (!res.ok) throw new Error('HTTP ' + res.status);

  const text = await res.text();
  if (!text || text.length < 60) throw new Error('Reponse vide');
  return text;
}

async function proxyFetch(url, timeout = 10000) {
  let lastError;

  for (const proxyFn of PROXIES) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(proxyFn(url), { signal: controller.signal });
      clearTimeout(id);

      if (!res.ok) throw new Error('HTTP ' + res.status);

      const text = await res.text();
      if (!text || text.length < 50) throw new Error('Empty response');

      try {
        const json = JSON.parse(text);
        const content = json.contents || json.body || text;
        return typeof content === 'string' ? content : text;
      } catch {
        return text;
      }
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('All proxies failed');
}

export async function searchWeb(query) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) throw new Error('Requete vide');

  // Strategy 1: DuckDuckGo Instant Answer API
  try {
    const res = await timedFetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(normalizedQuery)}&format=json&no_html=1&skip_disambig=1`,
      8000
    );

    if (res.ok) {
      const data = await res.json();
      const results = { items: [], _seen: new Set() };

      if (data.AbstractText) {
        pushResult(results, data.Heading || normalizedQuery, data.AbstractURL || '', data.AbstractText);
      }

      if (data.Answer) {
        pushResult(results, 'Reponse directe', '', data.Answer);
      }

      const related = [];
      collectRelatedTopics(data.RelatedTopics, related);
      related.forEach(r => pushResult(results, r.title, r.url, r.snippet));

      if (results.items.length > 0) {
        return formatResults(normalizedQuery, results.items);
      }
    }
  } catch {
    // fall through
  }

  // Strategy 2: DuckDuckGo HTML via CORS proxies
  try {
    const html = await proxyFetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(normalizedQuery), 12000);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const results = { items: [], _seen: new Set() };

    doc.querySelectorAll('.result').forEach(el => {
      const titleAnchor = el.querySelector('.result__a, .result__title a, h2 a, h3 a, a.result-link');
      const title = titleAnchor?.textContent?.trim() || el.querySelector('.result__title')?.textContent?.trim();
      const snippet = el.querySelector('.result__snippet')?.textContent?.trim();
      const href = decodeDuckDuckGoHref(titleAnchor?.getAttribute('href') || el.querySelector('.result__url')?.textContent || '');
      pushResult(results, title, href, snippet);
    });

    if (!results.items.length) {
      doc.querySelectorAll('a.result__a, h2 a, h3 a').forEach(a => {
        const title = a.textContent?.trim();
        const href = decodeDuckDuckGoHref(a.getAttribute('href') || '');
        const snippet = a.closest('.result')?.querySelector('.result__snippet')?.textContent?.trim() || '';
        pushResult(results, title, href, snippet);
      });
    }

    if (results.items.length > 0) {
      return formatResults(normalizedQuery, results.items);
    }
  } catch {
    // fall through
  }

  // Strategy 3: DuckDuckGo Lite via proxies
  try {
    const html = await proxyFetch('https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(normalizedQuery), 10000);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const results = { items: [], _seen: new Set() };

    doc.querySelectorAll('a.result-link, td a[href]').forEach(a => {
      const title = a.textContent?.trim();
      const href = decodeDuckDuckGoHref(a.getAttribute('href') || '');
      if (!/^https?:\/\//i.test(href)) return;
      if ((title || '').length < 8) return;
      pushResult(results, title, href, '');
    });

    if (results.items.length > 0) {
      return formatResults(normalizedQuery, results.items);
    }
  } catch {
    // fall through
  }

  // Strategy 4: Wikipedia fallback
  try {
    const res = await timedFetch(
      `https://fr.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(normalizedQuery)}&limit=6&namespace=0&format=json&origin=*`,
      9000
    );

    if (res.ok) {
      const data = await res.json();
      const titles = data?.[1] || [];
      const snippets = data?.[2] || [];
      const links = data?.[3] || [];
      const results = [];

      for (let i = 0; i < titles.length; i++) {
        const title = titles[i] || '';
        const snippet = snippets[i] || '';
        const link = links[i] || '';
        if (title) results.push({ title, url: link, snippet });
      }

      if (results.length) {
        return formatResults(normalizedQuery, results);
      }
    }
  } catch {
    // fall through
  }

  // Strategy 5: Wikipedia full-text search (fr/en) - much more permissive
  try {
    const compact = normalizeQuery(normalizedQuery) || normalizedQuery;
    const variants = [normalizedQuery, compact].filter((v, i, a) => v && a.indexOf(v) === i);
    const aggregate = { items: [], _seen: new Set() };

    for (const lang of ['fr', 'en']) {
      for (const q of variants) {
        const endpoint = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=8&utf8=1&format=json&origin=*`;
        const res = await timedFetch(endpoint, 10000);
        if (!res.ok) continue;
        const data = await res.json();
        const rows = data?.query?.search || [];
        for (const row of rows) {
          const title = row?.title || '';
          if (!title) continue;
          const pageUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
          const snippet = stripHtml(row?.snippet || '');
          pushResult(aggregate, title, pageUrl, snippet);
          if (aggregate.items.length >= 8) {
            return formatResults(normalizedQuery, aggregate.items);
          }
        }
      }
    }

    if (aggregate.items.length > 0) {
      return formatResults(normalizedQuery, aggregate.items);
    }
  } catch {
    // fall through
  }

  // Strategy 6: GitHub repositories fallback (useful for models/code topics)
  try {
    const compact = normalizeQuery(normalizedQuery);
    const ghQueries = [
      compact ? `${compact} open source llm` : '',
      compact ? `${compact} code generation model` : '',
      normalizedQuery
    ].filter((v, i, a) => v && a.indexOf(v) === i);

    const aggregate = { items: [], _seen: new Set() };

    for (const q of ghQueries) {
      const endpoint = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=8`;
      const res = await timedFetch(endpoint, 12000);
      if (!res.ok) continue;
      const data = await res.json();
      const repos = data?.items || [];
      for (const repo of repos) {
        const title = repo?.full_name || repo?.name || '';
        const url = repo?.html_url || '';
        const snippetParts = [
          repo?.description || '',
          typeof repo?.stargazers_count === 'number' ? `Stars: ${repo.stargazers_count}` : ''
        ].filter(Boolean);
        const snippet = snippetParts.join(' · ');
        pushResult(aggregate, title, url, snippet);
        if (aggregate.items.length >= 8) {
          return formatResults(normalizedQuery, aggregate.items);
        }
      }
    }

    if (aggregate.items.length > 0) {
      return formatResults(normalizedQuery, aggregate.items);
    }
  } catch {
    // fall through
  }

  const q = encodeURIComponent(normalizedQuery);
  return formatResults(normalizedQuery, [
    {
      title: 'Recherche DuckDuckGo',
      url: `https://duckduckgo.com/?q=${q}`,
      snippet: 'Ouverture directe de la recherche.'
    },
    {
      title: 'Recherche Google',
      url: `https://www.google.com/search?q=${q}`,
      snippet: 'Ouverture directe de la recherche.'
    },
    {
      title: 'Recherche GitHub',
      url: `https://github.com/search?q=${q}&type=repositories`,
      snippet: 'Ouverture directe des depots lies a la requete.'
    }
  ]);
}

export async function fetchPage(url) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) throw new Error('URL invalide');

  try {
    const html = await proxyFetch(normalizedUrl, 14000);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    for (const sel of ['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'iframe', 'form']) {
      doc.querySelectorAll(sel).forEach(el => el.remove());
    }

    const title = doc.querySelector('title')?.textContent?.trim() || '';
    const main = doc.querySelector('main, article, [role="main"], .content, .post-content, .entry-content, #content, #main') || doc.body;

    function extractText(node) {
      if (!node) return '';
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const tag = node.tagName.toLowerCase();
      if (['script', 'style', 'noscript'].includes(tag)) return '';

      const children = Array.from(node.childNodes).map(extractText).join('');
      const block = ['p', 'div', 'section', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'tr'].includes(tag);
      return block ? children + '\n' : children;
    }

    const raw = extractText(main);
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    if (text.length < 50) throw new Error('Contenu trop court ou vide');

    const excerpt = text.slice(0, 7000);
    return `Titre : ${title}\nURL : ${normalizedUrl}\n\n${excerpt}${text.length > 7000 ? '\n\n[contenu tronque]' : ''}`;
  } catch {
    try {
      const text = await readerFetch(normalizedUrl, 15000);
      const cleaned = text
        .replace(/^Title:\s*/im, 'Titre: ')
        .replace(/^URL Source:\s*/im, 'URL: ')
        .trim();
      const excerpt = cleaned.slice(0, 7000);
      return `${excerpt}${cleaned.length > 7000 ? '\n\n[contenu tronque]' : ''}`;
    } catch (readerError) {
      throw new Error(`Impossible de lire ${normalizedUrl} : ${readerError.message}`);
    }
  }
}
