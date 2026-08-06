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

/** Traduz o status da API do Gemini em uma mensagem acionável para o usuário. */
function geminiErrorMessage(status, model) {
  if (status === 429) {
    return `Cota da API Gemini esgotada para o modelo "${model}". Escolha outro modelo em Configurações (ex.: gemini-2.5-flash) ou tente mais tarde.`;
  }
  if (status === 400 || status === 401 || status === 403) {
    return 'A chave da API Gemini foi recusada. Confira a chave em Configurações ou no arquivo .env.';
  }
  if (status === 404) {
    return `O modelo "${model}" não está disponível para esta chave. Escolha outro em Configurações.`;
  }
  return 'Erro ao chamar a API do Gemini. Tente novamente.';
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

    const apiKey = process.env.GEMINI_API_KEY || getSetting('geminiApiKey');
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
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Number(process.env.GEMINI_TIMEOUT_MS) || 60_000)
      });
      const data = await resp.json();
      if (!resp.ok) {
        const msg = data?.error?.message || `HTTP ${resp.status}`;
        console.error('[gemini]', resp.status, msg);
        return res.status(502).json({ error: geminiErrorMessage(resp.status, model) });
      }
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const content = extractJson(text);
      if (!content) {
        return res.status(502).json({ error: 'Não foi possível interpretar o JSON retornado pela IA.' });
      }
      res.json({ content });
    } catch (err) {
      const aborted = err.name === 'TimeoutError' || /abort/i.test(err?.message || '');
      console.error('[gemini]', aborted ? 'timeout' : (err.message || err));
      res.status(502).json({ error: aborted ? 'A chamada à IA excedeu o tempo limite. Tente novamente.' : 'Falha ao chamar a API do Gemini. Tente novamente.' });
    }
  });

  return router;
};
