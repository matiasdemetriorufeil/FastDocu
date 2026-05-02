import type {
    InvoiceData,
    FieldReconciliation,
    FieldMatch,
    ReconciliationSeverity,
    ReconciliationReport,
    QrSource,
} from './types';

// Campos que el QR AFIP puede aportar y por tanto son reconciliables.
// Orden importa: se evalúan en este orden en el reporte.
const RECONCILABLE_FIELDS: (keyof InvoiceData)[] = [
    'cuit_emisor',
    'cae',
    'total',
    'tipo_factura',
    'numero_factura',
    'fecha_emision',
    'cuit_receptor',
];

// Severidad por campo cuando hay mismatch
const MISMATCH_SEVERITY: Record<keyof InvoiceData, ReconciliationSeverity> = {
    cuit_emisor:            'critical',
    cae:                    'critical',
    total:                  'critical',  // re-evaluado dinámicamente según tolerancia
    tipo_factura:           'critical',
    numero_factura:         'warning',
    fecha_emision:          'warning',
    cuit_receptor:          'warning',
    // OCR-only — nunca producen mismatch, pero incluidos para completitud
    razon_social_emisor:    'info',
    domicilio_comercial:    'info',
    condicion_iva:          'info',
    razon_social_receptor:  'info',
    condicion_iva_receptor: 'info',
    domicilio_receptor:     'info',
    condicion_venta:        'info',
    descripcion:            'info',
    periodo:                'info',
    fecha_vencimiento_pago: 'info',
    subtotal:               'info',
    iva:                    'info',
    fecha_vencimiento_cae:  'info',
};

export class ReconciliationEngine {

    /**
     * Compara los datos del QR contra los datos del OCR limpiados.
     * Solo evalúa los campos que el QR puede proveer.
     * Es una función pura: no lanza excepciones ni tiene efectos secundarios.
     */
    static reconcile(
        qrData: Partial<InvoiceData>,
        ocrData: InvoiceData,
        qrSource: QrSource,
    ): ReconciliationReport {
        const fields: FieldReconciliation[] = [];
        const critical_mismatches: (keyof InvoiceData)[] = [];
        const warning_mismatches:  (keyof InvoiceData)[] = [];

        for (const field of RECONCILABLE_FIELDS) {
            // El QR no incluye este campo en absoluto → saltar
            if (!(field in qrData)) continue;

            const qrRaw  = (qrData  as unknown as Record<string, unknown>)[field] as string | number | null;
            const ocrRaw = (ocrData as unknown as Record<string, unknown>)[field] as string | number | null;

            const rec = this.compareField(field, qrRaw, ocrRaw);
            fields.push(rec);

            if (rec.match === 'mismatch') {
                if (rec.severity === 'critical') critical_mismatches.push(field);
                else if (rec.severity === 'warning') warning_mismatches.push(field);
            }
        }

        return {
            has_qr: true,
            qr_source: qrSource,
            fields,
            critical_mismatches,
            warning_mismatches,
        };
    }

    /** Reporte vacío para el caso en que no hay QR disponible. */
    static noQr(): ReconciliationReport {
        return {
            has_qr: false,
            qr_source: null,
            fields: [],
            critical_mismatches: [],
            warning_mismatches: [],
        };
    }

    // ── Comparación por campo ─────────────────────────────────────────────────

    private static compareField(
        field: keyof InvoiceData,
        qrRaw:  string | number | null,
        ocrRaw: string | number | null,
    ): FieldReconciliation {
        if (qrRaw === null && ocrRaw === null) {
            return this.rec(field, qrRaw, ocrRaw, 'both_null', 'info');
        }
        if (qrRaw !== null && (ocrRaw === null || ocrRaw === '')) {
            return this.rec(field, qrRaw, ocrRaw, 'qr_only', 'info');
        }
        if (qrRaw === null && ocrRaw !== null) {
            return this.rec(field, qrRaw, ocrRaw, 'ocr_only', 'info');
        }

        // Ambas fuentes tienen valor → comparar según tipo de campo
        switch (field) {
            case 'cuit_emisor':
            case 'cuit_receptor':
                return this.compareCuit(field, String(qrRaw), String(ocrRaw));

            case 'numero_factura':
                return this.compareNumeroFactura(field, String(qrRaw), String(ocrRaw));

            case 'total':
                return this.compareTotal(Number(qrRaw), Number(ocrRaw));

            case 'cae':
                return this.compareExact(field, String(qrRaw), String(ocrRaw));

            case 'tipo_factura':
                return this.compareExact(field, String(qrRaw), String(ocrRaw));

            case 'fecha_emision':
                return this.compareExact(field, String(qrRaw), String(ocrRaw));

            default:
                return this.compareExact(field, String(qrRaw), String(ocrRaw));
        }
    }

    // ── Comparadores especializados ───────────────────────────────────────────

    /** Compara CUITs ignorando guiones y espacios. */
    private static compareCuit(
        field: keyof InvoiceData,
        qr: string,
        ocr: string,
    ): FieldReconciliation {
        const normQr  = qr.replace(/\D/g, '');
        const normOcr = ocr.replace(/\D/g, '');
        const sameRaw = qr === ocr;
        const sameNorm = normQr === normOcr;

        if (sameRaw) return this.rec(field, qr, ocr, 'exact', 'info');
        if (sameNorm) return this.rec(field, normQr, normOcr, 'normalized', 'info', 'Diferencia solo en formato (guiones)');
        return this.rec(field, normQr, normOcr, 'mismatch', MISMATCH_SEVERITY[field]);
    }

    /**
     * Compara números de factura normalizando ceros líderes en cada parte.
     * "0001-00000407" === "1-407" → normalized
     * También maneja el caso sin separador: "000100000407" → "1-407"
     */
    private static compareNumeroFactura(
        field: keyof InvoiceData,
        qr: string,
        ocr: string,
    ): FieldReconciliation {
        const normalize = (s: string): string => {
            const clean = s.replace(/\s/g, '');
            // Con separador: "0001-00000407"
            const parts = clean.match(/^(\d+)[\/\-](\d+)$/);
            if (parts) {
                return `${parseInt(parts[1], 10)}-${parseInt(parts[2], 10)}`;
            }
            // Sin separador de 12 dígitos: punto de venta 4 + número 8
            if (/^\d{12}$/.test(clean)) {
                return `${parseInt(clean.slice(0, 4), 10)}-${parseInt(clean.slice(4), 10)}`;
            }
            return clean;
        };

        const normQr  = normalize(qr);
        const normOcr = normalize(ocr);

        if (qr === ocr)       return this.rec(field, qr, ocr, 'exact', 'info');
        if (normQr === normOcr) return this.rec(field, normQr, normOcr, 'normalized', 'info', 'Diferencia solo en ceros líderes');
        return this.rec(field, normQr, normOcr, 'mismatch', MISMATCH_SEVERITY[field]);
    }

    /**
     * Compara totales con tolerancia dinámica:
     * - Hasta $500 ARS: tolerancia fija $0.05
     * - Más de $500 ARS: tolerancia 0.01% del monto mayor
     * La tolerancia pequeña se aplica solo si coinciden después de redondeo;
     * si la diferencia es ≥ 1% del total siempre es critical.
     */
    private static compareTotal(
        qrTotal: number,
        ocrTotal: number,
    ): FieldReconciliation {
        const diff = Math.abs(qrTotal - ocrTotal);
        const base = Math.max(Math.abs(qrTotal), Math.abs(ocrTotal));
        const pct  = base > 0 ? diff / base : 0;

        // Coincidencia exacta
        if (diff === 0) {
            return this.rec('total', qrTotal, ocrTotal, 'exact', 'info');
        }

        // Dentro de tolerancia → normalizado
        const tolerance = base > 500 ? base * 0.0001 : 0.05;
        if (diff <= tolerance) {
            return this.rec(
                'total', qrTotal, ocrTotal, 'normalized', 'info',
                `Diferencia $${diff.toFixed(2)} dentro del umbral permitido`,
            );
        }

        // Mismatch: determinar severidad según magnitud
        const severity: ReconciliationSeverity = pct >= 0.01 ? 'critical' : 'warning';
        return this.rec(
            'total', qrTotal, ocrTotal, 'mismatch', severity,
            `Diferencia $${diff.toFixed(2)} (${(pct * 100).toFixed(2)}%)`,
        );
    }

    /** Comparación exacta de strings, case-sensitive. */
    private static compareExact(
        field: keyof InvoiceData,
        qr: string,
        ocr: string,
    ): FieldReconciliation {
        if (qr === ocr) return this.rec(field, qr, ocr, 'exact', 'info');
        return this.rec(field, qr, ocr, 'mismatch', MISMATCH_SEVERITY[field]);
    }

    // ── Builder ───────────────────────────────────────────────────────────────

    private static rec(
        field: keyof InvoiceData,
        qr_value:  string | number | null,
        ocr_value: string | number | null,
        match: FieldMatch,
        severity: ReconciliationSeverity,
        note?: string,
    ): FieldReconciliation {
        const result: FieldReconciliation = { field, qr_value, ocr_value, match, severity };
        if (note) result.note = note;
        return result;
    }
}
