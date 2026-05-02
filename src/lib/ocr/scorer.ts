import type {
    InvoiceData,
    ReconciliationReport,
    FieldReconciliation,
    ValidationScore,
    ConfidenceLevel,
} from './types';

// Campos obligatorios y su peso en el bucket de completeness (suma = 20)
const COMPLETENESS_WEIGHTS: Partial<Record<keyof InvoiceData, number>> = {
    cuit_emisor:     4,
    total:           4,
    tipo_factura:    3,
    numero_factura:  3,
    fecha_emision:   3,
    cae:             3,
};

// Puntos para cada resultado de match en los campos críticos
const MATCH_POINTS: Record<'exact' | 'normalized' | 'qr_only' | 'both_null' | 'mismatch' | 'ocr_only', number> = {
    exact:      1.0,
    normalized: 1.0,
    qr_only:    0.5,   // OCR no pudo extraerlo pero el QR lo tiene
    both_null:  0.5,   // ninguna fuente lo tiene; penalizar pero no al máximo
    ocr_only:   0.5,   // QR no incluye el campo (raro para campos críticos)
    mismatch:   0.0,
};

export class ScoringEngine {

    /**
     * Calcula el ValidationScore 0-100 a partir de:
     *  - ReconciliationReport: resultado de comparar QR vs OCR
     *  - InvoiceData (limpiado): para evaluar completeness y coherencia de montos
     *
     * Desglose de puntaje:
     *   qr_presence    (0-20): ¿se pudo decodificar el QR?
     *   critical_fields (0-40): CAE + CUIT emisor + total
     *   amount_coherence (0-20): subtotal + IVA ≈ total
     *   completeness   (0-20): campos obligatorios presentes
     */
    static score(
        reconciliation: ReconciliationReport,
        invoice: InvoiceData,
    ): ValidationScore {
        const qr_presence     = this.scoreQrPresence(reconciliation);
        const critical_fields  = this.scoreCriticalFields(reconciliation, invoice);
        const amount_coherence = this.scoreAmountCoherence(invoice);
        const completeness     = this.scoreCompleteness(invoice);

        const total = Math.round(qr_presence + critical_fields + amount_coherence + completeness);

        return {
            total,
            confidence: this.toConfidence(total, reconciliation),
            breakdown: { qr_presence, critical_fields, amount_coherence, completeness },
        };
    }

    // ── Buckets ───────────────────────────────────────────────────────────────

    /** 20 pts planos si el QR fue decodificado; 0 si se procesó solo con OCR. */
    private static scoreQrPresence(r: ReconciliationReport): number {
        return r.has_qr ? 20 : 0;
    }

    /**
     * Evalúa los tres campos más críticos: CUIT emisor, CAE y total (40 pts).
     *
     * Con QR: compara QR vs OCR usando los resultados del ReconciliationReport.
     * Sin QR: valida presencia y formato básico solo con los datos del OCR.
     *
     * Pesos: CUIT=15, CAE=15, total=10.
     */
    private static scoreCriticalFields(
        r: ReconciliationReport,
        invoice: InvoiceData,
    ): number {
        const weights: Record<'cuit_emisor' | 'cae' | 'total', number> = {
            cuit_emisor: 15,
            cae:         15,
            total:       10,
        };

        let pts = 0;

        if (r.has_qr) {
            // Con QR: usar los resultados de reconciliación
            const fieldMap = new Map<keyof InvoiceData, FieldReconciliation>(
                r.fields.map(f => [f.field, f]),
            );

            for (const [field, weight] of Object.entries(weights) as [keyof typeof weights, number][]) {
                const rec = fieldMap.get(field);
                if (!rec) {
                    // Campo no incluido en el QR (ej: cuit_receptor en barcode)
                    pts += weight * 0.5;
                    continue;
                }
                pts += weight * MATCH_POINTS[rec.match];
            }
        } else {
            // Sin QR: solo verificar presencia y formato
            pts += this.presenceScore(invoice.cuit_emisor, weights.cuit_emisor, v => /^\d{11}$/.test(v.replace(/\D/g, '')));
            pts += this.presenceScore(invoice.cae,         weights.cae,         v => v.replace(/\D/g, '').length === 14);
            pts += this.presenceScore(invoice.total,       weights.total,        v => Number(v) > 0);
        }

        return Math.min(40, pts);
    }

    /**
     * Evalúa la coherencia interna de los montos (20 pts).
     *
     * - subtotal + iva ≈ total (dentro de $0.05): 20 pts
     * - total presente pero subtotal o iva faltan: 10 pts (no verificable)
     * - total ausente: 0 pts
     * - total presente, subtotal e iva presentes pero no cuadran: 0 pts
     */
    private static scoreAmountCoherence(invoice: InvoiceData): number {
        const { total, subtotal, iva } = invoice;

        if (total == null) return 0;
        if (subtotal == null || iva == null) return 10;

        const diff = Math.abs(total - (subtotal + iva));
        return diff <= 0.05 ? 20 : 0;
    }

    /**
     * Evalúa cuántos campos obligatorios están presentes (20 pts).
     * Cada campo tiene su peso; la suma de pesos es 20.
     */
    private static scoreCompleteness(invoice: InvoiceData): number {
        let pts = 0;
        for (const [field, weight] of Object.entries(COMPLETENESS_WEIGHTS) as [keyof InvoiceData, number][]) {
            const value = (invoice as unknown as Record<string, unknown>)[field];
            if (value !== null && value !== undefined && value !== '') {
                pts += weight;
            }
        }
        return pts;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Otorga puntos proporcionales según la presencia de un campo.
     * Si pasa el validador: puntaje completo.
     * Si el campo existe pero no pasa: mitad.
     * Si es null/vacío: 0.
     */
    private static presenceScore(
        value: string | number | null,
        weight: number,
        validator: (v: string) => boolean,
    ): number {
        if (value === null || value === undefined || value === '') return 0;
        return validator(String(value)) ? weight : weight * 0.5;
    }

    /**
     * Convierte el puntaje numérico a nivel de confianza.
     * Si hay critical_mismatches, la confianza cae a 'baja' como mínimo
     * sin importar el puntaje (puede ocurrir si el QR está corrupto y el OCR
     * compensó con puntaje de completeness).
     */
    private static toConfidence(total: number, r: ReconciliationReport): ConfidenceLevel {
        const hasCritical = r.critical_mismatches.length > 0;

        if (total >= 80 && !hasCritical) return 'alta';
        if (total >= 60 && !hasCritical) return 'media';
        if (total >= 30) return 'baja';
        return 'no_procesado';
    }
}
