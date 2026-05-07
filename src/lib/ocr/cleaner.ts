import { CuitValidator } from './cuit';
import type { InvoiceData } from './types';

/**
 * Limpieza y post-procesamiento de datos extraídos.
 * Corrige artefactos OCR, normaliza formatos y cross-valida montos.
 */
export class InvoiceCleaner {

    static clean(raw: InvoiceData): { cleaned: InvoiceData; warnings: string[] } {
        const warnings: string[] = [];
        const cleaned = { ...raw };

        // ─── Formatear CUITs ────────────────────────────────────────────────
        if (cleaned.cuit_emisor) {
            cleaned.cuit_emisor = this.formatCuit(cleaned.cuit_emisor);
            if (!CuitValidator.isValid(cleaned.cuit_emisor.replace(/\D/g, ''))) {
                warnings.push(`CUIT emisor ${cleaned.cuit_emisor} no pasa validación Módulo 11.`);
            }
        }
        if (cleaned.cuit_receptor) {
            cleaned.cuit_receptor = this.formatCuit(cleaned.cuit_receptor);
            if (!CuitValidator.isValid(cleaned.cuit_receptor.replace(/\D/g, ''))) {
                warnings.push(`CUIT receptor ${cleaned.cuit_receptor} no pasa validación Módulo 11.`);
            }
        }

        // ─── Cross-Validación de Montos ─────────────────────────────────────
        // Factura A/M: IVA es adicional → subtotal + iva = total
        // Factura B/C y resto: IVA Contenido (ya incluido) → total = subtotal
        const tipoFactura = cleaned.tipo_factura?.toUpperCase() ?? '';
        const ivaAdicional = tipoFactura === 'A' || tipoFactura === 'M';

        if (cleaned.total != null && cleaned.subtotal != null && cleaned.iva != null) {
            if (ivaAdicional) {
                const diff = Math.abs(cleaned.total - (cleaned.subtotal + cleaned.iva));
                if (diff > 0.05) {
                    warnings.push(`Cross-validación: Total (${cleaned.total}) ≠ Subtotal (${cleaned.subtotal}) + IVA (${cleaned.iva}). Diferencia: ${diff.toFixed(2)}`);
                }
            } else {
                // IVA Contenido: el total debe coincidir con el subtotal
                const diff = Math.abs(cleaned.total - cleaned.subtotal);
                if (diff > 0.05) {
                    warnings.push(`Cross-validación: Total (${cleaned.total}) ≠ Subtotal (${cleaned.subtotal}). Diferencia: ${diff.toFixed(2)}`);
                }
            }
        }

        // ─── Inferir IVA si falta ───────────────────────────────────────────
        if (cleaned.iva == null && cleaned.total != null && cleaned.subtotal != null) {
            if (ivaAdicional) {
                // Factura A/M: iva = total - subtotal
                cleaned.iva = Math.round((cleaned.total - cleaned.subtotal) * 100) / 100;
                if (cleaned.iva < 0) cleaned.iva = 0;
            }
            // Factura B/C: IVA contenido no se puede inferir de total y subtotal
        }

        // ─── Inferir Subtotal si falta ──────────────────────────────────────
        if (cleaned.subtotal == null && cleaned.total != null) {
            if (!ivaAdicional) {
                // Factura B/C: subtotal = total (IVA ya incluido)
                cleaned.subtotal = cleaned.total;
            } else if (!cleaned.iva || cleaned.iva === 0) {
                cleaned.subtotal = cleaned.total;
            } else {
                // Factura A: subtotal = total - iva
                cleaned.subtotal = Math.round((cleaned.total - cleaned.iva) * 100) / 100;
            }
        }

        // ─── Validar Fecha ──────────────────────────────────────────────────
        if (cleaned.fecha_emision && !/^\d{4}-\d{2}-\d{2}$/.test(cleaned.fecha_emision)) {
            warnings.push(`Fecha de emisión con formato inesperado: ${cleaned.fecha_emision}`);
        }
        if (cleaned.fecha_vencimiento_cae && !/^\d{4}-\d{2}-\d{2}$/.test(cleaned.fecha_vencimiento_cae)) {
            warnings.push(`Fecha vto. CAE con formato inesperado: ${cleaned.fecha_vencimiento_cae}`);
        }

        // ─── Validar CAE ────────────────────────────────────────────────────
        if (cleaned.cae && cleaned.cae.length !== 14) {
            warnings.push(`CAE tiene ${cleaned.cae.length} dígitos en lugar de 14.`);
        }

        // ─── Campos vacíos ──────────────────────────────────────────────────
        const required: (keyof InvoiceData)[] = ['tipo_factura', 'numero_factura', 'fecha_emision', 'cuit_emisor', 'total', 'cae'];
        for (const field of required) {
            if (cleaned[field] == null || cleaned[field] === '') {
                warnings.push(`Campo obligatorio '${field}' no pudo ser extraído.`);
            }
        }

        return { cleaned, warnings };
    }

    /**
     * Formatea un CUIT de 11 dígitos como XX-XXXXXXXX-X
     */
    private static formatCuit(cuit: string): string {
        const digits = cuit.replace(/\D/g, '');
        if (digits.length !== 11) return cuit;
        return `${digits.substring(0, 2)}-${digits.substring(2, 10)}-${digits.substring(10)}`;
    }
}
