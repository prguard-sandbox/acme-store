import { listByCustomer, listItems, type Order, type OrderItem } from "../db/orders";

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

/** Every order of a customer with its items, newest first. */
export function orderHistory(customerId: string): OrderWithItems[] {
  const orders = listByCustomer(customerId, 100000, 0);
  const history: OrderWithItems[] = [];
  for (const order of orders) {
    history.push({ ...order, items: listItems(order.id) });
  }
  return history;
}

export function lifetimeValueCents(customerId: string): number {
  return orderHistory(customerId).reduce((sum, order) => sum + order.totalCents, 0);
}
