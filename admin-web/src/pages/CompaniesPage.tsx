import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Company } from '../api';

export function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await api.companies();
    setCompanies(res.companies);
  };

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Error'));
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.createCompany({ name: name.trim() });
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Tenants</div>
          <h1>Empresas</h1>
          <p>Módulos web, roles móvil y flota de vehículos por empresa.</p>
        </div>
      </header>

      <form className="card create-row" onSubmit={(e) => void create(e)}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre de la nueva empresa"
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Creando…' : 'Crear empresa'}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}

      <div className="card-grid">
        {companies.map((c) => (
          <article key={c.id} className={`company-card ${c.active ? '' : 'is-off'}`}>
            <div>
              <strong>{c.name}</strong>
              <small>
                {c.slug} · {c.modules_count ?? 0} módulos · {c.mobile_roles_count ?? 0} roles móvil ·{' '}
                {c.vehicles_count ?? 0} vehículos
              </small>
            </div>
            <div className="row-actions">
              <span className={`pill ${c.active ? 'on' : 'off'}`}>{c.active ? 'Activa' : 'Inactiva'}</span>
              <Link to={`/empresas/${c.id}`}>Administrar</Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
