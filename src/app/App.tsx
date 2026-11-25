import React from 'react';
import { AppProviders } from './providers/AppProviders';
import { AppLayout } from './layouts/AppLayout';
import { AppRouter } from './router/AppRouter';

export const App: React.FC = () => {
  return (
    <AppProviders>
      <AppLayout>
        <AppRouter />
      </AppLayout>
    </AppProviders>
  );
};
