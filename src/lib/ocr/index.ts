export * from './types';
export * from './cuit';
export * from './extractor';
export * from './parser';
export * from './cleaner';
export * from './api';
export * from './qr-extractor';
export * from './pipeline';

import { FastDocuOCR } from './pipeline';

/**
 * Singleton del orquestador OCR para toda la aplicación.
 */
export const DocumentScanner = new FastDocuOCR();
