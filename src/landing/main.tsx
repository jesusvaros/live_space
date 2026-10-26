import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';
import FestivalLanding from './pages/FestivalLanding';

import '../index.css';

// Entry of the public site (site.html, built by vite.site.config.ts). It has
// no app inside: only the landing and the festival landings. Concert, venue
// and artist pages are static HTML from the prerender and never load this.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/festival/:slug" element={<FestivalLanding />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
