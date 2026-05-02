import type { Document, ValidationResult, ValidationIssue, DocumentStatus } from '@/types';

// ─── CUIT Validator ───────────────────────────────────────────────────────────
// Expected format: XX-XXXXXXXX-X (with dashes)
export function validateCUIT(cuit: string): { valid: boolean; message?: string } {
    if (!cuit || cuit.trim() === '') {
        return { valid: false, message: 'CUIT vacío o ausente.' };
    }

    const cleaned = cuit.replace(/-/g, '');

    if (!/^\d{11}$/.test(cleaned)) {
        return { valid: false, message: `CUIT inválido: "${cuit}". Debe tener 11 dígitos.` };
    }

    // Checksum verification (AFIP algorithm)
    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const digits = cleaned.split('').map(Number);
    const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0);
    const remainder = sum % 11;
    const checkDigit = remainder === 0 ? 0 : remainder === 1 ? 9 : 11 - remainder;

    if (checkDigit !== digits[10]) {
        return { valid: false, message: `CUIT con dígito verificador incorrecto: "${cuit}".` };
    }

    return { valid: true };
}

// ─── IVA Calculator ───────────────────────────────────────────────────────────

export function calculateExpectedIVA(neto: number, rate: number): number {
    return Math.round((neto * rate) / 100 * 100) / 100;
}

// ─── Total Validator ──────────────────────────────────────────────────────────
// Allows a ±$0.10 floating-point tolerance

export function validateTotal(
    neto: number,
    iva: number,
    total: number,
    tolerance = 0.1
): { valid: boolean; expected: number; diff: number } {
    const expected = Math.round((neto + iva) * 100) / 100;
    const diff = Math.abs(total - expected);
    return { valid: diff <= tolerance, expected, diff };
}

// ─── IVA Coherence ────────────────────────────────────────────────────────────

export function validateIVA(
    neto: number,
    iva: number,
    rate: number,
    tolerance = 0.5
): { valid: boolean; expected: number; diff: number } {
    const expected = calculateExpectedIVA(neto, rate);
    const diff = Math.abs(iva - expected);
    return { valid: diff <= tolerance, expected, diff };
}

// ─── CAE Validator ────────────────────────────────────────────────────────────

export function validateCAE(cae: string | undefined): { valid: boolean; message?: string } {
    if (!cae || cae.trim() === '') {
        return { valid: false, message: 'CAE ausente o vacío.' };
    }
    if (!/^\d{14}$/.test(cae)) {
        return { valid: false, message: `CAE inválido: debe tener 14 dígitos numéricos.` };
    }
    return { valid: true };
}

// ─── QR Validator (stub) ──────────────────────────────────────────────────────

export function validateQR(qrCode: string | undefined): { valid: boolean; message?: string } {
    if (!qrCode || qrCode.trim() === '') {
        return { valid: false, message: 'QR no presente en el documento.' };
    }
    // Simulate: if URL contains afip.gob.ar → valid
    if (qrCode.includes('afip.gob.ar')) {
        return { valid: true };
    }
    return { valid: false, message: 'QR presente pero no corresponde a AFIP.' };
}

// ─── Duplicate Detector ───────────────────────────────────────────────────────

export function detectDuplicate(doc: Document, allDocs: Document[]): boolean {
    const compositeKey = `${doc.cuit}-${doc.puntoVenta}-${doc.numeroComprobante}-${doc.type}`;
    const matches = allDocs.filter(
        (d) =>
            d.id !== doc.id &&
            `${d.cuit}-${d.puntoVenta}-${d.numeroComprobante}-${d.type}` === compositeKey
    );
    return matches.length > 0;
}

// ─── Fields Completeness Check ────────────────────────────────────────────────

export function checkCamposCompletos(doc: Document): { complete: boolean; missingFields: string[] } {
    const required: (keyof Document)[] = ['cuit', 'fecha', 'neto', 'total', 'puntoVenta', 'numeroComprobante'];
    const missing = required.filter((field) => {
        const val = doc[field];
        return val === undefined || val === null || val === '' || val === 0;
    });
    return { complete: missing.length === 0, missingFields: missing as string[] };
}

// ─── Format helpers ───────────────────────────────────────────────────────────

export function formatCurrency(amount: number, currency: 'ARS' | 'USD' = 'ARS'): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
    }).format(amount);
}

export function formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
