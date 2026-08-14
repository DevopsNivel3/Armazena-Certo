export type User = {
  id: number;
  nome: string;
  email: string;
  nivel_acesso: string;
  empresa_id?: number | null;
};

export type Inventory = {
  id: number;
  nome: string;
  status: string;
  etapa_contagem?: number;
  validade_obrigatoria?: boolean;
  local_atribuido?: string | null;
  locais_contagem?: string[] | string;
  empresa_cliente_nome?: string | null;
  progresso_percentual?: number;
  updatedAt?: string;
};

export type Product = {
  inventoryId: number;
  productId: number;
  estoqueId?: number;
  sku: string;
  name: string;
  barcode: string;
  reference: string;
  category: string;
  unit: string;
  factor: number;
  totalCounted: number;
  difference: number;
  validities: Array<{ data: string; quantidade: number }>;
  locations: Array<{ nome: string; quantidade: number }>;
};

export type CountDraft = {
  localId: string;
  inventoryId: number;
  code: string;
  productId: number;
  productName: string;
  quantity: number;
  standardizedQuantity: number;
  validity?: string | null;
  observation?: string | null;
  location?: string | null;
  createdAt: string;
};

export type QueueItem = CountDraft & {
  attempts: number;
  status: 'pending' | 'retrying' | 'auth_required' | 'blocked';
  lastError?: string | null;
};

export type SyncReport = {
  sent: number;
  pending: number;
  blocked: number;
  authRequired: boolean;
};
