const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { isImage } = require('../attachments');

// Anexos de tarefa que entram como texto (conteúdo analisável pela IA).
const TEXT_EXT = new Set(['txt', 'md', 'log', 'json', 'csv', 'html', 'xml']);
const MAX_TEXT_CHARS = 40_000;          // por anexo de texto
const MAX_IMG_BYTES = 8 * 1024 * 1024;   // por imagem (inline_data)
const MAX_TOTAL_INLINE = 15 * 1024 * 1024; // total de imagens enviadas ao Gemini

const MIME_BY_EXT = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp'
};

/**
 * Monta as partes extras do prompt a partir dos anexos da tarefa:
 *  - imagens → inline_data (base64)
 *  - texto (txt/md/json/csv/log/html/xml) → conteúdo como text
 *  - outros (pdf/zip) → apenas a menção do nome
 */
function attachmentParts(db, taskId) {
  const rows = db.prepare('SELECT * FROM task_attachments WHERE task_id=? ORDER BY id').all(taskId);
  const parts = [];
  const names = [];
  let inlineBytes = 0;
  for (const a of rows) {
    const abs = path.join(path.resolve(db.attachmentsDir()), path.basename(a.path));
    if (!fs.existsSync(abs)) continue;
    names.push(a.filename);
    const ext = path.extname(a.filename).replace('.', '').toLowerCase();
    if (isImage(abs)) {
      try {
        const buf = fs.readFileSync(abs);
        if (buf.length <= MAX_IMG_BYTES && inlineBytes + buf.length <= MAX_TOTAL_INLINE) {
          inlineBytes += buf.length;
          parts.push({ inline_data: { mime_type: a.mime || MIME_BY_EXT[ext] || 'image/png', data: buf.toString('base64') } });
          continue;
        }
      } catch { /* segue para a menção */ }
    }
    if (TEXT_EXT.has(ext)) {
      try {
        const text = fs.readFileSync(abs, 'utf8').slice(0, MAX_TEXT_CHARS);
        parts.push({ text: `=== Anexo: ${a.filename} ===\n${text}` });
        continue;
      } catch { /* segue para a menção */ }
    }
    parts.push({ text: `(anexo não-textual: ${a.filename})` });
  }
  return { parts, names };
}

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
    const { prompt, taskId } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Prompt é obrigatório.' });

    const apiKey = process.env.GEMINI_API_KEY || getSetting('geminiApiKey');
    if (!apiKey) {
      return res.status(400).json({
        error: 'Chave da API Gemini não configurada. Abra Configurações e adicione sua chave.'
      });
    }
    const model = getSetting('geminiModel') || 'gemini-2.0-flash';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    // Materiais anexados à tarefa entram como partes extras do prompt (texto/imagem).
    const extra = taskId ? attachmentParts(db, Number(taskId)) : { parts: [], names: [] };
    const parts = [{ text: prompt }];
    if (extra.names.length) {
      parts.push({
        text: `Materiais anexados à tarefa (${extra.names.length}): ${extra.names.join(', ')}. ` +
          'Analise os arquivos e imagens abaixo e use as informações deles para enriquecer a resposta.'
      });
      parts.push(...extra.parts);
    }
    const body = {
      contents: [{ parts }],
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

module.exports.attachmentParts = attachmentParts;
