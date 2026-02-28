/**
 * In-Memory Database — Model Layer
 *
 * Simulates a real database with User, Product, and Order models.
 * Replace with Prisma, Drizzle, or any ORM in production.
 */

// ── Models ───────────────────────────────────────────────

export interface User {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'USER' | 'GUEST';
    createdAt: string;
}

export interface Product {
    id: string;
    name: string;
    description: string;
    price: number;
    stock: number;
    category: string;
}

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'cancelled';

export interface OrderItem {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
}

export interface Order {
    id: string;
    userId: string;
    userName: string;
    items: OrderItem[];
    total: number;
    status: OrderStatus;
    createdAt: string;
}

// ── Seed Data ────────────────────────────────────────────

const users: User[] = [
    { id: 'u1', name: 'Alice Admin', email: 'alice@test.com', role: 'ADMIN', createdAt: '2025-01-01T00:00:00Z' },
    { id: 'u2', name: 'Bob User', email: 'bob@test.com', role: 'USER', createdAt: '2025-02-15T00:00:00Z' },
    { id: 'u3', name: 'Carol Guest', email: 'carol@test.com', role: 'GUEST', createdAt: '2025-03-20T00:00:00Z' },
];

const products: Product[] = [
    { id: 'p1', name: 'Wireless Mouse', description: 'Ergonomic wireless mouse', price: 29.99, stock: 150, category: 'peripherals' },
    { id: 'p2', name: 'Mechanical Keyboard', description: 'Cherry MX Blue switches', price: 89.99, stock: 75, category: 'peripherals' },
    { id: 'p3', name: 'USB-C Hub', description: '7-port USB-C hub with HDMI', price: 49.99, stock: 200, category: 'accessories' },
    { id: 'p4', name: '4K Monitor', description: '27" 4K IPS display', price: 399.99, stock: 30, category: 'displays' },
];

const orders: Order[] = [
    {
        id: 'o1', userId: 'u2', userName: 'Bob User',
        items: [
            { productId: 'p1', productName: 'Wireless Mouse', quantity: 2, unitPrice: 29.99 },
            { productId: 'p3', productName: 'USB-C Hub', quantity: 1, unitPrice: 49.99 },
        ],
        total: 109.97, status: 'confirmed', createdAt: '2025-06-01T10:00:00Z',
    },
    {
        id: 'o2', userId: 'u1', userName: 'Alice Admin',
        items: [
            { productId: 'p4', productName: '4K Monitor', quantity: 1, unitPrice: 399.99 },
        ],
        total: 399.99, status: 'pending', createdAt: '2025-06-10T14:30:00Z',
    },
];

// ── Repository Functions ─────────────────────────────────

let nextId = 100;
function genId(prefix: string): string { return `${prefix}${++nextId}`; }

// Users
export const userRepo = {
    findAll: () => [...users],
    findById: (id: string) => users.find(u => u.id === id),
    findByEmail: (email: string) => users.find(u => u.email === email),
    create: (data: Omit<User, 'id' | 'createdAt'>) => {
        const user: User = { ...data, id: genId('u'), createdAt: new Date().toISOString() };
        users.push(user);
        return user;
    },
    update: (id: string, data: Partial<Pick<User, 'name' | 'email' | 'role'>>) => {
        const user = users.find(u => u.id === id);
        if (!user) return null;
        Object.assign(user, data);
        return user;
    },
    delete: (id: string) => {
        const idx = users.findIndex(u => u.id === id);
        if (idx === -1) return false;
        users.splice(idx, 1);
        return true;
    },
};

// Products
export const productRepo = {
    findAll: () => [...products],
    findById: (id: string) => products.find(p => p.id === id),
    search: (query: string) => products.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.category.toLowerCase().includes(query.toLowerCase())
    ),
    create: (data: Omit<Product, 'id'>) => {
        const product: Product = { ...data, id: genId('p') };
        products.push(product);
        return product;
    },
    updateStock: (id: string, delta: number) => {
        const product = products.find(p => p.id === id);
        if (!product) return null;
        product.stock += delta;
        return product;
    },
};

// Orders
export const orderRepo = {
    findAll: () => [...orders],
    findById: (id: string) => orders.find(o => o.id === id),
    findByUser: (userId: string) => orders.filter(o => o.userId === userId),
    create: (data: Omit<Order, 'id' | 'createdAt'>) => {
        const order: Order = { ...data, id: genId('o'), createdAt: new Date().toISOString() };
        orders.push(order);
        return order;
    },
    updateStatus: (id: string, status: OrderStatus) => {
        const order = orders.find(o => o.id === id);
        if (!order) return null;
        order.status = status;
        return order;
    },
};
