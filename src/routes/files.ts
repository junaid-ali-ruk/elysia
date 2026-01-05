import { Elysia, t } from 'elysia';
import { storageService } from '../services/storage';
import { authMiddleware, requireAuth, requireAdmin } from '../middleware/auth';
import type { FileCategory } from '../types';

/**
 * File management routes
 */
export const filesRoutes = new Elysia({ prefix: '/api/files' })
    .use(authMiddleware)

    // GET /api/files - List files
    .get(
        '/',
        ({ query }) => {
            const page = query.page ? parseInt(query.page) : 1;
            const limit = query.limit ? parseInt(query.limit) : 20;
            const category = query.category as FileCategory | 'all';
            const search = query.search || '';
            const sortBy = query.sortBy as any;
            const sortOrder = query.sortOrder as 'asc' | 'desc';

            return storageService.listFiles({
                page,
                limit,
                category,
                search,
                sortBy,
                sortOrder,
            });
        },
        {
            query: t.Object({
                page: t.Optional(t.String()),
                limit: t.Optional(t.String()),
                category: t.Optional(t.String()),
                search: t.Optional(t.String()),
                sortBy: t.Optional(t.String()),
                sortOrder: t.Optional(t.String()),
            }),
        }
    )

    // GET /api/files/stats/overview - Get stats
    .get('/stats/overview', async () => {
        return {
            success: true,
            data: await storageService.getStats(),
        };
    })

    // POST /api/files/cleanup - Cleanup expired files (Admin only)
    .use(requireAdmin)
    .post('/cleanup', async () => {
        const count = await storageService.cleanupExpired();
        return {
            success: true,
            message: `Cleaned up ${count} expired files`,
            count,
        };
    })

    // GET /api/files/:id - Get file details
    .get('/:id', ({ params, set }) => {
        const file = storageService.getFile(params.id);
        if (!file) {
            set.status = 404;
            return {
                success: false,
                error: 'Not Found',
                message: 'File not found',
            };
        }
        return {
            success: true,
            data: file,
        };
    })

    // PATCH /api/files/:id - Update file
    .use(requireAuth)
    .patch(
        '/:id',
        async ({ params, body, set }) => {
            const updates = {
                isPublic: body.isPublic,
                tags: body.tags,
                expiresAt: body.expiresIn ? Date.now() + body.expiresIn * 1000 : undefined,
            };

            const updated = await storageService.updateFile(params.id, updates);

            if (!updated) {
                set.status = 404;
                return {
                    success: false,
                    error: 'Not Found',
                    message: 'File not found',
                };
            }

            return {
                success: true,
                data: updated,
                message: 'File updated successfully',
            };
        },
        {
            body: t.Object({
                isPublic: t.Optional(t.Boolean()),
                tags: t.Optional(t.Array(t.String())),
                expiresIn: t.Optional(t.Number()),
            }),
        }
    )

    // DELETE /api/files/:id - Delete file
    .use(requireAuth)
    .delete('/:id', async ({ params, set }) => {
        const success = await storageService.deleteFile(params.id);

        if (!success) {
            set.status = 404;
            return {
                success: false,
                error: 'Not Found',
                message: 'File not found or could not be deleted',
            };
        }

        return {
            success: true,
            message: 'File deleted successfully',
        };
    })

    // POST /api/files/delete-multiple - Delete multiple files
    .use(requireAuth)
    .post(
        '/delete-multiple',
        async ({ body }) => {
            const { ids } = body;
            const result = await storageService.deleteMultiple(ids);

            return {
                success: true,
                data: result,
                message: `Deleted ${result.deleted.length} files, failed ${result.failed.length}`,
            };
        },
        {
            body: t.Object({
                ids: t.Array(t.String()),
            }),
        }
    );
