/**
 * Product CRUD Tools — Fluent API
 */
import { f } from '../../fusion.js';
import { ProductPresenter, ProductListPresenter } from '../../presenters/ProductPresenter.js';
import { productRepo } from '../../db.js';

export const listProducts = f.query('products_list')
    .describe('List all products in the catalog')
    .returns(ProductListPresenter)
    .handle(async () => {
        return productRepo.findAll();
    });

export const getProduct = f.query('products_getById')
    .describe('Get a product by its ID')
    .withString('id', 'Product ID')
    .returns(ProductPresenter)
    .handle(async (input) => {
        const product = productRepo.findById(input['id'] as string);
        if (!product) throw new Error('Product not found');
        return product;
    });

export const searchProducts = f.query('products_search')
    .describe('Search products by name or category')
    .withString('query', 'Search term (matches name and category)')
    .returns(ProductListPresenter)
    .handle(async (input) => {
        return productRepo.search(input['query'] as string);
    });

export const createProduct = f.mutation('products_create')
    .describe('Add a new product to the catalog')
    .withString('name', 'Product name')
    .withString('description', 'Product description')
    .withNumber('price', 'Price in USD')
    .withNumber('stock', 'Initial stock quantity')
    .withString('category', 'Product category')
    .returns(ProductPresenter)
    .handle(async (input) => {
        return productRepo.create({
            name: input['name'] as string,
            description: input['description'] as string,
            price: input['price'] as number,
            stock: input['stock'] as number,
            category: input['category'] as string,
        });
    });

export const updateStock = f.mutation('products_updateStock')
    .describe('Update product stock (positive to add, negative to remove)')
    .withString('id', 'Product ID')
    .withNumber('delta', 'Stock change (positive=add, negative=remove)')
    .returns(ProductPresenter)
    .handle(async (input) => {
        const product = productRepo.updateStock(
            input['id'] as string,
            input['delta'] as number,
        );
        if (!product) throw new Error('Product not found');
        if (product.stock < 0) throw new Error('Insufficient stock');
        return product;
    });
