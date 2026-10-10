import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FoundationHarness } from './theme/FoundationHarness';
import { ThemeProvider } from './theme/ThemeProvider';
import { applyRootPreferences, readThemePreferences } from './theme/preferences';
import './styles/app.css';

applyRootPreferences(readThemePreferences());
const root = document.getElementById('root');
if (!root) throw new Error('Missing foundation root');
createRoot(root).render(<StrictMode><ThemeProvider><FoundationHarness /></ThemeProvider></StrictMode>);
