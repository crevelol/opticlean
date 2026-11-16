import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { AppRoutes } from './app/routes';
import { AuthProvider } from './shared/hooks/AuthProvider';
import { AppStateProvider } from './shared/hooks/AppStateProvider';
import { transition } from './shared/motion/presets';
import './styles/tokens.css';
import './styles/global.css';
import './styles/layout.css';
import './styles/warehouse-designer.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user": respeta la preferencia del sistema operativo */}
    <MotionConfig reducedMotion="user" transition={transition.base}>
      <BrowserRouter>
        <AuthProvider>
          <AppStateProvider>
            <AppRoutes />
          </AppStateProvider>
        </AuthProvider>
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);
