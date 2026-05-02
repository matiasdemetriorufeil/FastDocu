import type { Document, ValidationResult, ValidationIssue, DocumentStatus } from '@/types';
import {
    validateCUIT,
    validateIVA,
    validateTotal,
    validateCAE,
    validateQR,
    detectDuplicate,
    checkCamposCompletos,
} from './validators';

// ─── Main validation orchestrator ────────────────────────────────────────────

export function validateDocument(doc: Document, allDocs: Document[]): ValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    const observations: string[] = [];

    // 1. Check campos completos
    const { complete, missingFields } = checkCamposCompletos(doc);
    if (!complete) {
        errors.push({
            code: 'CAMPOS_INCOMPLETOS',
            message: `Campos obligatorios faltantes: ${missingFields.join(', ')}.`,
            severity: 'error',
        });
    }

    // 2. Validate CUIT
    const cuitResult = validateCUIT(doc.cuit);
    if (!cuitResult.valid) {
        errors.push({
            code: 'CUIT_INVALIDO',
            field: 'cuit',
            message: cuitResult.message ?? 'CUIT inválido.',
            severity: 'error',
        });
    }

    // 3. Validate IVA coherence
    const ivaResult = doc.ivaRate > 0
        ? validateIVA(doc.neto, doc.iva, doc.ivaRate)
        : { valid: true, expected: 0, diff: 0 };

    if (!ivaResult.valid) {
        warnings.push({
            code: 'IVA_INCOHERENTE',
            field: 'iva',
            message: `IVA declarado $${doc.iva} no coincide con el calculado $${ivaResult.expected.toFixed(2)} (diferencia: $${ivaResult.diff.toFixed(2)}).`,
            severity: 'warning',
        });
    }

    // 4. Validate total
    const totalResult = validateTotal(doc.neto, doc.iva, doc.total);
    if (!totalResult.valid) {
        errors.push({
            code: 'TOTAL_INCOHERENTE',
            field: 'total',
            message: `Total declarado $${doc.total} no coincide con neto + IVA = $${totalResult.expected.toFixed(2)} (diferencia: $${totalResult.diff.toFixed(2)}).`,
            severity: 'error',
        });
    }

    // 5. Validate CAE
    const caeResult = validateCAE(doc.cae);
    if (!caeResult.valid) {
        warnings.push({
            code: 'CAE_INVALIDO',
            field: 'cae',
            message: caeResult.message ?? 'CAE inválido.',
            severity: 'warning',
        });
    }

    // 6. Validate QR (info level — QR is optional for now)
    const qrResult = validateQR(doc.qrCode);
    if (!qrResult.valid && doc.qrCode) {
        warnings.push({
            code: 'QR_INVALIDO',
            field: 'qrCode',
            message: qrResult.message ?? 'QR inválido.',
            severity: 'warning',
        });
    }

    // 7. Duplicate detection
    const isDuplicate = detectDuplicate(doc, allDocs);
    if (isDuplicate) {
        errors.push({
            code: 'DUPLICADO',
            message: 'Documento duplicado: existe otro comprobante con el mismo CUIT, punto de venta y número.',
            severity: 'error',
        });
    }

    // 8. Observaciones adicionales
    if (doc.observaciones) {
        observations.push(doc.observaciones);
    }

    // ─── Determine final status ───────────────────────────────────────────────

    let status: DocumentStatus;
    let aptoPago: boolean;
    let decisionReason: string;

    if (isDuplicate) {
        status = 'duplicado';
        aptoPago = false;
        decisionReason = 'El documento es un duplicado de uno ya registrado en el sistema.';
    } else if (!complete || errors.some((e) => e.code === 'CUIT_INVALIDO' || e.code === 'CAMPOS_INCOMPLETOS')) {
        status = 'pendiente';
        aptoPago = false;
        decisionReason = 'Faltan campos obligatorios o el CUIT es inválido. Se requiere corrección antes de aprobar.';
    } else if (errors.some((e) => e.code === 'TOTAL_INCOHERENTE')) {
        status = 'revisar';
        aptoPago = false;
        decisionReason = 'El total no coincide con neto + IVA. Revisar con el proveedor.';
    } else if (!caeResult.valid) {
        status = 'observado';
        aptoPago = false;
        decisionReason = 'CAE ausente o inválido. El documento requiere verificación ante AFIP.';
    } else if (warnings.length > 0) {
        status = 'revisar';
        aptoPago = false;
        decisionReason = 'El documento presenta advertencias que requieren revisión antes del pago.';
    } else {
        status = 'aprobado';
        aptoPago = true;
        decisionReason = 'Todos los controles superados. Documento apto para pago.';
    }

    return {
        documentId: doc.id,
        status,
        aptoPago,
        decisionReason,
        errors,
        warnings,
        observations,
        checks: {
            cuitValido: cuitResult.valid,
            ivaCoherente: ivaResult.valid,
            totalCoherente: totalResult.valid,
            caeValido: caeResult.valid,
            qrValido: doc.qrCode ? qrResult.valid : null,
            duplicado: isDuplicate,
            camposCompletos: complete,
        },
    };
}
