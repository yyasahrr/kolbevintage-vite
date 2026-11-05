import { api, ApiError } from "@/lib/api";
import { toLatinDigits } from "@/utils/date";

export interface OrderSummary {
  id: string;
  customer: string | null;
  created_at: string;
  status: string | null;
  payment_status: string | null;
  fulfillment_status: string | null;
  total: string | null;
  currency: string | null;
  item_count: number | null;
}

export interface OrdersResult {
  total: number;
  page: number;
  pageSize: number;
  orders: OrderSummary[];
}

export interface OrderDetail {
  order: OrderSummary & { subtotal: string | null; discount_total: string | null; shipping_total: string | null };
  lines: {
    name_snapshot: string;
    sku: string | null;
    color_name: string | null;
    size_label: string | null;
    quantity: number;
    unit_price: string;
    line_total: string;
  }[];
}

export interface OrderFilters {
  q: string;
  status: string;
  payment: string;
  fulfillment: string;
  from: string;
  to: string;
  sort: string;
  dir: string;
  page: number;
}

export const ORDER_STATUS_TABS = [
  { value: "", label: "همه سفارش‌ها" },
  { value: "attention", label: "نیازمند اقدام" },
  { value: "pending_payment", label: "در انتظار پرداخت" },
  { value: "paid", label: "پرداخت‌شده" },
  { value: "preparing", label: "در حال آماده‌سازی" },
  { value: "shipped", label: "ارسال‌شده" },
  { value: "delivered", label: "تحویل‌شده" },
  { value: "cancelled", label: "لغوشده" },
] as const;

export type OrdersTransport = (path: string, init?: RequestInit) => Promise<unknown>;

const liveTransport: OrdersTransport = (path, init) => api.get<unknown>(path, init);

export const normalizeOrderSearch = (value: string) => toLatinDigits(value).trim();

export function buildOrdersQuery(filters: OrderFilters): string {
  const params = new URLSearchParams({
    q: normalizeOrderSearch(filters.q),
    status: filters.status,
    payment: filters.payment,
    fulfillment: filters.fulfillment,
    from: filters.from,
    to: filters.to,
    sort: filters.sort,
    dir: filters.dir,
    page: String(filters.page),
  });
  return params.toString();
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const nullableString = (value: unknown): value is string | null => value === null || typeof value === "string";
const finiteInteger = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);

function malformed(details: unknown): never {
  throw new ApiError("ساختار پاسخ سفارش‌ها معتبر نیست.", 0, "malformed_response", details);
}

function parseOrder(value: unknown): OrderSummary {
  if (!record(value)) return malformed(value);
  if (
    typeof value.id !== "string" || !value.id ||
    typeof value.created_at !== "string" || Number.isNaN(Date.parse(value.created_at)) ||
    !nullableString(value.customer) || !nullableString(value.status) ||
    !nullableString(value.payment_status) || !nullableString(value.fulfillment_status) ||
    !nullableString(value.total) || !nullableString(value.currency) ||
    !(value.item_count === null || finiteInteger(value.item_count))
  ) return malformed(value);
  return {
    id: value.id,
    customer: value.customer,
    created_at: value.created_at,
    status: value.status,
    payment_status: value.payment_status,
    fulfillment_status: value.fulfillment_status,
    total: value.total,
    currency: value.currency,
    item_count: value.item_count,
  };
}

export function parseOrdersResult(value: unknown): OrdersResult {
  if (!record(value)) return malformed(value);
  if (
    !finiteInteger(value.total) || value.total < 0 ||
    !finiteInteger(value.page) || value.page < 1 ||
    !finiteInteger(value.pageSize) || value.pageSize < 1 ||
    !Array.isArray(value.orders)
  ) return malformed(value);
  return {
    total: value.total,
    page: value.page,
    pageSize: value.pageSize,
    orders: value.orders.map(parseOrder),
  };
}

export function parseOrderDetail(value: unknown): OrderDetail {
  if (!record(value) || !record(value.order) || !Array.isArray(value.lines)) return malformed(value);
  const summary = parseOrder(value.order);
  if (!nullableString(value.order.subtotal) || !nullableString(value.order.discount_total) || !nullableString(value.order.shipping_total)) return malformed(value);
  const lines = value.lines.map((line): OrderDetail["lines"][number] => {
    if (!record(line) || typeof line.name_snapshot !== "string" || !nullableString(line.sku) || !nullableString(line.color_name) ||
      !nullableString(line.size_label) || !finiteInteger(line.quantity) || typeof line.unit_price !== "string" || typeof line.line_total !== "string") return malformed(line);
    return line as OrderDetail["lines"][number];
  });
  return { order: { ...summary, subtotal: value.order.subtotal, discount_total: value.order.discount_total, shipping_total: value.order.shipping_total }, lines };
}

async function call(transport: OrdersTransport, path: string, signal?: AbortSignal): Promise<unknown> {
  try {
    return await transport(path, { signal });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new ApiError("درخواست لغو شد.", 0, "request_cancelled", error);
    throw new ApiError("اجرای درخواست سفارش‌ها ناموفق بود.", 0, "unexpected_exception", error);
  }
}

export async function fetchOrders(filters: OrderFilters, options: { signal?: AbortSignal; transport?: OrdersTransport } = {}): Promise<OrdersResult> {
  const raw = await call(options.transport ?? liveTransport, `/api/admin/orders-list?${buildOrdersQuery(filters)}`, options.signal);
  return parseOrdersResult(raw);
}

export async function fetchOrderDetail(id: string, options: { signal?: AbortSignal; transport?: OrdersTransport } = {}): Promise<OrderDetail> {
  const raw = await call(options.transport ?? liveTransport, `/api/admin/orders-list/${encodeURIComponent(id)}`, options.signal);
  return parseOrderDetail(raw);
}
