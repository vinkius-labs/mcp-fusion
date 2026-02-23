/**
 * PromptMessage — Unit Tests
 *
 * Covers all factory methods: system, user, assistant,
 * image, audio, resource.
 */
import { describe, it, expect } from 'vitest';
import { PromptMessage } from '../../src/prompt/PromptMessage.js';

describe('PromptMessage', () => {
    describe('system', () => {
        it('creates a user-role message (MCP convention)', () => {
            const msg = PromptMessage.system('You are a financial auditor.');
            expect(msg.role).toBe('user');
            expect(msg.content).toEqual({
                type: 'text', text: 'You are a financial auditor.',
            });
        });
    });

    describe('user', () => {
        it('creates a user-role text message', () => {
            const msg = PromptMessage.user('Begin the audit.');
            expect(msg.role).toBe('user');
            expect(msg.content).toEqual({
                type: 'text', text: 'Begin the audit.',
            });
        });
    });

    describe('assistant', () => {
        it('creates an assistant-role text message', () => {
            const msg = PromptMessage.assistant('Analyzing...');
            expect(msg.role).toBe('assistant');
            expect(msg.content).toEqual({
                type: 'text', text: 'Analyzing...',
            });
        });
    });

    describe('image', () => {
        it('creates an image message with correct roles', () => {
            const msg = PromptMessage.image('user', 'base64data', 'image/png');
            expect(msg.role).toBe('user');
            expect(msg.content).toEqual({
                type: 'image', data: 'base64data', mimeType: 'image/png',
            });
        });

        it('supports assistant role', () => {
            const msg = PromptMessage.image('assistant', 'data', 'image/jpeg');
            expect(msg.role).toBe('assistant');
        });
    });

    describe('audio', () => {
        it('creates an audio message', () => {
            const msg = PromptMessage.audio('user', 'audiodata', 'audio/wav');
            expect(msg.role).toBe('user');
            expect(msg.content).toEqual({
                type: 'audio', data: 'audiodata', mimeType: 'audio/wav',
            });
        });
    });

    describe('resource', () => {
        it('creates a resource reference (minimal)', () => {
            const msg = PromptMessage.resource('user', 'file:///doc.pdf');
            expect(msg.role).toBe('user');
            expect(msg.content).toEqual({
                type: 'resource',
                resource: { uri: 'file:///doc.pdf' },
            });
        });

        it('creates a resource reference with options', () => {
            const msg = PromptMessage.resource('assistant', 'file:///data.csv', {
                mimeType: 'text/csv',
                text: 'CSV content here',
            });
            expect(msg.content).toEqual({
                type: 'resource',
                resource: {
                    uri: 'file:///data.csv',
                    mimeType: 'text/csv',
                    text: 'CSV content here',
                },
            });
        });

        it('creates a resource reference with blob', () => {
            const msg = PromptMessage.resource('user', 'file:///image.png', {
                mimeType: 'image/png',
                blob: 'base64blob',
            });
            expect((msg.content as { type: 'resource'; resource: { blob: string } }).resource.blob).toBe('base64blob');
        });
    });
});
