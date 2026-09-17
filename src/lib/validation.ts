// Input validation for MD Carton Output System
// Implements rules from doc Section 8.4

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate carton count input (doc Section 8.4).
 * - Must be a whole number >= 0
 * - Negative values rejected
 * - Extremely large values trigger a warning threshold
 */
export function validateCartonCount(value: unknown): ValidationResult {
  if (value === null || value === undefined || value === "") {
    return { valid: true }; // Nullable is OK — slot is just "Pending"
  }

  const num = Number(value);

  if (isNaN(num)) {
    return { valid: false, error: "Carton count must be a number." };
  }

  if (!Number.isInteger(num)) {
    return { valid: false, error: "Carton count must be a whole number." };
  }

  if (num < 0) {
    return { valid: false, error: "Carton count cannot be negative." };
  }

  if (num > 500) {
    return {
      valid: true,
      error: `Warning: ${num} cartons is unusually high. Please confirm this value.`,
    };
  }

  return { valid: true };
}

/**
 * Validate target override input.
 */
export function validateTargetOverride(target: unknown, reason: unknown): ValidationResult {
  if (target === null || target === undefined || target === "") {
    return { valid: false, error: "Target value is required." };
  }

  const num = Number(target);

  if (isNaN(num) || !Number.isInteger(num)) {
    return { valid: false, error: "Target must be a whole number." };
  }

  if (num <= 0) {
    return { valid: false, error: "Target must be greater than zero." };
  }

  if (!reason || (typeof reason === "string" && reason.trim().length === 0)) {
    return { valid: false, error: "A reason is required for every target override." };
  }

  return { valid: true };
}

/**
 * Validate date string.
 */
export function validateDate(dateStr: unknown): ValidationResult {
  if (!dateStr || typeof dateStr !== "string") {
    return { valid: false, error: "Date is required." };
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return { valid: false, error: "Invalid date format." };
  }

  return { valid: true };
}
