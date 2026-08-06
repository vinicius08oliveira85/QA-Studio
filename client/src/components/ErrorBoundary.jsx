import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ui]', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boot">
        <h2>Algo quebrou na interface</h2>
        <p className="muted">
          Seus dados continuam salvos no servidor. Recarregue a página; se o erro voltar,
          copie a mensagem abaixo.
        </p>
        <pre className="mono">{this.state.error.message || String(this.state.error)}</pre>
        <button className="btn" onClick={() => window.location.reload()}>Recarregar</button>
      </div>
    );
  }
}
