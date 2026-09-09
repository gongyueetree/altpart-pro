/* Display translation store. Original API responses, input values and CAD bytes are untouched. */
(function(root) {
  function createI18n({ messages = {}, fetcher, storage, document: doc, initialLanguage } = {}) {
    const han = /[\u3400-\u9fff]/;
    const normalize = s => s.trim().replace(/\s+/g, ' ');
    const dictionary = new Map(Object.entries(messages).map(([k,v]) => [normalize(k),v.trim()]));
    let language = initialLanguage === 'en' ? 'en' : 'zh';
    try { if (!initialLanguage && storage?.getItem('partbridge.language') === 'en') language = 'en'; } catch {}
    let revision = 0, timer = null, working = false;
    const listeners = new Set(), cache = new Map(), failures = new Set(), queue = new Set(), inFlight = new Set();
    const notify = () => { revision++; listeners.forEach(fn => fn()); };
    const updateDocument = () => {
      if (!doc) return;
      doc.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
      doc.title = language === 'en' ? 'PartBridge · Component search, design resources & alternatives' : '元件通 · PartBridge · 元器件查询与设计资源';
    };
    updateDocument();
    function local(text) {
      if (typeof text !== 'string' || !han.test(text)) return text;
      const value = dictionary.get(normalize(text));
      return value === undefined ? null : text.match(/^\s*/)[0] + value + text.match(/\s*$/)[0];
    }
    function read(text) {
      if (language !== 'en') return text;
      return local(text) ?? cache.get(text) ?? (failures.has(text) ? text : 'Translating…');
    }
    function schedule(text) {
      if (language !== 'en' || local(text) !== null || cache.has(text) || failures.has(text) || inFlight.has(text)) return;
      if (text.length > 2048) { failures.add(text); notify(); return; }
      queue.add(text);
      if (!timer && !working) timer = setTimeout(flush, 40);
    }
    async function flush() {
      timer = null;
      if (working || !queue.size || language !== 'en') return;
      working = true;
      try {
        while (queue.size && language === 'en') {
          const batch = []; let size = 0;
          for (const text of queue) {
            if (batch.length === 32 || size + text.length > 12000) break;
            batch.push(text); size += text.length;
          }
          batch.forEach(text => { queue.delete(text); inFlight.add(text); });
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 55000);
          try {
            const response = await fetcher('/api/v2/translate', { method: 'POST',
              headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
              signal: controller.signal, body: JSON.stringify({ targetLanguage: 'en', texts: batch }) });
            if (!response.ok) throw new Error('Translation unavailable');
            const data = await response.json();
            if (!data.success || data.translations?.length !== batch.length) throw new Error('Invalid translation response');
            batch.forEach((text, i) => {
              const value = data.translations[i];
              if (typeof value?.text === 'string' && !han.test(value.text) && value.status !== 'unavailable') cache.set(text, value.text);
              else failures.add(text);
            });
            while (cache.size > 2000) cache.delete(cache.keys().next().value);
          } catch {
            batch.forEach(text => failures.add(text));
            // Do not amplify provider outages into one call per visible label.
            queue.forEach(text => failures.add(text)); queue.clear();
          } finally { clearTimeout(timeout); batch.forEach(text => inFlight.delete(text)); }
          notify();
        }
      } finally { working = false; }
    }
    return {
      hasChinese: text => typeof text === 'string' && han.test(text),
      read, schedule, local,
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      snapshot: () => revision,
      language: () => language,
      failedCount: () => failures.size,
      setLanguage(value) {
        language = value === 'en' ? 'en' : 'zh';
        try { storage?.setItem('partbridge.language', language); } catch {}
        updateDocument(); notify();
        if (language === 'en' && queue.size && !working && !timer) timer = setTimeout(flush, 0);
      },
      retry() { const texts = [...failures]; failures.clear(); texts.forEach(schedule); notify(); },
      async translateAll(texts) {
        if (language !== 'en') return texts;
        texts.forEach(schedule);
        if (timer) { clearTimeout(timer); timer = null; }
        await flush();
        // A rendered label batch may already be in flight.
        while (working || queue.size) {
          if (language !== 'en') throw new Error('Language changed. Export again.');
          await new Promise(resolve => setTimeout(resolve, 30));
          if (!working && queue.size) await flush();
        }
        if (texts.some(text => local(text) === null && !cache.has(text))) throw new Error('Translation unavailable. Please retry the export.');
        return texts.map(text => local(text) ?? cache.get(text));
      },
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createI18n };
  else {
    let storage; try { storage = root.localStorage; } catch {}
    root.PartBridgeI18n = createI18n({ messages: root.PartBridgeMessages, fetcher: root.fetch.bind(root), storage, document: root.document });
  }
})(globalThis);
