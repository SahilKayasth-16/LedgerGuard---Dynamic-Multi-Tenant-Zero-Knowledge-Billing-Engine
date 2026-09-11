export interface TenantConfig {
  tenantId: string;
  databaseName: string;
  name: string;
  status: 'active' | 'inactive' | 'suspended';
}

// Controlled backend registry of tenant configurations
const TENANT_REGISTRY: Record<string, TenantConfig> = {
  'tenant-company-a': {
    tenantId: 'tenant-company-a',
    databaseName: 'ledgerguard_tenant_company_a',
    name: 'Company A Corp',
    status: 'active',
  },
  'tenant-company-b': {
    tenantId: 'tenant-company-b',
    databaseName: 'ledgerguard_tenant_company_b',
    name: 'Company B Inc',
    status: 'active',
  },
};

export const getTenantConfig = (tenantId: string): TenantConfig => {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('Invalid tenantId provided.');
  }

  const tenantConfig = TENANT_REGISTRY[tenantId];

  if (!tenantConfig) {
    throw new Error(`Tenant configuration not found for tenantId: ${tenantId}`);
  }

  if (tenantConfig.status !== 'active') {
    throw new Error(`Tenant '${tenantId}' is currently ${tenantConfig.status}. Access denied.`);
  }

  return tenantConfig;
};

