import { Elysia } from 'elysia';

// Test API keys
const API_KEYS = new Set([
    'test-api-key-123',
    'dev-api-key-456',
    'user-api-key-789',
]);

// Admin API keys
const ADMIN_KEYS = new Set([
    'admin-api-key-001',
    'super-admin-key-002',
]);

/**
 * Authentication middleware plugin
 * Derives isAuthenticated and isAdmin from API key
 */
export const authMiddleware = new Elysia({ name: 'auth' })
    .derive(({ request, query }) => {
        // Get API key from header or query parameter
        const apiKey =
            request.headers.get('X-API-Key') ||
            (query as Record<string, string>)?.apiKey ||
            '';

        const isAdmin = ADMIN_KEYS.has(apiKey);
        const isAuthenticated = isAdmin || API_KEYS.has(apiKey);

        return {
            apiKey,
            isAuthenticated,
            isAdmin,
        };
    });

/**
 * Guard plugin that requires authentication
 */
export const requireAuth = new Elysia({ name: 'requireAuth' })
    .use(authMiddleware)
    .onBeforeHandle(({ isAuthenticated, set }:any) => {
        if (!isAuthenticated) {
            set.status = 401;
            return {
                success: false,
                error: 'Unauthorized',
                message: 'Valid API key required. Provide X-API-Key header or apiKey query parameter.',
            };
        }
    });

/**
 * Guard plugin that requires admin access
 */
export const requireAdmin = new Elysia({ name: 'requireAdmin' })
    .use(authMiddleware)
    .onBeforeHandle(({ isAdmin, set }:any) => {
        if (!isAdmin) {
            set.status = 403;
            return {
                success: false,
                error: 'Forbidden',
                message: 'Admin access required.',
            };
        }
    });
