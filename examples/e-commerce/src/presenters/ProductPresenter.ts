/**
 * Product Presenter — MVA View Layer
 */
import { definePresenter, ui } from '@vinkius-core/mcp-fusion';
import { z } from 'zod';

export const ProductPresenter = definePresenter({
    name: 'Product',
    schema: z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        price: z.number().describe('Price in USD — display with $ prefix and 2 decimal places'),
        stock: z.number().describe('Current inventory count'),
        category: z.string(),
    }),
    ui: (product) => [
        ui.markdown(
            `📦 **${product.name}** — $${product.price.toFixed(2)} | Stock: ${product.stock} | ${product.category}`
        ),
    ],
    suggestActions: (product) => product.stock < 10
        ? [{ tool: 'products_updateStock', reason: `Low stock alert: only ${product.stock} left` }]
        : [],
});

export const ProductListPresenter = definePresenter({
    name: 'ProductList',
    schema: z.object({
        id: z.string(),
        name: z.string(),
        price: z.number(),
        stock: z.number(),
        category: z.string(),
    }),
    agentLimit: { max: 100, onTruncate: (n) => ui.summary(`⚠️ ${n} products omitted`) },
    ui: (product) => [
        ui.markdown(`• ${product.name} — $${product.price.toFixed(2)} (${product.stock} in stock)`),
    ],
});
