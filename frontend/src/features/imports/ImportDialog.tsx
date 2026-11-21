import { useMemo, useState } from 'react';
import { api } from '../../shared/api/client';
import { Badge, Btn } from '../../shared/components/ui';
import { Icon } from '../../shared/components/Icon';
import { Modal } from '../../shared/components/Modal';
import { FileDropZone, type FileDropStatus } from '../../shared/components/FileDrop';
import { useAppState } from '../../shared/hooks/AppStateProvider';
import {
  IMPORT_FORMATS,
  IMPORT_REJECTED,
  extOf,
  fileToBase64,
  findFormat,
  type FileMeta,
  type FileRoute,
} from '../../shared/lib/fileFormats';
import { groupImportWarnings } from './importWarnings';
import '../../styles/imports.css';

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

const MAX_SIZE_MB = 10;
const AI_STEPS = ['Preparando archivo', 'Leyendo con IA'];
const PREVIEW_STEPS = ['Leyendo archivo', 'Preparando líneas'];

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
  const [file, setFile] = useState<FileMeta | null>(null);
  const [route, setRoute] = useState<FileRoute | null>(null);
  const [status, setStatus] = useState<FileDropStatus>('idle');
  const [step, setStep] = useState(0);
  const [fileError, setFileError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const party = kind === 'purchase' ? 'Proveedor' : 'Cliente';
  const groups = useMemo(() => (preview ? groupImportWarnings(preview.warnings, kind) : []), [preview, kind]);
  const noStock = useMemo(
    () => new Set(groups.filter((group) => group.kind === 'stock').flatMap((group) => group.codes)),
    [groups],
  );

  const reset = () => {
    setFile(null);
    setRoute(null);
    setPreview(null);
    setStatus('idle');
    setFileError('');
    setError('');
  };

  const fail = (message: string) => {
    setStatus('error');
    setFileError(message);
  };

  const readFile = async (picked: File) => {
    const format = findFormat(IMPORT_FORMATS, picked.name);
    const nextRoute = format?.route ?? 'preview';
    setFile({ name: picked.name, size: picked.size });
    setRoute(nextRoute);
    setPreview(null);
    setError('');
    setFileError('');
    setStatus('reading');
    setStep(0);
    setBusy(true);

    if (nextRoute === 'ai') {
      try {
        const contentBase64 = await fileToBase64(picked);
        setStep(1);
        const res = await api.importOrderFile({ fileName: picked.name, mimeType: picked.type, contentBase64 });
        applyResponse(res);
        const created = res.import.productsCreated.length;
        const updated = res.import.productsUpdated.length;
        const clientMsg = res.import.clientCreated ? 'cliente creado' : 'cliente relacionado';
        const prodMsg = [
          created ? `${created} producto(s) creado(s)` : '',
          updated ? `${updated} relacionado(s)` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        onDone(
          `${res.import.orderId} · IA · ${clientMsg}${prodMsg ? ` · ${prodMsg}` : ''} · ${res.import.invoice.docNumber}`,
        );
      } catch (err) {
        fail(err instanceof Error ? err.message : 'No se pudo leer el documento con IA.');
      } finally {
        setBusy(false);
      }
      return;
    }

    const ext = extOf(picked.name);
    const fmt = ext === 'xml' ? 'xml' : ext === 'csv' || ext === 'txt' ? 'csv' : 'xlsx';
    try {
      const body =
        fmt === 'xlsx'
          ? { kind, format: fmt, base64: await fileToBase64(picked) }
          : { kind, format: fmt, text: await picked.text() };
      setStep(1);
      const next = await api.previewImport(body);
      setPreview(next);
      setStatus('ready');
    } catch (err) {
      fail(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
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

  const lines = preview?.rows.length ?? 0;
  const summary = preview
    ? `${lines} ${lines === 1 ? 'línea' : 'líneas'}${preview.partyName ? ` · ${preview.partyName}` : ''}`
    : undefined;

  return (
    <Modal
      title={kind === 'purchase' ? 'Importar compra' : 'Importar pedido'}
      subtitle="PDF y Word se leen con IA. XML, CSV y Excel pasan por una vista previa antes de confirmar."
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" icon="save" disabled={!preview || busy} onClick={() => void commit()}>
            {busy && preview ? 'Importando…' : 'Confirmar'}
          </Btn>
        </>
      }
    >
      <FileDropZone
        id="import-file"
        formats={IMPORT_FORMATS}
        rejected={IMPORT_REJECTED}
        maxSizeMb={MAX_SIZE_MB}
        status={status}
        file={file}
        route={route}
        steps={route === 'ai' ? AI_STEPS : PREVIEW_STEPS}
        step={step}
        summary={summary}
        error={fileError}
        onFiles={([picked]) => void readFile(picked)}
        onReject={(message, rejectedFile) => {
          setFile({ name: rejectedFile.name, size: rejectedFile.size });
          setRoute(null);
          setPreview(null);
          fail(message);
        }}
        onClear={reset}
      />

      {preview ? (
        <div className="form-grid import-party">
          <div className="field">
            <label htmlFor="import-party">{party}</label>
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
        </div>
      ) : null}

      {groups.length ? (
        <div className="import-alerts">
          {groups.map((group) => (
            <div key={`${group.kind}-${group.detail}`} className={`import-alert ${group.level}`} role={group.level === 'block' ? 'alert' : 'status'}>
              <Icon name={group.level === 'block' ? 'stop' : 'alert'} />
              <strong>{group.title}</strong>
              <p>{group.detail}</p>
              {group.codes.length ? (
                <div className="import-alert-codes">
                  {group.codes.map((code) => (
                    <span key={code}>{code}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {preview ? (
        <div className="table-scroll import-table">
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
                      className={row.expiry ? undefined : 'import-missing'}
                      value={row.expiry}
                      onChange={(event) => {
                        const rows = preview.rows.map((item, i) =>
                          i === index ? { ...item, expiry: event.target.value } : item,
                        );
                        setPreview({ ...preview, rows });
                      }}
                    />
                  </td>
                  <td>
                    {row.status === 'invalid' ? (
                      <Badge text="Inválido" color="red" />
                    ) : noStock.has(row.code) ? (
                      <Badge text="Sin stock" color="red" />
                    ) : row.status === 'matched' ? (
                      <Badge text="Existe" color="green" />
                    ) : (
                      <Badge text="Nuevo" color="blue" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {error ? <div className="form-error visible">{error}</div> : null}
    </Modal>
  );
}
