/* Freebooter save module — single-slot durable save + one-tap iCloud backup/restore.
   Reusable across apps: FBSave.init(appId), .save(state), .load(), .meta(), .backup(state), .restore()
   Storage: IndexedDB (durable, persist()-flagged). Backup: Web Share (Save to Files/iCloud) with download fallback. */
(function (global) {
  const DB = 'freebooter', STORE = 'kv', KEY = 'save:current';
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function put(v) {
    const db = await idb();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(v, KEY);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  }
  async function get() {
    const db = await idb();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readonly');
      const rq = t.objectStore(STORE).get(KEY);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => rej(rq.error);
    });
  }

  const FBSave = {
    appId: 'app',
    persisted: false,
    async init(appId) {
      this.appId = appId || 'app';
      try { if (navigator.storage && navigator.storage.persist) this.persisted = await navigator.storage.persist(); }
      catch (_) { this.persisted = false; }
      return this;
    },
    // single slot: every save overwrites the previous
    async save(state) {
      const doc = { appId: this.appId, schema: 1, updatedAt: new Date().toISOString(), state };
      await put(doc);
      return doc.updatedAt;
    },
    async load() { const d = await get(); return d ? d.state : null; },
    async meta() { const d = await get(); return d ? { updatedAt: d.updatedAt } : null; },
    // durable off-device copy: share to Files/iCloud (fallback: download)
    async backup(state) {
      const doc = { appId: this.appId, schema: 1, updatedAt: new Date().toISOString(), state };
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const file = new File([blob], `${this.appId}-save.json`, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `${this.appId} backup` });
        return 'shared';
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      return 'downloaded';
    },
    // restore from a picked backup file
    restore() {
      return new Promise((resolve, reject) => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'application/json,.json';
        inp.onchange = () => {
          const f = inp.files && inp.files[0];
          if (!f) return reject(new Error('no file'));
          const fr = new FileReader();
          fr.onload = () => { try { const doc = JSON.parse(fr.result); resolve(doc && doc.state != null ? doc.state : doc); } catch (e) { reject(e); } };
          fr.onerror = () => reject(fr.error);
          fr.readAsText(f);
        };
        inp.click();
      });
    }
  };
  global.FBSave = FBSave;
})(window);
