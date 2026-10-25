import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SandboxPage } from './sandbox/SandboxPage';
import './index.css';

// /sandbox is the offline Babylon test bed; everything else is the multiplayer game.
const isSandbox = location.pathname.startsWith('/sandbox');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isSandbox ? <SandboxPage /> : <App />}</StrictMode>,
);
