import { nanoid } from 'nanoid';
import type { FileCategory } from '../types';

/**
 * Generate unique 12-character file ID
 */
export function generateFileId(): string {
    return nanoid(12);
}

/**
 * Determine file category based on MIME type
 */
export function getFileCategory(mimeType: string): FileCategory {
    if (mimeType.startsWith('image/')) return 'images';
    if (mimeType.startsWith('video/')) return 'videos';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (
        mimeType === 'application/pdf' ||
        mimeType.includes('document') ||
        mimeType.includes('text') ||
        mimeType.includes('spreadsheet') ||
        mimeType.includes('presentation')
    ) {
        return 'documents';
    }
    return 'others';
}

/**
 * Format bytes as human-readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Generate SHA-256 checksum from buffer
 */
export async function generateChecksum(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sanitize filename for safe storage
 */
export function sanitizeFilename(filename: string): string {
    return filename
        .toLowerCase()
        .replace(/[^a-z0-9.-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

/**
 * Get file extension without dot
 */
export function getExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/**
 * Check if MIME type is an image
 */
export function isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
}

/**
 * File size limits by category (in bytes)
 */
const MAX_SIZES: Record<FileCategory, number> = {
    images: 10 * 1024 * 1024,      // 10 MB
    documents: 50 * 1024 * 1024,   // 50 MB
    videos: 500 * 1024 * 1024,     // 500 MB
    audio: 50 * 1024 * 1024,       // 50 MB
    others: 25 * 1024 * 1024,      // 25 MB
};

/**
 * Allowed MIME types by category
 */
const ALLOWED_TYPES: Record<FileCategory, string[]> = {
    images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif'],
    documents: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
        'text/markdown',
    ],
    videos: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac'],
    others: [], // Accept any type for "others"
};

/**
 * Validate file type and size
 */
export function validateFile(
    mimeType: string,
    size: number
): { valid: boolean; error?: string } {
    const category = getFileCategory(mimeType);

    // Check file size
    const maxSize = MAX_SIZES[category];
    if (size > maxSize) {
        return {
            valid: false,
            error: `File size exceeds maximum allowed for ${category} (${formatBytes(maxSize)})`,
        };
    }

    // Check MIME type (only for specific categories)
    const allowedTypes = ALLOWED_TYPES[category];
    if (allowedTypes.length > 0 && !allowedTypes.includes(mimeType)) {
        return {
            valid: false,
            error: `File type ${mimeType} is not allowed for ${category}`,
        };
    }

    return { valid: true };
}

/**
 * Generate cache key for transformed images
 */
export function generateCacheKey(
    fileId: string,
    options: Record<string, unknown>
): string {
    const optionsStr = Object.entries(options)
        .filter(([_, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('_');
    return `${fileId}_${optionsStr}`;
}
