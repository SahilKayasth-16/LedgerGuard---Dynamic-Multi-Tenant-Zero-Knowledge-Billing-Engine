export type TenantStatus = 'active' | 'inactive' | 'suspended';

export interface Tenant {
  tenantId: string;
  name: string;
  databaseName: string;
  status: TenantStatus;
  createdAt: Date;
}

