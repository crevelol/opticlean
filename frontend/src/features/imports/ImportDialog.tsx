import { useState } from 'react';
import { api } from '../../shared/api/client';
import { Btn } from '../../shared/components/ui';
import { Modal } from '../../shared/components/Modal';
import { useAppState } from '../../shared/hooks/AppStateProvider';

type ImportKind = 'purchase' | 'sale';

type Row = {
  code: string;
  name: string;
  qty: number;
  packCode: string;
  unitPrice: number;
  batch: string;
  expiry: string;
  productId: string | null;
  status: 'matched' | 'new' | 'invalid';
  message: string;
};

type Preview = {
  partyName: string;
  partyTaxId: string;
  partyAddress: string;
  docNumber: string;
  issueDate: string;
  warnings: string[];
  rows: Row[];
};

export function ImportDialog({
  kind,
  onClose,
  onDone,
}: {
  kind: ImportKind;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { applyResponse } = useAppState();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const readFile = async (file: File) => {
    const name = file.name.toLowerCase();
    const format = name.endsWith('.xml') ? 'xml' : name.endsWith('.csv') || name.endsWith('.txt') ? 'csv' : 'xlsx';
    if (!/\.(xml|csv|txt|xlsx|xls)$/.test(name)) {
      setError('Usa un archivo XML, CSV o Excel.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body =
        format === 'xlsx'
          ? { kind, format, base64: await fileToBase64(file) }
          : { kind, format, text: await file.text() };
      const next = await api.previewImport(body);
      setPreview(next);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview || busy) return;
    const rows = preview.rows.filter((row) => row.status !== 'invalid' && row.qty > 0);
    if (!rows.length) {
      setError('No hay líneas válidas para confirmar.');
      return;
    }
    if (rows.some((row) => row.expiry && !/^\d{4}-\d{2}-\d{2}$/.test(row.expiry))) {
      setError('La caducidad debe ir en formato AAAA-MM-DD. Si el archivo no la trae, déjala vacía.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.commitImport({
        kind,
        partyName: preview.partyName,
        partyTaxId: preview.partyTaxId,
        partyAddress: preview.partyAddress,
        docNumber: preview.docNumber,
        issueDate: preview.issueDate,
        rows,
      });
      applyResponse(res);
      onDone(
        kind === 'purchase'
          ? `Compra ${res.import.purchaseId} importada. La caducidad se confirma al recibir.`
          : `Pedido ${res.import.orderId} importado.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo confirmar la importación.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={kind === 'purchase' ? 'Importar compra' : 'Importar pedido'}
      subtitle="XML, CSV o Excel. La vista previa no inventa caducidad ni existencias."
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" icon="save" disabled={!preview || busy} onClick={() => void commit()}>
            {busy ? 'Importando…' : 'Confirmar'}
          </Btn>
        </>
      }
    >
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="import-file">Archivo</label>
          <input
            id="import-file"
            type="file"
            accept=".xml,.csv,.txt,.xlsx,.xls"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
        </div>
        {preview ? (
          <>
            <div className="field">
              <label htmlFor="import-party">{kind === 'purchase' ? 'Proveedor' : 'Cliente'}</label>
              <input
                id="import-party"
                value={preview.partyName}
                onChange={(event) => setPreview({ ...preview, partyName: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="import-doc">Documento</label>
              <input
                id="import-doc"
                value={preview.docNumber}
                onChange={(event) => setPreview({ ...preview, docNumber: event.target.value })}
              />
            </div>
          </>
        ) : null}
      </div>
      {preview?.warnings.length ? (
        <div className="form-error visible" style={{ marginTop: 12 }}>
          {preview.warnings.slice(0, 4).map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
      {preview ? (
        <div className="table-scroll" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Empaque</th>
                <th>Caducidad</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, index) => (
                <tr key={`${row.code}-${index}`}>
                  <td>
                    <strong>{row.name}</strong>
                    <span className="sub">{row.code}</span>
                  </td>
                  <td>{row.qty}</td>
                  <td>{row.packCode}</td>
                  <td>
                    <input
                      aria-label={`Caducidad de ${row.code}`}
                      type="date"
                      value={row.expiry}
                      onChange={(event) => {
                        const rows = preview.rows.map((item, i) =>
                          i === index ? { ...item, expiry: event.target.value } : item,
                        );
                        setPreview({ ...preview, rows });
                      }}
                    />
                  </td>
                  <td>{row.status === 'matched' ? 'Existe' : row.status === 'new' ? 'Nuevo' : 'Inválido'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="subtle" style={{ marginTop: 12 }}>
          {busy ? 'Leyendo archivo…' : 'Elige el archivo que ya usa el proveedor o el cliente.'}
        </p>
      )}
      {error ? <div className="form-error visible">{error}</div> : null}
    </Modal>
  );
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? '');
      resolve(value.slice(value.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
