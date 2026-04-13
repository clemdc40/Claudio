// File reading utilities — PDF, DOCX, XLSX, ZIP, images, text
export async function readFile(f) {
  const name = f.name;
  const lower = name.toLowerCase();
  const size = f.size;

  // Images
  if (f.type.startsWith('image/')) {
    const b64 = await new Promise(r => {
      const reader = new FileReader();
      reader.onload = () => r(reader.result.split(',')[1]);
      reader.readAsDataURL(f);
    });
    return { kind: 'image', name, size, type: f.type, b64 };
  }

  // PDF (lazy-loaded)
  if (lower.endsWith('.pdf')) {
    const pdfjsLib = await loadPdfJs();
    const buf = await f.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      text += tc.items.map(x => x.str).join(' ') + '\n\n';
    }
    return { kind: 'text', name, size, type: f.type, text };
  }

  // DOCX (lazy-loaded)
  if (lower.endsWith('.docx')) {
    const mammoth = await loadMammoth();
    const buf = await f.arrayBuffer();
    const r = await mammoth.extractRawText({ arrayBuffer: buf });
    return { kind: 'text', name, size, type: f.type, text: r.value };
  }

  // XLSX / XLS / CSV
  if (/\.(xlsx|xls|csv|tsv)$/i.test(lower)) {
    const XLSX = await loadXLSX();
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    let text = '';
    wb.SheetNames.forEach(n => {
      text += `# Sheet: ${n}\n`;
      text += XLSX.utils.sheet_to_csv(wb.Sheets[n]) + '\n\n';
    });
    return { kind: 'text', name, size, type: f.type, text };
  }

  // ZIP (lazy-loaded)
  if (lower.endsWith('.zip')) {
    const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js')).default;
    const zip = await JSZip.loadAsync(f);
    let text = '';
    const files = Object.keys(zip.files).filter(k => !zip.files[k].dir).slice(0, 40);
    for (const fn of files) {
      if (/\.(png|jpg|gif|webp|pdf|zip|exe|bin)$/i.test(fn)) continue;
      try {
        const c = await zip.files[fn].async('string');
        text += `=== ${fn} ===\n${c.slice(0, 8000)}\n\n`;
      } catch { /* skip */ }
    }
    return { kind: 'text', name, size, type: f.type, text };
  }

  // Plain text / code
  const text = await f.text();
  return { kind: 'text', name, size, type: f.type, text };
}

// Lazy-load heavy libraries
let _pdfjsLib, _mammoth, _XLSX;

async function loadPdfJs() {
  if (_pdfjsLib) return _pdfjsLib;
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  _pdfjsLib = window.pdfjsLib;
  return _pdfjsLib;
}

async function loadMammoth() {
  if (_mammoth) return _mammoth;
  await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
  _mammoth = window.mammoth;
  return _mammoth;
}

async function loadXLSX() {
  if (_XLSX) return _XLSX;
  await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  _XLSX = window.XLSX;
  return _XLSX;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
