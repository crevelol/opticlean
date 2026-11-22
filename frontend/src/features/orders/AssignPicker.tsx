import { useEffect, useState } from 'react';
import { api, type ManagedUser } from '../../shared/api/client';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import { useAuth } from '../../shared/hooks/AuthProvider';
import type { Order } from '../../shared/types';
import { Tooltip } from '../../shared/components/Tooltip';

type Props = {
  order: Order;
  compact?: boolean;
};

export function AssignPicker({ order, compact }: Props) {
  const { user } = useAuth();
  const { applyResponse, toast } = useAppState();
  const [bodegueros, setBodegueros] = useState<ManagedUser[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    let cancelled = false;
    void api
      .listUsers({ role: 'ops', activeOnly: true })
      .then((res) => {
        if (!cancelled) setBodegueros(res.users);
      })
      .catch(() => {
        /* silencioso: el select queda vacío */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  if (user?.role !== 'admin') {
    if (!order.assignedToName) return null;
    return (
      <Tooltip content={"Asignado a"}><span className="assign-chip">
        {order.assignedToName}
      </span></Tooltip>
    );
  }

  if (order.status !== 'Por preparar') {
    return order.assignedToName ? (
      <span className="assign-chip">{order.assignedToName}</span>
    ) : null;
  }

  async function onChange(userId: string) {
    setBusy(true);
    try {
      if (!userId) {
        applyResponse(await api.unassignOrder(order.id));
        toast('Asignación quitada.');
      } else {
        applyResponse(await api.assignOrder(order.id, userId));
        const name = bodegueros.find((b) => b.id === userId)?.name ?? 'bodeguero';
        toast(`Asignado a ${name}.`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo asignar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className={compact ? 'assign-picker is-compact' : 'assign-picker'}>
      {!compact ? <span>Asignar a</span> : null}
      <select
        disabled={busy}
        value={order.assignedToUserId ?? ''}
        onChange={(e) => void onChange(e.target.value)}
        aria-label={`Asignar ${order.id}`}
      >
        <option value="">Sin asignar</option>
        {bodegueros.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
