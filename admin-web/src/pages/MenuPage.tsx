import { useEffect, useState } from 'react';
import { api, type MenuItem } from '../api';

export function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    const res = await api.menu();
    setItems(res.items);
  };

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Error'));
  }, []);

  const saveLabel = async (item: MenuItem, label: string) => {
    setError('');
    setMsg('');
    try {
      await api.updateMenu(item.id, { label });
      setMsg(`Menú actualizado: ${label}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Catálogo</div>
          <h1>Menú (base de datos)</h1>
          <p>Los ítems viven en SQLite y se filtran por los módulos de cada empresa.</p>
        </div>
      </header>
      {msg ? <p className="ok">{msg}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <section className="card">
        <table>
          <thead>
            <tr>
              <th>Etiqueta</th>
              <th>Ruta</th>
              <th>Módulo</th>
              <th>Sección</th>
              <th>Orden</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    defaultValue={item.label}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== item.label) {
                        void saveLabel(item, e.target.value.trim());
                      }
                    }}
                  />
                </td>
                <td>
                  <code>{item.path}</code>
                </td>
                <td>
                  {item.module_name}
                  <small>{item.module_code}</small>
                </td>
                <td>{item.section}</td>
                <td>{item.sort_order}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
