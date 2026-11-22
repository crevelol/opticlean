import { useMemo, useState } from 'react';
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
  source?: string;
};

function detectFormat(fileName: string) {
  const name = fileName.toLowerCase();
  if (name.endsWith('.xml')) return 'xml';
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.doc')) return 'doc';
  if (name.endsWith('.csv') || name.endsWith('.txt')) return 'csv';
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'xlsx';
  return '';
}

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
  const [fileLabel, setFileLabel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => {
    if (!preview) return null;
    const rows = preview.rows.filter((row) => row.status !== 'invalid' && row.qty > 0);
    const units = rows.reduce((n, row) => n + row.qty, 0);
    const total = rows.reduce((n, row) => n + row.qty * (row.unitPrice || 0), 0);
    const neu = rows.filter((row) => row.status === 'new').length;
    const matched = rows.filter((row) => row.status === 'matched').length;
    const stockAlerts = preview.warnings.filter((w) => /stock|Esperando stock/i.test(w)).length;
    return { rows: rows.length, units, total, neu, matched, stockAlerts };
  }, [preview]);

  const readFile = async (file: File) => {
    const format = detectFormat(file.name);
    if (!format) {
      setError('Usa un archivo XML, PDF, Word (.docx), CSV o Excel.');
      return;
    }
    if (format === 'doc') {
      setError('El .doc antiguo no está soportado. Usa .docx, PDF, XML, CSV o Excel.');
      return;
    }

    setBusy(true);
    setError('');
    setPreview(null);
    setFileLabel(file.name);
    try {
      const body =
        format === 'csv'
          ? { kind, format, text: await file.text() }
          : format === 'xml'
            ? { kind, format, text: await file.text(), fileName: file.name, mimeType: file.type }
            : {
                kind,
                format,
                base64: await fileToBase64(file),
                fileName: file.name,
                mimeType: file.type,
              };
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
      if (kind === 'purchase') {
        onDone(`Compra ${res.import.purchaseId} creada. La caducidad se confirma al recibir.`);
        return;
      }
      const waiting = res.import.status === 'Esperando stock' || (res.import.shortages?.length ?? 0) > 0;
      onDone(
        waiting
          ? `Pedido ${res.import.orderId} creado en «Esperando stock». Falta mercadería; el pedido queda con alerta hasta que haya stock.`
          : `Pedido ${res.import.orderId} creado.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el documento.');
    } finally {
      setBusy(false);
    }
  };

  const confirmLabel =
    kind === 'purchase'
      ? busy
        ? 'Creando compra…'
        : 'Crear orden de compra'
      : busy
        ? 'Creando pedido…'
        : 'Crear pedido';

  return (
    <Modal
      title={kind === 'purchase' ? 'Importar compra' : 'Importar pedido'}
      subtitle="Sube el archivo, revisa el resumen y confirma para crear."
      wide
      fill
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn
            variant="primary"
            icon="save"
            disabled={!preview || busy || !summary?.rows}
            onClick={() => void commit()}
          >
            {confirmLabel}
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
            accept=".xml,.pdf,.docx,.csv,.txt,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.currentTarget.value = '';
            }}
          />
          {fileLabel ? <small className="import-optional-hint">Archivo: {fileLabel}</small> : null}
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

      {preview && summary ? (
        <div className="import-summary" role="status">
          <strong>Resumen antes de crear</strong>
          <ul>
            <li>
              {kind === 'purchase' ? 'Proveedor' : 'Cliente'}: {preview.partyName || '—'}
            </li>
            <li>Documento: {preview.docNumber || '—'}</li>
            <li>
              {summary.rows} línea(s) · {summary.units} u. · total {summary.total.toFixed(2)}
            </li>
            <li>
              {summary.matched} producto(s) existentes
              {summary.neu ? ` · ${summary.neu} nuevo(s) se crearán en inventario` : ''}
            </li>
            {kind === 'sale' && summary.stockAlerts ? (
              <li>
                {summary.stockAlerts} aviso(s) de stock: el pedido se crea igual y queda «Esperando stock»
              </li>
            ) : null}
          </ul>
          <p>Revisa la tabla. Nada se guarda hasta pulsar «{kind === 'purchase' ? 'Crear orden de compra' : 'Crear pedido'}».</p>
        </div>
      ) : null}

      {preview ? (
        <div className="table-scroll">
          <table className="import-preview-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Empaque</th>
                <th>
                  Caducidad
                  <small className="import-optional">opcional</small>
                </th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, index) => {
                const notes = warningsForRow(preview.warnings, row.code);
                return (
                  <tr key={`${row.code}-${index}`} className={notes.length ? 'has-row-note' : undefined}>
                    <td>
                      <strong>{row.name}</strong>
                      <span className="sub">{row.code}</span>
                      {notes.length ? (
                        <ul className="import-row-notes">
                          {notes.map((note) => (
                            <li key={note}>{stripCodePrefix(note, row.code)}</li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                    <td>{row.qty}</td>
                    <td>{row.packCode}</td>
                    <td>
                      <input
                        aria-label={`Caducidad de ${row.code} (opcional)`}
                        type="date"
                        value={row.expiry}
                        onChange={(event) => {
                          const rows = preview.rows.map((item, i) =>
                            i === index ? { ...item, expiry: event.target.value } : item,
                          );
                          setPreview({ ...preview, rows });
                        }}
                      />
                      {!row.expiry ? (
                        <small className="import-optional-hint">No es necesaria</small>
                      ) : null}
                    </td>
                    <td>{row.status === 'matched' ? 'Existe' : row.status === 'new' ? 'Nuevo' : 'Inválido'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="subtle" style={{ marginTop: 12 }}>
          {busy
            ? 'Leyendo archivo y armando el resumen…'
            : 'Elige PDF, Word, XML, CSV o Excel. Primero verás el resumen; el pedido se crea solo al confirmar.'}
        </p>
      )}
      {error ? <div className="form-error visible">{error}</div> : null}
    </Modal>
  );
}

function warningsForRow(warnings: string[], code: string) {
  const key = `${code}:`;
  return warnings.filter((warning) => warning.startsWith(key) || warning.startsWith(`${code} `));
}

function stripCodePrefix(warning: string, code: string) {
  return warning.replace(new RegExp(`^${code}\\s*:\\s*`, 'i'), '').trim();
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
