import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Btn, Field, Header, Input, Select } from '../components/ui.jsx';

export default function Settings() {
  const navigate = useNavigate();
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-2.0-flash');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/settings').then((s) => {
      if (s.geminiApiKey) setGeminiApiKey(s.geminiApiKey);
      if (s.geminiModel) setGeminiModel(s.geminiModel);
    }).catch(() => {});
  }, []);

  const save = async () => {
    await api.put('/settings', { geminiApiKey, geminiModel });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <Header title="Configurações" subtitle="Chave da API Google Gemini usada pelo recurso 'Gerar com IA'." />

      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="highlight">
          Obtenha sua chave gratuitamente em{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>.
          A chave fica salva apenas no seu banco local (tabela <span className="mono">settings</span>).
        </div>

        <Field label="Chave da API Gemini" required>
          <Input type="password" value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)}
            placeholder="AIza..." autoComplete="off" />
        </Field>
        <Field label="Modelo">
          <Select value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)}>
            {['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'].map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>

        <div className="row-actions mt">
          <Btn onClick={save}>Salvar configurações</Btn>
          <Btn className="ghost" onClick={() => navigate(-1)}>Voltar</Btn>
        </div>
        {saved && <div className="highlight" style={{ background: '#e8f7ee', borderColor: '#86efac' }}>Configurações salvas.</div>}
      </div>
    </div>
  );
}
