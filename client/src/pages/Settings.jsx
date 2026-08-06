import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Btn, Field, Header, Input, Select } from '../components/ui.jsx';

export default function Settings() {
  const navigate = useNavigate();
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [geminiModel, setGeminiModel] = useState('gemini-2.0-flash');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const timers = useRef([]);

  useEffect(() => {
    api.get('/settings').then((s) => {
      setGeminiConfigured(Boolean(s.geminiConfigured));
      if (s.geminiModel) setGeminiModel(s.geminiModel);
    }).catch(() => {});
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const flash = (setter, value) => {
    setter(value);
    timers.current.push(setTimeout(() => setter(''), 2000));
  };

  const save = async () => {
    try {
      const body = { geminiModel };
      if (geminiApiKey.trim()) body.geminiApiKey = geminiApiKey.trim();
      await api.put('/settings', body);
      setGeminiConfigured(true);
      setGeminiApiKey('');
      setError('');
      flash(setSaved, true);
    } catch (e) {
      setError(e.message || 'Falha ao salvar configurações.');
    }
  };

  const removeKey = async () => {
    try {
      await api.del('/settings?key=geminiApiKey');
      setGeminiConfigured(false);
      setError('');
      flash(setSaved, true);
    } catch (e) {
      setError(e.message || 'Falha ao remover a chave.');
    }
  };

  return (
    <div>
      <Header title="Configurações" />

      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="highlight">
          Obtenha sua chave gratuitamente em{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>.
          A chave fica salva apenas no servidor e nunca é devolvida ao navegador.
        </div>

        <Field label="Chave da API Gemini">
          <Input type="password" value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)}
            placeholder={geminiConfigured ? 'Chave já configurada (deixe em branco para manter)' : 'AIza...'}
            autoComplete="off" />
        </Field>
        {geminiConfigured && (
          <div className="muted small">
            Chave configurada. Para substituí-la, digite a nova chave acima e salve.
          </div>
        )}
        <Field label="Modelo">
          <Select value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)}>
            {['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'].map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>

        <div className="row-actions mt">
          <Btn onClick={save}>Salvar configurações</Btn>
          {geminiConfigured && <Btn className="ghost danger" onClick={removeKey}>Remover chave</Btn>}
          <Btn className="ghost" onClick={() => navigate(-1)}>Voltar</Btn>
        </div>
        {error && <div className="highlight" style={{ background: '#fdecec', borderColor: '#fca5a5' }}>{error}</div>}
        {saved && <div className="highlight" style={{ background: '#e8f7ee', borderColor: '#86efac' }}>Configurações salvas.</div>}
      </div>
    </div>
  );
}
