// ─── OCR Invoice Output ─────────────────────────────────────────────────────

/**
 * Estructura JSON completa de una factura AFIP procesada por OCR.
 * Todos los campos son nullable: si el OCR no puede extraer un dato, devuelve null.
 */
export interface InvoiceData {
    tipo_factura: 'A' | 'B' | 'C' | null;
    numero_factura: string | null;         // "0001-00001234"
    fecha_emision: string | null;          // "YYYY-MM-DD"
    cuit_emisor: string | null;            // "XX-XXXXXXXX-X"
    razon_social_emisor: string | null;
    domicilio_comercial: string | null;
    condicion_iva: string | null;
    cuit_receptor: string | null;          // "XX-XXXXXXXX-X"
    razon_social_receptor: string | null;
    condicion_iva_receptor: string | null;
    domicilio_receptor: string | null;
    condicion_venta: string | null;
    descripcion: string | null;
    periodo: string | null;
    fecha_vencimiento_pago: string | null; // "YYYY-MM-DD" — vto pago (distinto del CAE)
    subtotal: number | null;
    iva: number | null;
    total: number | null;
    cae: string | null;
    fecha_vencimiento_cae: string | null;  // "YYYY-MM-DD"
}

// ─── Pipeline Output ────────────────────────────────────────────────────────

export type FinalState =
    | 'VALIDO_ACTIVO'
    | 'VALIDO_INACTIVO'
    | 'INVALIDO'
    | 'NO_ENCONTRADO'
    | 'ERROR_API'
    | 'PROCESADO';

export interface ValidationOutput {
    texto_extraido: string;
    invoice: InvoiceData;
    cuit_valido_localmente: boolean;
    consultado_api: boolean;
    estado_final: FinalState;
    detalle: string;          // alias de decision_reason — mantener para backward compat
    warnings: string[];
    reconciliation: ReconciliationReport | null;
    score: ValidationScore;
    apto_pago: boolean;
    decision_reason: string;
}

// ─── API ────────────────────────────────────────────────────────────────────

export interface ApiStatusResponse {
    active: boolean;
    razonSocial: string;
}

// ─── Reconciliation ──────────────────────────────────────────────────────────

export type QrSource = 'url' | 'barcode' | 'image_scan' | null;

export type FieldMatch =
    | 'exact'       // idénticos tras normalizar
    | 'normalized'  // distintos en bruto, iguales tras normalizar
    | 'mismatch'    // distintos tras normalizar
    | 'qr_only'     // OCR no extrajo el campo
    | 'ocr_only'    // QR no incluye el campo
    | 'both_null';  // ninguna fuente lo tiene

export type ReconciliationSeverity = 'critical' | 'warning' | 'info';

export interface FieldReconciliation {
    field: keyof InvoiceData;
    qr_value:  string | number | null;
    ocr_value: string | number | null;
    match: FieldMatch;
    severity: ReconciliationSeverity;
    note?: string;
}

export interface ReconciliationReport {
    has_qr: boolean;
    qr_source: QrSource;
    fields: FieldReconciliation[];
    critical_mismatches: (keyof InvoiceData)[];
    warning_mismatches:  (keyof InvoiceData)[];
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export type ConfidenceLevel = 'alta' | 'media' | 'baja' | 'no_procesado';

export interface ValidationScore {
    total: number;              // 0–100
    confidence: ConfidenceLevel;
    breakdown: {
        qr_presence:    number; // 0 ó 20 — QR AFIP decodificado correctamente
        critical_fields: number; // 0–40 — CAE, CUIT emisor, total
        amount_coherence: number; // 0–20 — subtotal + IVA ≈ total
        completeness:   number; // 0–20 — campos obligatorios presentes
    };
}

// ─── Decision ────────────────────────────────────────────────────────────────

export interface DecisionResult {
    apto_pago: boolean;
    estado_final: FinalState;
    decision_reason: string;
}
