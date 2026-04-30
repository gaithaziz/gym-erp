export const BRANCH_ADMIN_ROLES = ['ADMIN', 'MANAGER'] as const;
export const GLOBAL_ADMIN_ROLES = ['SUPER_ADMIN'] as const;

export const isBranchAdminRole = (role?: string | null) => Boolean(role && BRANCH_ADMIN_ROLES.includes(role as (typeof BRANCH_ADMIN_ROLES)[number]));
export const isGlobalAdminRole = (role?: string | null) => Boolean(role && GLOBAL_ADMIN_ROLES.includes(role as (typeof GLOBAL_ADMIN_ROLES)[number]));
