import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App.tsx';

// The service worker gives offline support; it is disabled in the hosted demo build.
if (import.meta.env.VITE_DEMO !== '1') void import('virtual:pwa-register').then((m) => m.registerSW({ immediate: true }));
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
