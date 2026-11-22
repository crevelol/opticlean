import type { BusinessRules, Settings } from '../types';

export const DEFAULT_BUSINESS_RULES: BusinessRules = {
  shippingMinKm: 8,
  shippingStopsDivisor: 3,
  shippingEtaBaseFactor: 0.55,
  shippingEtaPerStop: 0.12,
  assignCostReference: 1.2,
  assignCostWeight: 25,
  assignIdealFillMax: 0.85,
  assignNearFullFill: 0.95,
  creditOkMaxPct: 60,
  creditTightMaxPct: 90,
  defaultCreditLimit: 3000,
  separateExpiryLots: true,
};

export function resolveBusinessRules(settings?: Settings | null): BusinessRules {
  return { ...DEFAULT_BUSINESS_RULES, ...(settings?.businessRules ?? {}) };
}

export function estimateRouteKm(
  baseRouteKm: number,
  stops: number,
  rules: BusinessRules = DEFAULT_BUSINESS_RULES,
) {
  const divisor = Math.max(1, rules.shippingStopsDivisor);
  const n = Math.max(1, stops);
  return Math.max(rules.shippingMinKm, Math.round(baseRouteKm * (n / Math.max(divisor, n))));
}

export function estimateRouteCost(km: number, costPerKm: number, costPerTrip = 0) {
  return Math.round((Math.max(0, km) * costPerKm + Math.max(0, costPerTrip)) * 100) / 100;
}

export function estimateRouteEtaHours(
  baseEtaHours: number,
  stops: number,
  rules: BusinessRules = DEFAULT_BUSINESS_RULES,
) {
  return (
    Math.round(
      baseEtaHours * (rules.shippingEtaBaseFactor + stops * rules.shippingEtaPerStop) * 100,
    ) / 100
  );
}
