import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SandboxPage } from './sandbox/SandboxPage';
import { KitTestPage } from './world/KitTestPage';
import { WorldPage } from './world/WorldPage';
import './index.css';

// The city-explore game (map, districts, insides) is the home page; /sandbox is the same city with a
// test panel. /city is the multiplayer walkable city, /sandbox-classic its offline Babylon test bed,
// /kits the asset test scene.
const path = location.pathname;
const page = path.startsWith('/sandbox-classic') ? (
  <SandboxPage />
) : path.startsWith('/sandbox') ? (
  <WorldPage sandbox />
) : path.startsWith('/kits') ? (
  <KitTestPage />
) : path.startsWith('/city') ? (
  <App />
) : (
  <WorldPage />
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>{page}</StrictMode>,
);
