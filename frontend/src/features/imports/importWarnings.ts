/**
 * Agrupa los avisos de la vista previa de importación.
 *
 * El backend devuelve texto con forma "CÓDIGO: mensaje" (import-docs.service.ts).
 * Aquí se juntan los que repiten el mismo mensaje y se separan por gravedad:
 * - block: impide crear el documento (falta de stock)
 * - warn:  se puede continuar, pero conviene revisar (falta caducidad)
 */

export type WarningLevel = 'block' | 'warn';

export type WarningGroup = {
  level: WarningLevel;
  kind: 'stock' | 'expiry' | 'other';
  title: string;
  detail: string;
  codes: string[];
};

const LINE = /^([^:]{1,60}):\s*(.+)$/;

function classify(message: string): WarningGroup['kind'] {
  const text = message.toLowerCase();
  if (text.includes('stock')) return 'stock';
  if (text.includes('caducidad')) return 'expiry';
  return 'other';
}

export function groupImportWarnings(warnings: string[], kind: 'purchase' | 'sale'): WarningGroup[] {
  const groups = new Map<string, WarningGroup>();
  const doc = kind === 'sale' ? 'el pedido' : 'la compra';

  for (const warning of warnings) {
    const match = LINE.exec(warning.trim());
    const code = match ? match[1].trim() : '';
    const message = match ? match[2].trim() : warning.trim();
    const type = classify(message);
    const key = type === 'other' ? `other:${message}` : type;
    const current = groups.get(key);
    if (current) {
      if (code && !current.codes.includes(code)) current.codes.push(code);
      continue;
    }
    groups.set(key, {
      level: type === 'stock' ? 'block' : 'warn',
      kind: type,
      title: '',
      detail:
        type === 'stock'
          ? 'No hay stock suficiente. Registra la entrada de mercadería y vuelve a importar.'
          : type === 'expiry'
            ? 'El archivo no la trae y no se inventa ninguna fecha. Complétala en la tabla si la conoces.'
            : message,
      codes: code ? [code] : [],
    });
  }

  return [...groups.values()]
    .map((group) => {
      const n = group.codes.length;
      const products = n === 1 ? '1 producto' : `${n} productos`;
      const title =
        group.kind === 'stock'
          ? `No se puede crear ${doc}`
          : group.kind === 'expiry'
            ? `${products} sin caducidad`
            : n > 1
              ? `${products} con avisos`
              : 'Aviso';
      return { ...group, title };
    })
    .sort((a, b) => (a.level === b.level ? 0 : a.level === 'block' ? -1 : 1));
}
