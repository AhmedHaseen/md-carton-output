// Role-based permissions for MD Carton Output System
// Implements access control from doc Section 13

import { Role } from "@prisma/client";

export interface Permissions {
  canEnterActuals: boolean;
  canEditActuals: boolean;
  canOverrideTargets: boolean;
  canDeleteReset: boolean;
  canManageUsers: boolean;
  canViewAudit: boolean;
  canCloseDay: boolean;
}

/**
 * Get permissions for a given role (doc Section 13 authorization matrix).
 */
export function getPermissions(role: Role): Permissions {
  switch (role) {
    case Role.OPERATOR:
      return {
        canEnterActuals: true,
        canEditActuals: true,
        canOverrideTargets: false,
        canDeleteReset: false,
        canManageUsers: false,
        canViewAudit: false,
        canCloseDay: false,
      };
    case Role.SUPERVISOR:
      return {
        canEnterActuals: true,
        canEditActuals: true,
        canOverrideTargets: true,
        canDeleteReset: true,
        canManageUsers: false,
        canViewAudit: true,
        canCloseDay: true,
      };
    case Role.MANAGER:
      return {
        canEnterActuals: true,
        canEditActuals: true,
        canOverrideTargets: true,
        canDeleteReset: true,
        canManageUsers: true,
        canViewAudit: true,
        canCloseDay: true,
      };
    case Role.ADMIN:
      return {
        canEnterActuals: true,
        canEditActuals: true,
        canOverrideTargets: true,
        canDeleteReset: true,
        canManageUsers: true,
        canViewAudit: true,
        canCloseDay: true,
      };
    default:
      return {
        canEnterActuals: false,
        canEditActuals: false,
        canOverrideTargets: false,
        canDeleteReset: false,
        canManageUsers: false,
        canViewAudit: false,
        canCloseDay: false,
      };
  }
}

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: Role, permission: keyof Permissions): boolean {
  return getPermissions(role)[permission];
}
