import type { StateRepository } from '../ports/StateRepository.js';
import type { AppState, Client, Product, Settings } from '../../domain/types.js';
import { mergeBusinessRules } from '../../domain/business-rules.js';
import { categories } from '../../domain/warehouse.js';
import { getWarehouseGeometry } from '../../domain/warehouse-layout.js';
import {
  available,
  client,
  confirmDelivery,
  createOrder,
  dispatch,
  move,
  orderValue,
  orderWeight,
  pickPlan,
  prepare,
  product,
  qtyAt,
  receive,
  registerIncident,
  rejectLot,
  releaseLot,
  reserved,
  sellableStock,
  stock,
  upsertProduct,
} from '../../domain/inventory.service.js';
import { uid } from '../../domain/inventory.service.js';
import {
  applyParsedInvoice,
  parseFacturaXml,
} from '../../domain/invoice-xml.service.js';
import { suggest } from '../../domain/placement.service.js';
import {
  deleteFamily,
  ensureFamilies,
  upsertFamily,
} from '../../domain/families.service.js';
import {
  activateWarehouse,
  createWarehouse,
  deleteWarehouse,
  upsertWarehouse,
} from '../../domain/warehouse-admin.service.js';
import type { Bundle, Supplier, WarehouseFamily, WarehouseSite } from '../../domain/types.js';
import { deleteBundle, ensureBundles, saveBundle } from '../../domain/bundles.service.js';
import {
  cancelPurchase,
  closePurchase,
  createBackorderPurchases,
  createPurchase,
  promoteWaitingOrders,
  receivePurchase,
} from '../../domain/commerce.service.js';
import { commitImport, previewCsv, previewXlsx, previewXml, type ImportKind } from '../../domain/import-docs.service.js';
import { assembleBundle } from '../../domain/kits.service.js';
import { createSupplier, updateSupplier } from '../../domain/suppliers.service.js';
import {
  applyCycleCount,
  approveAdjustment,
  createSuggestedPurchases,
  issueCreditNote,
  issueGuide,
  issueInvoice,
  openCycleCount,
  recallBatch,
  receiveTransfer,
  registerCustomerPayment,
  registerSupplierBill,
  registerSupplierPayment,
  requestAdjustment,
  returnToSupplier,
  saveClientPrice,
  savePriceList,
  shipTransfer,
  suggestReplenishment,
} from '../../domain/commercial.service.js';
import { deleteVehicle as removeFleetVehicle, upsertVehicle } from '../../domain/fleet.service.js';
import type { Vehicle } from '../../domain/types.js';

export const BUNDLES = [
  {
    id: 'KIT01',
    name: 'Kit Limpieza Básico',
    description: 'Multiusos, limpiador de pisos y fundas',
    lines: [
      { productId: 'P001', qty: 4 },
      { productId: 'P032', qty: 2 },
      { productId: 'P078', qty: 2 },
    ],
  },
  {
    id: 'KIT02',
    name: 'Kit Oficina',
    description: 'Papel higiénico, toallas y jabón',
    lines: [
      { productId: 'P012', qty: 2 },
      { productId: 'P025', qty: 2 },
      { productId: 'P045', qty: 4 },
    ],
  },
  {
    id: 'KIT03',
    name: 'Kit Hospitalario',
    description: 'Desinfectante, guantes y jabón',
    lines: [
      { productId: 'P008', qty: 6 },
      { productId: 'P052', qty: 2 },
      { productId: 'P045', qty: 4 },
    ],
  },
];

export class OperationsUseCases {
  constructor(private readonly repo: StateRepository) {}

  async getMeta() {
    const s = await this.repo.load();
    const geo = getWarehouseGeometry(s);
    ensureBundles(s);
    return {
      categories,
      racks: geo.racks,
      locations: geo.locations,
      layout: geo.layout,
      bundles: s.bundles ?? [],
    };
  }

  async getState(): Promise<AppState> {
    return this.repo.load();
  }

  async reset(): Promise<AppState> {
    return this.repo.reset();
  }

  /**
   * Toda escritura pasa por aquí: atómica por empresa y, al final, libera los
   * pedidos que esperaban stock si la operación lo dejó disponible.
   */
  private async mutate(fn: (s: AppState) => void | Promise<void>) {
    const { state } = await this.repo.transaction(async (s) => {
      await fn(s);
      promoteWaitingOrders(s);
    });
    return state;
  }

  async updateSettings(settings: Partial<Settings>) {
    return this.mutate((s) => {
      const { businessRules, ...rest } = settings;
      s.settings = { ...s.settings, ...rest };
      if (businessRules) {
        s.settings.businessRules = mergeBusinessRules(s.settings.businessRules, businessRules);
      }
    });
  }

  async receiveGoods(body: Parameters<typeof receive>[1]) {
    return this.mutate((s) => {
      receive(s, body);
    });
  }

  async transferLot(body: Parameters<typeof move>[1]) {
    return this.mutate((s) => {
      move(s, body);
    });
  }

  async saveProduct(body: Product & { originalId?: string }) {
    const { originalId, ...rest } = body;
    return this.mutate((s) => {
      upsertProduct(s, rest, originalId);
    });
  }

  async saveFamily(body: WarehouseFamily) {
    return this.mutate((s) => {
      ensureFamilies(s);
      upsertFamily(s, body);
    });
  }

  async removeFamily(id: string) {
    return this.mutate((s) => {
      ensureFamilies(s);
      deleteFamily(s, id);
    });
  }

  async placeOrder(body: Parameters<typeof createOrder>[1]) {
    let createdId = '';
    await this.mutate((s) => {
      const o = createOrder(s, body);
      if (o.status === 'Esperando stock') createBackorderPurchases(s, o);
      createdId = o.id;
    });
    return createdId;
  }

  async receivePurchaseOrder(id: string, body: Parameters<typeof receivePurchase>[2]) {
    return this.mutate((s) => {
      receivePurchase(s, id, body);
    });
  }

  async closePurchaseOrder(id: string, reason: string) {
    return this.mutate((s) => {
      closePurchase(s, id, reason);
    });
  }

  async releaseInspectedLot(lotId: string) {
    return this.mutate((s) => {
      releaseLot(s, lotId);
    });
  }

  async rejectInspectedLot(lotId: string, reason: string) {
    return this.mutate((s) => {
      rejectLot(s, lotId, reason);
    });
  }

  async importInvoiceXml(xml: string) {
    const invoice = await parseFacturaXml(xml);
    let result: ReturnType<typeof applyParsedInvoice> | null = null;
    await this.mutate((s) => {
      result = applyParsedInvoice(s, invoice);
      if (result.blocked?.length) throw new Error(result.blocked.join(' '));
    });
    if (!result) throw new Error('No se pudo importar la factura.');
    return result;
  }

  async importInvoiceFile(body: {
    fileName: string;
    mimeType?: string;
    contentBase64: string;
  }) {
    const { parseInvoiceDocument } = await import('../../domain/invoice-document.service.js');
    const raw = String(body.contentBase64 ?? '').replace(/^data:[^;]+;base64,/, '');
    if (!raw) throw new Error('Archivo vacío.');
    const buf = Buffer.from(raw, 'base64');
    if (!buf.length) throw new Error('No se pudo leer el archivo.');
    if (buf.length > 12 * 1024 * 1024) throw new Error('El archivo supera 12 MB.');
    const invoice = await parseInvoiceDocument(
      buf,
      String(body.fileName || 'archivo'),
      String(body.mimeType || ''),
    );
    let result: ReturnType<typeof applyParsedInvoice> | null = null;
    await this.mutate((s) => {
      result = applyParsedInvoice(s, invoice);
    });
    if (!result) throw new Error('No se pudo importar el documento.');
    return result;
  }

  async getPickPlan(orderId: string) {
    const s = await this.repo.load();
    const order = s.orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Pedido no encontrado.');
    return pickPlan(s, order);
  }

  async saveVehicle(body: Partial<Vehicle>) {
    return this.mutate((s) => {
      upsertVehicle(s, body);
    });
  }

  async deleteVehicle(id: string) {
    return this.mutate((s) => {
      removeFleetVehicle(s, id);
    });
  }

  async confirmPrepare(
    orderId: string,
    actor?: { id: string; role: string } | null,
  ) {
    return this.mutate((s) => {
      const order = s.orders.find((o) => o.id === orderId);
      if (
        order?.assignedToUserId &&
        actor &&
        actor.role !== 'admin' &&
        actor.id !== order.assignedToUserId
      ) {
        throw new Error('Este pedido está asignado a otro bodeguero.');
      }
      prepare(s, orderId);
    });
  }

  async assignOrder(
    orderId: string,
    assignee: { id: string; name: string; role: string; companyId: string; active: boolean },
    companyId: string,
  ) {
    if (assignee.role !== 'ops') {
      throw new Error('Solo se puede asignar a usuarios con rol de bodega.');
    }
    if (!assignee.active) throw new Error('El bodeguero está inactivo.');
    if (assignee.companyId !== companyId) {
      throw new Error('El bodeguero pertenece a otra empresa.');
    }
    return this.mutate((s) => {
      const order = s.orders.find((o) => o.id === orderId);
      if (!order) throw new Error('Pedido no encontrado.');
      if (order.status !== 'Por preparar') {
        throw new Error('Solo se asignan pedidos por preparar.');
      }
      order.assignedToUserId = assignee.id;
      order.assignedToName = assignee.name;
      order.assignedAt = new Date().toISOString();
    });
  }

  async unassignOrder(orderId: string) {
    return this.mutate((s) => {
      const order = s.orders.find((o) => o.id === orderId);
      if (!order) throw new Error('Pedido no encontrado.');
      if (order.status !== 'Por preparar') {
        throw new Error('Solo se puede quitar la asignación de pedidos por preparar.');
      }
      delete order.assignedToUserId;
      delete order.assignedToName;
      delete order.assignedAt;
    });
  }

  async confirmDispatch(
    orderIds: string[],
    vehicle = 'GBA-2041',
    limits?: { maxKg?: number; maxM3?: number },
  ) {
    return this.mutate((s) => {
      dispatch(s, orderIds, vehicle, limits);
    });
  }

  async delivery(orderId: string, person: string, notes?: string) {
    return this.mutate((s) => {
      confirmDelivery(s, orderId, person, notes);
    });
  }

  async incident(orderId: string, reason: string, notes?: string) {
    return this.mutate((s) => {
      registerIncident(s, orderId, reason, notes);
    });
  }

  async addClient(body: Omit<Client, 'id'> & { creditLimit?: number | string }) {
    return this.mutate((s) => {
      const creditLimit = Number(body.creditLimit);
      s.clients.push({
        ...body,
        id: uid('CL'),
        creditLimit: Number.isFinite(creditLimit) && creditLimit >= 0 ? creditLimit : 3000,
      });
    });
  }

  async updateClient(
    id: string,
    body: Partial<Omit<Client, 'id'>> & { creditLimit?: number | string },
  ) {
    return this.mutate((s) => {
      const c = s.clients.find((x) => x.id === id);
      if (!c) throw new Error('Cliente no encontrado.');
      if (body.name !== undefined) c.name = String(body.name).trim() || c.name;
      if (body.contact !== undefined) c.contact = String(body.contact).trim() || c.contact;
      if (body.address !== undefined) c.address = String(body.address).trim() || c.address;
      if (body.email !== undefined) c.email = String(body.email).trim() || c.email;
      if (body.type !== undefined) c.type = String(body.type).trim() || c.type;
      if (body.city !== undefined) c.city = String(body.city).trim();
      if (body.sector !== undefined) c.sector = String(body.sector).trim();
      if (body.creditLimit !== undefined) {
        const n = Number(body.creditLimit);
        if (!Number.isFinite(n) || n < 0) throw new Error('Límite de crédito inválido.');
        c.creditLimit = n;
      }
    });
  }

  async saveWarehouse(body: WarehouseSite) {
    return this.mutate((s) => {
      upsertWarehouse(s, body);
    });
  }

  async addWarehouse(body: Omit<WarehouseSite, 'id'>) {
    return this.mutate((s) => {
      createWarehouse(s, body);
    });
  }

  async removeWarehouse(id: string) {
    return this.mutate((s) => {
      deleteWarehouse(s, id);
    });
  }

  async setActiveWarehouse(id: string) {
    return this.mutate((s) => {
      activateWarehouse(s, id);
    });
  }

  async addPurchase(body: Parameters<typeof createPurchase>[1]) {
    return this.mutate((s) => {
      createPurchase(s, body);
    });
  }

  async cancelPurchaseOrder(id: string) {
    return this.mutate((s) => {
      cancelPurchase(s, id);
    });
  }

  async addSupplier(body: Partial<Supplier>) {
    return this.mutate((s) => {
      createSupplier(s, body);
    });
  }

  async editSupplier(id: string, body: Partial<Supplier>) {
    return this.mutate((s) => {
      updateSupplier(s, id, body);
    });
  }

  async saveBundle(body: Partial<Bundle>) {
    return this.mutate((s) => {
      saveBundle(s, body);
    });
  }

  async removeBundle(id: string) {
    return this.mutate((s) => {
      deleteBundle(s, id);
    });
  }

  async assembleKit(body: { bundleId: string; qty: number | string; loc?: string; batch: string; expiry: string }) {
    return this.mutate((s) => {
      assembleBundle(s, body);
    });
  }

  async previewImport(body: { kind?: ImportKind; format?: string; text?: string; base64?: string }) {
    const state = await this.repo.load();
    const kind: ImportKind = body.kind === 'sale' ? 'sale' : 'purchase';
    const format = String(body.format || 'csv').toLowerCase();
    if (format === 'xml') return previewXml(state, String(body.text ?? ''), kind);
    if (format === 'xlsx' || format === 'xls') return previewXlsx(state, String(body.base64 ?? ''), kind);
    return previewCsv(state, String(body.text ?? ''), kind);
  }

  async commitImport(body: Parameters<typeof commitImport>[1]) {
    let result: ReturnType<typeof commitImport> | null = null;
    const state = await this.mutate((s) => {
      result = commitImport(s, body);
    });
    return { state, import: result };
  }

  async issueSalesInvoice(orderId: string) {
    return this.mutate((s) => {
      issueInvoice(s, orderId);
    });
  }

  async issueSalesCreditNote(body: Parameters<typeof issueCreditNote>[1]) {
    return this.mutate((s) => {
      issueCreditNote(s, body);
    });
  }

  async issueDeliveryGuide(body: Parameters<typeof issueGuide>[1]) {
    return this.mutate((s) => {
      issueGuide(s, body);
    });
  }

  async collectInvoice(body: Parameters<typeof registerCustomerPayment>[1]) {
    return this.mutate((s) => {
      registerCustomerPayment(s, body);
    });
  }

  async billSupplier(body: Parameters<typeof registerSupplierBill>[1]) {
    return this.mutate((s) => {
      registerSupplierBill(s, body);
    });
  }

  async paySupplier(body: Parameters<typeof registerSupplierPayment>[1]) {
    return this.mutate((s) => {
      registerSupplierPayment(s, body);
    });
  }

  async savePriceList(body: Parameters<typeof savePriceList>[1]) {
    return this.mutate((s) => {
      savePriceList(s, body);
    });
  }

  async saveClientPrice(body: Parameters<typeof saveClientPrice>[1]) {
    return this.mutate((s) => {
      saveClientPrice(s, body);
    });
  }

  async requestStockAdjustment(body: Parameters<typeof requestAdjustment>[1]) {
    return this.mutate((s) => {
      requestAdjustment(s, body);
    });
  }

  async approveStockAdjustment(id: string) {
    return this.mutate((s) => {
      approveAdjustment(s, id);
    });
  }

  async returnStockToSupplier(body: Parameters<typeof returnToSupplier>[1]) {
    return this.mutate((s) => {
      returnToSupplier(s, body);
    });
  }

  async startCycleCount() {
    return this.mutate((s) => {
      openCycleCount(s);
    });
  }

  async applyStockCount(body: Parameters<typeof applyCycleCount>[1]) {
    return this.mutate((s) => {
      applyCycleCount(s, body);
    });
  }

  async shipWarehouseTransfer(body: Parameters<typeof shipTransfer>[1]) {
    return this.mutate((s) => {
      shipTransfer(s, body);
    });
  }

  async receiveWarehouseTransfer(body: Parameters<typeof receiveTransfer>[1]) {
    return this.mutate((s) => {
      receiveTransfer(s, body);
    });
  }

  async replenishment() {
    const state = await this.repo.load();
    return suggestReplenishment(state);
  }

  async createReplenishment() {
    return this.mutate((s) => {
      createSuggestedPurchases(s);
    });
  }

  async recall(batch: string) {
    const state = await this.repo.load();
    return recallBatch(state, batch);
  }

  /** Consultas derivadas para asistente / KPIs */
  async assistantQuery(query: 'stock' | 'warehouse' | 'orders') {
    const s = await this.repo.load();
    const occupied = getWarehouseGeometry(s).locations.filter((l) => qtyAt(s, l.id) > 0).length;
    const low = s.products.filter((p) => available(s, p.id) < p.min);
    if (query === 'stock') {
      return low.length
        ? low.map(
            (p) =>
              `${p.name}: ${available(s, p.id)} disponibles, mínimo ${p.min}. Sugerencia: ${Math.max(p.min * 2 - available(s, p.id), 1)} u.`,
          )
        : ['Todos los productos cumplen el stock mínimo configurado.'];
    }
    if (query === 'warehouse') {
      return [
        `${getWarehouseGeometry(s).locations.length - occupied} posiciones libres. Ocupación ${Math.round((occupied / Math.max(getWarehouseGeometry(s).locations.length, 1)) * 100)}%.`,
      ];
    }
    const pending = s.orders
      .filter((o) => o.status === 'Por preparar')
      .sort((a, b) => (b.priority === 'Alta' ? 1 : 0) - (a.priority === 'Alta' ? 1 : 0));
    if (!pending.length) return ['No hay pedidos pendientes de preparación.'];
    const first = pending[0];
    return [
      `Empieza por ${first.id} de ${client(s, first.clientId)?.name}. Prioridad ${first.priority.toLowerCase()}, ${first.lines.reduce((n, l) => n + l.qty, 0)} unidades.`,
    ];
  }

  metricsSnapshot(s: AppState) {
    const occupied = getWarehouseGeometry(s).locations.filter((l) => qtyAt(s, l.id) > 0).length;
    // Valor del inventario a costo promedio (lo que cuadra con contabilidad).
    const stockValue = s.products.reduce((n, p) => n + stock(s, p.id) * (p.avgCost ?? 0), 0);
    const saleValue = s.products.reduce((n, p) => n + stock(s, p.id) * p.price, 0);
    const missingCost = s.products.filter((p) => stock(s, p.id) > 0 && !(p.avgCost && p.avgCost > 0)).length;
    const unsellable = s.products.reduce((n, p) => n + Math.max(0, stock(s, p.id) - sellableStock(s, p.id)), 0);
    return {
      occupied,
      saleValue,
      missingCost,
      unsellableUnits: unsellable,
      waitingOrders: s.orders.filter((o) => o.status === 'Esperando stock').length,
      occupancyPct: Math.round(
        (occupied / Math.max(getWarehouseGeometry(s).locations.length, 1)) * 100,
      ),
      stockValue,
      lowCount: s.products.filter((p) => available(s, p.id) < p.min).length,
      pendingOrders: s.orders.filter((o) => o.status === 'Por preparar').length,
    };
  }

}

export {
  stock,
  reserved,
  available,
  qtyAt,
  product,
  client,
  orderValue,
  orderWeight,
  suggest,
};
