import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api';
import { clearSession, getStoredUser, getToken, type AuthUser } from './auth';
import { CompaniesPage } from './pages/CompaniesPage';
import { CompanyModulesPage } from './pages/CompanyModulesPage';
import { LoginPage } from './pages/LoginPage';
import { MenuPage } from './pages/MenuPage';

export function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [checking, setChecking] = useState(() => !!getToken());
  const location = useLocation();

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    void api
      .me()
      .then((r) => {
        if (!cancelled) {
          if (r.user.role !== 'admin') {
            clearSession();
            setUser(null);
          } else setUser(r.user);
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearSession();
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) return <div className="boot">Verificando sesión…</div>;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage user={null} onLogin={setUser} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          OPTI<span>CLEAN</span> <em>Admin</em>
        </div>
        <nav>
          <Link className={location.pathname === '/' ? 'active' : ''} to="/">
            Empresas
          </Link>
          <Link className={location.pathname.startsWith('/menu') ? 'active' : ''} to="/menu">
            Menú BD
          </Link>
        </nav>
        <div className="side-foot">
          <strong>{user.name}</strong>
          <small>{user.email}</small>
          <button
            type="button"
            onClick={() => {
              clearSession();
              setUser(null);
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<CompaniesPage />} />
          <Route path="/empresas/:id" element={<CompanyModulesPage />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
