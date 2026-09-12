import api from './api';

export interface TenantInfo {
  id: string;
  name: string;
  status: string;
}

export interface TenantMeResponse {
  success: boolean;
  tenant: TenantInfo;
  message?: string;
}

export interface TenantTestDataRecord {
  _id: string;
  tenantId: string;
  message: string;
  createdAt: string;
}

export interface TenantTestDataResponse {
  success: boolean;
  tenantId: string;
  data: TenantTestDataRecord[];
  message?: string;
}

export const tenantService = {
  getTenantMe: async (): Promise<TenantInfo> => {
    const response = await api.get<TenantMeResponse>('/tenant/me');
    if (!response.data.success || !response.data.tenant) {
      throw new Error(response.data.message || 'Failed to resolve tenant info');
    }
    return response.data.tenant;
  },

  getTenantTestData: async (): Promise<TenantTestDataResponse> => {
    const response = await api.get<TenantTestDataResponse>('/tenant/test-data');
    return response.data;
  },
};

