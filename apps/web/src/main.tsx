import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { parsePublicEnv } from './app/env';
import { router } from './app/router';
import './styles/app.css';

const publicEnv = parsePublicEnv(import.meta.env);
const queryClient = new QueryClient();
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing React root element');
rootElement.dataset.dataMode = publicEnv.dataMode;

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
