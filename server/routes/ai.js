const express = require('express');

function extractJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch { /* continua */ }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* continua */ }
  }
  return null;
}

module.exports = (db) => {
  const router = express.Router();

  const getSetting = (key) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : '';
  };

  router.post('/generate', async (req, res) => {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Prompt é obrigatório.' });

    const apiKey = getSetting('geminiApiKey');
    if (!apiKey) {
      return res.status(400).json({
        error: 'Chave da API Gemini não configurada. Abra Configurações e adicione sua chave.'
      });
    }
    const model = getSetting('geminiModel') || 'gemini-2.0-flash';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    };

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      if (!resp.ok) {
        const msg = data?.error?.message || `HTTP ${resp.status}`;
        return res.status(502).json({ error: `Erro do Gemini: ${msg}` });
      }
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const content = extractJson(text);
      if (!content) {
        return res.status(502).json({ error: 'Não foi possível interpretar o JSON retornado pela IA.' });
      }
      res.json({ content });
    } catch (err) {
      res.status(502).json({ error: 'Falha ao chamar a API do Gemini: ' + err.message });
    }
  });

  return router;
};
