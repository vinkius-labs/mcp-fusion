/**
 * User CRUD Tools — Fluent API
 */
import { f } from '../../fusion.js';
import { withAuth } from '../../middleware/auth.js';
import { UserPresenter, UserListPresenter } from '../../presenters/UserPresenter.js';
import { userRepo } from '../../db.js';

export const listUsers = f.query('users_list')
    .describe('List all users')
    .use(withAuth)
    .returns(UserListPresenter)
    .handle(async () => {
        return userRepo.findAll();
    });

export const getUser = f.query('users_getProfile')
    .describe('Get user profile by ID')
    .withString('id', 'User ID')
    .returns(UserPresenter)
    .handle(async (input) => {
        const user = userRepo.findById(input['id'] as string);
        if (!user) throw new Error('User not found');
        return user;
    });

export const createUser = f.mutation('users_create')
    .describe('Create a new user')
    .use(withAuth)
    .withString('name', 'Full name')
    .withString('email', 'Email address')
    .withEnum('role', ['ADMIN', 'USER', 'GUEST'] as const, 'User role')
    .returns(UserPresenter)
    .handle(async (input) => {
        const name = input['name'] as string;
        const email = input['email'] as string;
        const role = input['role'] as 'ADMIN' | 'USER' | 'GUEST';
        const existing = userRepo.findByEmail(email);
        if (existing) throw new Error('Email already in use');
        return userRepo.create({ name, email, role });
    });

export const updateUser = f.mutation('users_update')
    .describe('Update user details')
    .use(withAuth)
    .withString('id', 'User ID')
    .withOptionalString('name', 'New name')
    .withOptionalString('email', 'New email')
    .returns(UserPresenter)
    .handle(async (input) => {
        const data: Record<string, string> = {};
        if (input['name']) data['name'] = input['name'] as string;
        if (input['email']) data['email'] = input['email'] as string;
        const user = userRepo.update(input['id'] as string, data);
        if (!user) throw new Error('User not found');
        return user;
    });

export const deleteUser = f.mutation('users_delete')
    .describe('Delete a user')
    .use(withAuth)
    .withString('id', 'User ID')
    .handle(async (input) => {
        const deleted = userRepo.delete(input['id'] as string);
        if (!deleted) throw new Error('User not found');
        return { message: 'User deleted', id: input['id'] as string };
    });
