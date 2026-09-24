// Target configuration for different customer types
// Targets vary by customer type and time slot (break periods have reduced targets)

export type CustomerTypeKey = "PVH" | "OTHER";

// Break slot sequence numbers (same for both shifts)
// Morning: seq 3 = Breakfast, seq 7 = Tea
// Evening: seq 11 = Tea, seq 15 = Dinner
const BREAKFAST_SLOTS = [3, 15]; // Breakfast (Morning) & Dinner (Evening)
const TEA_SLOTS = [7, 11];       // Morning Tea & Evening Tea

export const TARGET_CONFIG: Record<CustomerTypeKey, {
  normal: number;
  breakfast: number;  // breakfast/dinner break hour
  tea: number;        // tea break hour
}> = {
  PVH: {
    normal: 60,
    breakfast: 40,
    tea: 45,
  },
  OTHER: {
    normal: 40,
    breakfast: 24,
    tea: 32,
  },
};

/**
 * Returns dynamic rate label for a customer, e.g. "PV (60/h)" or "Other (40/h)"
 */
export function getCustomerRateLabel(
  customerType: CustomerTypeKey,
  customerTargets?: CustomerTargetConfig | null
): string {
  const normal = customerTargets?.[customerType]?.normal ?? TARGET_CONFIG[customerType].normal;
  const prefix = customerType === "PVH" ? "PV" : "Other";
  return `${prefix} (${normal}/h)`;
}

/**
 * Returns dynamic full label for a customer, e.g. "PV Products (60 ctns/hr)" or "Other Customers (40 ctns/hr)"
 */
export function getCustomerFullLabel(
  customerType: CustomerTypeKey,
  customerTargets?: CustomerTargetConfig | null
): string {
  const normal = customerTargets?.[customerType]?.normal ?? TARGET_CONFIG[customerType].normal;
  const name = customerType === "PVH" ? "PV Products" : "Other Customers";
  return `${name} (${normal} ctns/hr)`;
}

/**
 * Get the target carton count for a specific time slot and customer type.
 */
export function getTargetForSlot(sequenceNo: number, customerType: CustomerTypeKey): number {
  const config = TARGET_CONFIG[customerType];
  
  if (BREAKFAST_SLOTS.includes(sequenceNo)) {
    return config.breakfast;
  }
  if (TEA_SLOTS.includes(sequenceNo)) {
    return config.tea;
  }
  return config.normal;
}

/**
 * Default customer type fallback for each MD line.
 * By default: Lines 1 & 2 = PVH, Line 3 = OTHER.
 * Can be overridden by custom line-customer map configured by Admin.
 */
export function getDefaultCustomerType(
  mdLine: number,
  customDefaults?: Record<string, CustomerTypeKey>
): CustomerTypeKey {
  if (customDefaults && customDefaults[String(mdLine)]) {
    return customDefaults[String(mdLine)];
  }
  if (mdLine === 1 || mdLine === 2) return "PVH";
  return "OTHER";
}

/**
 * Calculate the total shift target (8 hours) for a customer type.
 */
export function calculateShiftTarget(
  customerType: CustomerTypeKey,
  customNormal?: number,
  customBreakfast?: number,
  customTea?: number
): number {
  const config = TARGET_CONFIG[customerType];
  const normal = customNormal ?? config.normal;
  const breakfast = customBreakfast ?? config.breakfast;
  const tea = customTea ?? config.tea;
  // 6 normal slots + 1 breakfast/dinner slot + 1 tea slot = 8 slots
  return normal * 6 + breakfast + tea;
}

export interface CustomerTargetSetting {
  normal: number;
  breakfast: number;
  tea: number;
}

export type CustomerTargetConfig = Record<CustomerTypeKey, CustomerTargetSetting>;

export const DEFAULT_CUSTOMER_TARGETS: CustomerTargetConfig = {
  PVH: {
    normal: 60,
    breakfast: 40,
    tea: 45,
  },
  OTHER: {
    normal: 40,
    breakfast: 24,
    tea: 32,
  },
};

// Line-specific customer target overrides: { "1": { PVH: {...}, OTHER: {...} }, ... }
export type LineCustomerTargetConfig = Record<string, Partial<CustomerTargetConfig>>;

export interface LineTargetSetting {
  customer: CustomerTypeKey;
  normal: number;
  breakfast?: number;
  tea?: number;
}

/**
 * Get target cartons for slot based on sequence number and custom customer target config.
 */
export function getSlotTargetForCustomer(
  sequenceNo: number,
  customerType: CustomerTypeKey,
  mdLine?: number,
  lineCustomerTargets?: LineCustomerTargetConfig,
  globalCustomerTargets?: CustomerTargetConfig
): number {
  const lineStr = mdLine ? String(mdLine) : undefined;
  const lineOverride = lineStr ? lineCustomerTargets?.[lineStr]?.[customerType] : undefined;
  const globalCfg = globalCustomerTargets?.[customerType];
  const baseline = TARGET_CONFIG[customerType];

  const normal = lineOverride?.normal ?? globalCfg?.normal ?? baseline.normal;
  const breakfast = lineOverride?.breakfast ?? globalCfg?.breakfast ?? baseline.breakfast;
  const tea = lineOverride?.tea ?? globalCfg?.tea ?? baseline.tea;

  if (BREAKFAST_SLOTS.includes(sequenceNo)) {
    return breakfast;
  }
  if (TEA_SLOTS.includes(sequenceNo)) {
    return tea;
  }
  return normal;
}

/**
 * Get target cartons for slot based on sequence number and custom line target config (legacy compatibility).
 */
export function getSlotTargetFromConfig(
  sequenceNo: number,
  customerType: CustomerTypeKey,
  customConfig?: { normal?: number; breakfast?: number; tea?: number }
): number {
  if (customConfig && typeof customConfig.normal === "number") {
    if (BREAKFAST_SLOTS.includes(sequenceNo)) {
      return customConfig.breakfast ?? Math.round(customConfig.normal * (40 / 60));
    }
    if (TEA_SLOTS.includes(sequenceNo)) {
      return customConfig.tea ?? Math.round(customConfig.normal * (45 / 60));
    }
    return customConfig.normal;
  }
  return getTargetForSlot(sequenceNo, customerType);
}

/** All available MD lines */
export const MD_LINES = [1, 2, 3] as const;
export type MdLineNumber = typeof MD_LINES[number];


