// IndexedDB wrapper for OllaForge
const DB_NAME = 'ollaforge';
const DB_VER = 4;
let db;

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('conversations')) d.createObjectStore('conversations', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('artifacts')) d.createObjectStore('artifacts', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'k' });
      if (!d.objectStoreNames.contains('memories')) d.createObjectStore('memories', { keyPath: 'id' });
    };
    req.onsuccess = () => { db = req.result; resolve(); };
    req.onerror = () => reject(req.error);
  });
}

export function dbGetAll(store) {
  return new Promise(r => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => r(req.result);
  });
}

export function dbGet(store, key) {
  return new Promise(r => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => r(req.result);
  });
}

export function dbPut(store, val) {
  return new Promise(r => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(val);
    tx.oncomplete = r;
  });
}

export function dbDel(store, key) {
  return new Promise(r => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = r;
  });
}
