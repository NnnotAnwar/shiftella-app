import './shared/zodCsp';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { IS_DEMO_BUILD } from '@shared/demoBuild';
import App from './App.tsx';
import './index.css';
import './App.css';

/**
 * --- ENTRY POINT (main.tsx) ---
 * This file is the absolute starting point of the application.
 * It mounts the React app into the HTML 'root' element.
 */

// The public demo (/demo/) routes in the hash, so a reload never needs a server fallback.
const Router = IS_DEMO_BUILD ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 
      Router: Handles URL management (navigation).
      App: Our main component defined in App.tsx.
    */}
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
