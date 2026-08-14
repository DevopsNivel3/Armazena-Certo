import { API_URL, PAGE_SIZE } from '../config';
import type { Inventory, Product, User } from '../types';

export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'message' in body ? String(body.message) : `Erro HTTP ${response.status}`;
      throw new ApiError(message, response.status, body);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error instanceof Error ? error.message : 'Falha de conexão', 0);
  } finally {
    clearTimeout(timeout);
  }
}

export async function login(email: string, password: string) {
  return request<{ token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), senha: password })
  });
}

export async function getMe(token: string) {
  return request<User>('/auth/me', {}, token);
}

export async function fetchInventories(token: string) {
  return request<Inventory[]>('/inventories', {}, token);
}

export async function fetchInventory(token: string, id: number) {
  const inventory = await request<Inventory>(`/inventories/${id}`, {}, token);
  if (typeof inventory.locais_contagem === 'string') {
    try { inventory.locais_contagem = JSON.parse(inventory.locais_contagem); } catch { inventory.locais_contagem = []; }
  }
  return inventory;
}

type ApiStockItem = {
  id?: number;
  produto_id: number;
  fator_conversao?: number | string | null;
  total_contado?: number | string;
  diferenca?: number | string;
  validades_contadas?: Product['validities'];
  locais_contados?: Product['locations'];
  Produto: {
    sku?: string; nome: string; codigo_barras?: string; codigo_referencia?: string;
    categoria?: string; unidade_medida?: string; fator_conversao?: number | string;
  };
};

function mapProduct(inventoryId: number, item: ApiStockItem): Product {
  return {
    inventoryId,
    productId: item.produto_id,
    estoqueId: item.id,
    sku: item.Produto.sku || '',
    name: item.Produto.nome,
    barcode: item.Produto.codigo_barras || '',
    reference: item.Produto.codigo_referencia || '',
    category: item.Produto.categoria || '',
    unit: item.Produto.unidade_medida || 'UN',
    factor: Number(item.fator_conversao ?? item.Produto.fator_conversao ?? 1),
    totalCounted: Number(item.total_contado || 0),
    difference: Number(item.diferenca || 0),
    validities: item.validades_contadas || [],
    locations: item.locais_contados || []
  };
}

export async function fetchAllProducts(token: string, inventoryId: number) {
  const first = await request<{ produtos: ApiStockItem[]; totalPages: number }>(
    `/inventories/${inventoryId}/produtos?page=1&limit=${PAGE_SIZE}&apenasDivergentes=false`, {}, token
  );
  const products = first.produtos.map((item) => mapProduct(inventoryId, item));
  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await request<{ produtos: ApiStockItem[] }>(
      `/inventories/${inventoryId}/produtos?page=${page}&limit=${PAGE_SIZE}&apenasDivergentes=false`, {}, token
    );
    products.push(...next.produtos.map((item) => mapProduct(inventoryId, item)));
  }
  return products;
}

export async function submitCount(token: string, item: {
  inventoryId: number; localId: string; code: string; quantity: number;
  validity?: string | null; observation?: string | null; location?: string | null;
}) {
  return request(`/inventories/${item.inventoryId}/contagem`, {
    method: 'POST',
    body: JSON.stringify({
      codigo_barras: item.code,
      quantidade_contada: item.quantity,
      validade: item.validity || undefined,
      observacao: item.observation || undefined,
      local: item.location || undefined,
      client_operation_id: item.localId
    })
  }, token);
}
