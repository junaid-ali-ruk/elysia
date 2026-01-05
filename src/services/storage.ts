import { join } from 'path';
import { mkdir, readdir, unlink } from 'fs/promises';
import { lookup } from 'mime-types';
import {
    generateFileId,
    getFileCategory,
    generateChecksum,
    sanitizeFilename,
    getExtension,
    isImage,
    validateFile,
} from '../utils/helpers';
import { imageService } from './image';
import type {
    FileMetadata,
    FileCategory,
    UploadOptions,
    StorageStats,
    ListFilesParams,
} from '../types';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Storage service for file operations with JSON metadata persistence
 */
class StorageService {
    private files: Map<string, FileMetadata> = new Map();
    private initialized = false;

    private uploadsDir = './uploads';
    private dataDir = './data';
    private metadataPath = './data/files.json';

    /**
     * Initialize directories and load metadata
     */
    async init(): Promise<void> {
        if (this.initialized) return;

        // Create directories
        const dirs = [
            this.uploadsDir,
            join(this.uploadsDir, 'images'),
            join(this.uploadsDir, 'documents'),
            join(this.uploadsDir, 'videos'),
            join(this.uploadsDir, 'audio'),
            join(this.uploadsDir, 'others'),
            join(this.uploadsDir, 'thumbnails'),
            './cache',
            this.dataDir,
        ];

        for (const dir of dirs) {
            await mkdir(dir, { recursive: true });
        }

        // Load existing metadata
        await this.loadMetadata();
        this.initialized = true;
        console.log(`📦 Storage initialized with ${this.files.size} files`);
    }

    /**
     * Load metadata from JSON file
     */
    private async loadMetadata(): Promise<void> {
        try {
            const file = Bun.file(this.metadataPath);
            if (await file.exists()) {
                const data = await file.json();
                this.files = new Map(Object.entries(data));
            }
        } catch (error) {
            console.error('Failed to load metadata:', error);
            this.files = new Map();
        }
    }

    /**
     * Save metadata to JSON file
     */
    private async saveMetadata(): Promise<void> {
        const data = Object.fromEntries(this.files);
        await Bun.write(this.metadataPath, JSON.stringify(data, null, 2));
    }

    /**
     * Upload a single file
     */
    async upload(file: File, options: UploadOptions = {}): Promise<FileMetadata> {
        const mimeType = file.type || lookup(file.name) || 'application/octet-stream';
        const size = file.size;

        // Validate file
        const validation = validateFile(mimeType, size);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // Generate file info
        const id = generateFileId();
        const category = getFileCategory(mimeType);
        const ext = getExtension(file.name);
        const fileName = `${id}.${ext}`;
        const filePath = join(this.uploadsDir, category, fileName);

        // Generate checksum
        const buffer = await file.arrayBuffer();
        const checksum = await generateChecksum(buffer);

        // Check for duplicates
        for (const [existingId, meta] of this.files) {
            if (meta.checksum === checksum) {
                console.log(`Duplicate file detected: ${existingId}`);
                return meta; // Return existing file
            }
        }

        // Write file to disk
        await Bun.write(filePath, buffer);

        // Get image dimensions and generate thumbnail
        let width: number | undefined;
        let height: number | undefined;
        let thumbnailUrl: string | undefined;

        if (isImage(mimeType)) {
            // Get dimensions
            try {
                const dimensions = await imageService.getMetadata(filePath);
                width = dimensions.width;
                height = dimensions.height;
            } catch {
                // Non-critical error
            }

            // Generate thumbnail if requested
            if (options.generateThumbnail !== false) {
                const thumbPath = join(this.uploadsDir, 'thumbnails', `${id}.jpg`);
                try {
                    await imageService.generateThumbnail(filePath, thumbPath);
                    thumbnailUrl = `${BASE_URL}/cdn/thumb/${id}`;
                } catch {
                    // Non-critical error
                }
            }

            // Resize if maxWidth/maxHeight specified
            if (options.maxWidth || options.maxHeight) {
                try {
                    const resizedBuffer = await imageService.transform(filePath, {
                        width: options.maxWidth,
                        height: options.maxHeight,
                        quality: options.quality || 85,
                        fit: 'inside',
                    });
                    await Bun.write(filePath, resizedBuffer);

                    // Update dimensions after resize
                    const newDimensions = await imageService.getMetadata(filePath);
                    width = newDimensions.width;
                    height = newDimensions.height;
                } catch {
                    // Keep original if resize fails
                }
            }
        }

        // Create metadata
        const metadata: FileMetadata = {
            id,
            originalName: file.name,
            fileName,
            mimeType,
            size,
            category,
            path: filePath,
            url: `${BASE_URL}/cdn/${id}`,
            thumbnailUrl,
            width,
            height,
            uploadedAt: Date.now(),
            expiresAt: options.expiresIn ? Date.now() + options.expiresIn * 1000 : undefined,
            downloads: 0,
            isPublic: options.isPublic ?? true,
            checksum,
            tags: options.tags,
        };

        // Save metadata
        this.files.set(id, metadata);
        await this.saveMetadata();

        return metadata;
    }

    /**
     * Upload multiple files
     */
    async uploadMultiple(files: File[], options: UploadOptions = {}): Promise<FileMetadata[]> {
        const results: FileMetadata[] = [];
        for (const file of files) {
            const metadata = await this.upload(file, options);
            results.push(metadata);
        }
        return results;
    }

    /**
     * Get file metadata by ID
     */
    getFile(id: string): FileMetadata | undefined {
        return this.files.get(id);
    }

    /**
     * Get file content by ID
     */
    async getFileContent(
        id: string
    ): Promise<{ file: ReturnType<typeof Bun.file>; metadata: FileMetadata } | null> {
        const metadata = this.files.get(id);
        if (!metadata) return null;

        // Check expiration
        if (metadata.expiresAt && metadata.expiresAt < Date.now()) {
            await this.deleteFile(id);
            return null;
        }

        // Increment download counter
        metadata.downloads++;
        await this.saveMetadata();

        return {
            file: Bun.file(metadata.path),
            metadata,
        };
    }

    /**
     * Get thumbnail file
     */
    async getThumbnail(id: string): Promise<ReturnType<typeof Bun.file> | null> {
        const metadata = this.files.get(id);
        if (!metadata || !metadata.thumbnailUrl) return null;

        const thumbPath = join(this.uploadsDir, 'thumbnails', `${id}.jpg`);
        const file = Bun.file(thumbPath);

        if (await file.exists()) {
            return file;
        }

        return null;
    }

    /**
     * List files with pagination and filters
     */
    listFiles(params: ListFilesParams = {}): {
        files: FileMetadata[];
        total: number;
        page: number;
        totalPages: number;
    } {
        const {
            page = 1,
            limit = 20,
            category = 'all',
            search = '',
            sortBy = 'uploadedAt',
            sortOrder = 'desc',
        } = params;

        let fileArray = Array.from(this.files.values());

        // Filter by category
        if (category !== 'all') {
            fileArray = fileArray.filter(f => f.category === category);
        }

        // Filter by search term
        if (search) {
            const searchLower = search.toLowerCase();
            fileArray = fileArray.filter(
                f =>
                    f.originalName.toLowerCase().includes(searchLower) ||
                    f.tags?.some(t => t.toLowerCase().includes(searchLower))
            );
        }

        // Sort
        fileArray.sort((a, b) => {
            let aVal: string | number = a[sortBy] as string | number;
            let bVal: string | number = b[sortBy] as string | number;

            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = (bVal as string).toLowerCase();
            }

            if (sortOrder === 'asc') {
                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            }
            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        });

        // Paginate
        const total = fileArray.length;
        const totalPages = Math.ceil(total / limit);
        const start = (page - 1) * limit;
        const files = fileArray.slice(start, start + limit);

        return { files, total, page, totalPages };
    }

    /**
     * Delete a file
     */
    async deleteFile(id: string): Promise<boolean> {
        const metadata = this.files.get(id);
        if (!metadata) return false;

        try {
            // Delete main file
            await unlink(metadata.path);

            // Delete thumbnail if exists
            if (metadata.thumbnailUrl) {
                const thumbPath = join(this.uploadsDir, 'thumbnails', `${id}.jpg`);
                try {
                    await unlink(thumbPath);
                } catch {
                    // Thumbnail might not exist
                }
            }

            // Clear cache
            await imageService.clearCache(id);

            // Remove from metadata
            this.files.delete(id);
            await this.saveMetadata();

            return true;
        } catch (error) {
            console.error(`Failed to delete file ${id}:`, error);
            return false;
        }
    }

    /**
     * Delete multiple files
     */
    async deleteMultiple(ids: string[]): Promise<{ deleted: string[]; failed: string[] }> {
        const deleted: string[] = [];
        const failed: string[] = [];

        for (const id of ids) {
            const success = await this.deleteFile(id);
            if (success) {
                deleted.push(id);
            } else {
                failed.push(id);
            }
        }

        return { deleted, failed };
    }

    /**
     * Update file metadata
     */
    async updateFile(
        id: string,
        updates: Partial<Pick<FileMetadata, 'isPublic' | 'tags' | 'expiresAt'>>
    ): Promise<FileMetadata | null> {
        const metadata = this.files.get(id);
        if (!metadata) return null;

        // Apply updates
        if (updates.isPublic !== undefined) {
            metadata.isPublic = updates.isPublic;
        }
        if (updates.tags !== undefined) {
            metadata.tags = updates.tags;
        }
        if (updates.expiresAt !== undefined) {
            metadata.expiresAt = updates.expiresAt;
        }

        await this.saveMetadata();
        return metadata;
    }

    /**
     * Get storage statistics
     */
    async getStats(): Promise<StorageStats> {
        const byCategory: Record<FileCategory, { count: number; size: number }> = {
            images: { count: 0, size: 0 },
            documents: { count: 0, size: 0 },
            videos: { count: 0, size: 0 },
            audio: { count: 0, size: 0 },
            others: { count: 0, size: 0 },
        };

        let totalSize = 0;

        for (const metadata of this.files.values()) {
            byCategory[metadata.category].count++;
            byCategory[metadata.category].size += metadata.size;
            totalSize += metadata.size;
        }

        return {
            totalFiles: this.files.size,
            totalSize,
            byCategory,
        };
    }

    /**
     * Cleanup expired files
     */
    async cleanupExpired(): Promise<number> {
        const now = Date.now();
        let count = 0;

        for (const [id, metadata] of this.files) {
            if (metadata.expiresAt && metadata.expiresAt < now) {
                await this.deleteFile(id);
                count++;
            }
        }

        return count;
    }
}

// Export singleton instance
export const storageService = new StorageService();
