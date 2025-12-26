// src/pages/Workspace.tsx
import React from 'react';
import Header from '../../../components/Header';

import Footer from '../../../components/Footer';

export default function Workspace() {
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <Header />
      </header>

      <main className="app-shell__main">
        <div className="workspace-main">
          <p className="workspace-placeholder">
            Workspace в разработке…
          </p>
        </div>
      </main>

      <footer className="app-shell__footer">
        <Footer />
      </footer>
    </div>
  );
}
