/**
 * Order Workflow Tools — Fluent API
 *
 * Demonstrates cross-domain validation, workflow transitions,
 * stock management, and HATEOAS-driven actions.
 */
import { f } from '../../fusion.js';
import { withAuth } from '../../middleware/auth.js';
import { OrderPresenter } from '../../presenters/OrderPresenter.js';
import { orderRepo, productRepo, userRepo } from '../../db.js';

export const listOrders = f.query('orders_list')
    .describe('List all orders')
    .use(withAuth)
    .returns(OrderPresenter)
    .handle(async () => {
        return orderRepo.findAll();
    });

export const getOrder = f.query('orders_getById')
    .describe('Get order details by ID')
    .withString('id', 'Order ID')
    .returns(OrderPresenter)
    .handle(async (input) => {
        const order = orderRepo.findById(input['id'] as string);
        if (!order) throw new Error('Order not found');
        return order;
    });

export const createOrder = f.mutation('orders_create')
    .describe('Create a new order (validates user and product stock)')
    .use(withAuth)
    .withString('userId', 'User ID')
    .withString('productIds', 'Comma-separated product IDs')
    .withString('quantities', 'Comma-separated quantities (matching productIds)')
    .returns(OrderPresenter)
    .handle(async (input) => {
        // Validate user
        const userId = input['userId'] as string;
        const user = userRepo.findById(userId);
        if (!user) throw new Error('User not found');

        // Parse items
        const productIdsStr = input['productIds'] as string;
        const quantitiesStr = input['quantities'] as string;
        const pIds = productIdsStr.split(',').map((s: string) => s.trim());
        const qtys = quantitiesStr.split(',').map((s: string) => parseInt(s.trim(), 10));
        if (pIds.length !== qtys.length) throw new Error('productIds and quantities must have same length');

        // Validate products and build items
        const items: Array<{ productId: string; productName: string; quantity: number; unitPrice: number }> = [];
        let total = 0;

        for (let i = 0; i < pIds.length; i++) {
            const product = productRepo.findById(pIds[i]!);
            if (!product) throw new Error(`Product ${pIds[i]} not found`);
            const qty = qtys[i]!;
            if (qty <= 0) throw new Error('Quantity must be positive');
            if (product.stock < qty) throw new Error(`Insufficient stock for ${product.name}: ${product.stock} available`);

            items.push({
                productId: product.id,
                productName: product.name,
                quantity: qty,
                unitPrice: product.price,
            });
            total += product.price * qty;
        }

        // Deduct stock
        for (const item of items) {
            productRepo.updateStock(item.productId, -item.quantity);
        }

        return orderRepo.create({
            userId: user.id,
            userName: user.name,
            items,
            total: Math.round(total * 100) / 100,
            status: 'pending',
        });
    });

export const confirmOrder = f.mutation('orders_confirm')
    .describe('Confirm a pending order')
    .use(withAuth)
    .withString('id', 'Order ID')
    .returns(OrderPresenter)
    .handle(async (input) => {
        const id = input['id'] as string;
        const order = orderRepo.findById(id);
        if (!order) throw new Error('Order not found');
        if (order.status !== 'pending') throw new Error(`Cannot confirm: order is ${order.status}`);
        return orderRepo.updateStatus(id, 'confirmed')!;
    });

export const shipOrder = f.mutation('orders_ship')
    .describe('Ship a confirmed order')
    .use(withAuth)
    .withString('id', 'Order ID')
    .returns(OrderPresenter)
    .handle(async (input) => {
        const id = input['id'] as string;
        const order = orderRepo.findById(id);
        if (!order) throw new Error('Order not found');
        if (order.status !== 'confirmed') throw new Error(`Cannot ship: order is ${order.status}`);
        return orderRepo.updateStatus(id, 'shipped')!;
    });

export const cancelOrder = f.mutation('orders_cancel')
    .describe('Cancel a pending/confirmed order (restores stock)')
    .use(withAuth)
    .withString('id', 'Order ID')
    .returns(OrderPresenter)
    .handle(async (input) => {
        const id = input['id'] as string;
        const order = orderRepo.findById(id);
        if (!order) throw new Error('Order not found');
        if (order.status === 'shipped' || order.status === 'cancelled') {
            throw new Error(`Cannot cancel: order is ${order.status}`);
        }

        // Restore stock
        for (const item of order.items) {
            productRepo.updateStock(item.productId, item.quantity);
        }

        return orderRepo.updateStatus(id, 'cancelled')!;
    });
