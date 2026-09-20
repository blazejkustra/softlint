import type { Order, OrderItem } from "../db";

export function serializeOrder(order: Order) {
  return {
    id: order.id,
    status: order.status,
    totalAmount: order.totalCents / 100,
    placedAt: order.createdAt.toISOString(),
    items: order.items.map(serializeItem),
  };
}

export function serializeItem(item: OrderItem) {
  return {
    sku: item.sku,
    name: item.name,
    qty: item.qty,
    imageUrl: item.imageUrl ?? null,
  };
}
