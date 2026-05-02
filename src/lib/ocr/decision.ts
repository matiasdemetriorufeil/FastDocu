import type {
    InvoiceData,
    ReconciliationReport,
    ValidationScore,
    ApiStatusResponse,
    DecisionResult,
    FinalState,
} from './types';

export class DecisionEngine {

    /**
     * Consolida score + reconciliación + resultado de API en una decisión final.
     *
     * Orden de evaluación (primera regla que coincide gana):
     *  1. Bloqueantes duros  → apto_pago = false, estado = INVALIDO
     *  2. Emisor inactivo    → apto_pago = false, estado = VALIDO_INACTIVO
     *  3. Confianza alta/media con API activo → apto_pago = true, VALIDO_ACTIVO
     *  4. Confianza alta/media sin API        → apto_pago = true, PROCESADO
     *  5. Confianza baja                      → apto_pago = false, PROCESADO
     *  6. No procesado                        → apto_pago = false, NO_ENCONTRADO
     */
    static decide(
        score: ValidationScore,
        reconciliation: ReconciliationReport,
        invoice: InvoiceData,
        cuitValid: boolean,
        apiResult: ApiStatusResponse | null,
        apiConsulted: boolean,
    ): DecisionResult {
        // ── 1. Bloqueantes duros ─────────────────────────────────────────────
        const blocker = this.findBlocker(reconciliation, invoice, cuitValid);
        if (blocker) {
            return {
                apto_pago: false,
                estado_final: 'INVALIDO',
                decision_reason: blocker,
            };
        }

        // ── 2. Emisor inactivo en AFIP ───────────────────────────────────────
        if (apiResult && !apiResult.active) {
            return {
                apto_pago: false,
                estado_final: 'VALIDO_INACTIVO',
                decision_reason: `${apiResult.razonSocial} figura como inactivo en AFIP.`,
            };
        }

        // ── 3-6. Decisión por score ──────────────────────────────────────────
        const { confidence } = score;

        if (confidence === 'alta' || confidence === 'media') {
            const estado_final = this.resolveValidState(apiResult, apiConsulted);
            const reason = this.buildPositiveReason(score, reconciliation, apiResult, apiConsulted);
            return { apto_pago: true, estado_final, decision_reason: reason };
        }

        if (confidence === 'baja') {
            const reason = this.buildLowScoreReason(score, reconciliation);
            return { apto_pago: false, estado_final: 'PROCESADO', decision_reason: reason };
        }

        // no_procesado
        return {
            apto_pago: false,
            estado_final: 'NO_ENCONTRADO',
            decision_reason: `Score insuficiente (${score.total}/100): no se pudo verificar el comprobante.`,
        };
    }

    // ── Bloqueantes duros ─────────────────────────────────────────────────────

    /**
     * Retorna el motivo del bloqueo si existe alguna condición que impide la
     * aprobación sin importar el score. Retorna null si no hay bloqueo.
     */
    private static findBlocker(
        r: ReconciliationReport,
        invoice: InvoiceData,
        cuitValid: boolean,
    ): string | null {
        if (r.critical_mismatches.length > 0) {
            const fields = r.critical_mismatches.join(', ');
            return `Inconsistencia crítica entre QR y OCR en: ${fields}.`;
        }

        if (!cuitValid) {
            return `CUIT emisor ${invoice.cuit_emisor ?? '(vacío)'} no pasa validación Módulo 11.`;
        }

        const caeDigits = invoice.cae?.replace(/\D/g, '') ?? '';
        if (!caeDigits) {
            return 'CAE ausente: comprobante no autorizado por AFIP.';
        }
        if (caeDigits.length !== 14) {
            return `CAE con ${caeDigits.length} dígitos (se esperan 14).`;
        }

        return null;
    }

    // ── Helpers de estado y razón ─────────────────────────────────────────────

    private static resolveValidState(
        apiResult: ApiStatusResponse | null,
        apiConsulted: boolean,
    ): FinalState {
        if (!apiConsulted) return 'PROCESADO';
        if (apiResult === null) return 'PROCESADO';
        return apiResult.active ? 'VALIDO_ACTIVO' : 'VALIDO_INACTIVO';
    }

    private static buildPositiveReason(
        score: ValidationScore,
        r: ReconciliationReport,
        apiResult: ApiStatusResponse | null,
        apiConsulted: boolean,
    ): string {
        const parts: string[] = [];

        if (r.has_qr) {
            const mismatches = r.warning_mismatches.length;
            parts.push(mismatches === 0
                ? 'QR verificado sin discrepancias'
                : `QR verificado (${mismatches} advertencia${mismatches > 1 ? 's' : ''})`);
        } else {
            parts.push('Sin QR — validado por OCR');
        }

        if (score.breakdown.amount_coherence === 20) {
            parts.push('montos coherentes');
        } else if (score.breakdown.amount_coherence === 10) {
            parts.push('montos parcialmente verificados');
        }

        if (apiConsulted && apiResult?.active) {
            parts.push(`${apiResult.razonSocial} activo en AFIP`);
        } else if (!apiConsulted) {
            parts.push('API AFIP no consultada');
        }

        parts.push(`score ${score.total}/100`);
        return parts.join(', ') + '.';
    }

    private static buildLowScoreReason(
        score: ValidationScore,
        r: ReconciliationReport,
    ): string {
        const issues: string[] = [];

        if (r.warning_mismatches.length > 0) {
            issues.push(`discrepancias en ${r.warning_mismatches.join(', ')}`);
        }
        if (score.breakdown.completeness < 15) {
            issues.push('campos obligatorios incompletos');
        }
        if (score.breakdown.amount_coherence === 0) {
            issues.push('montos no cuadran');
        }
        if (!r.has_qr) {
            issues.push('sin QR para contrastar');
        }

        const base = `Score bajo (${score.total}/100) — requiere revisión manual`;
        return issues.length > 0 ? `${base}: ${issues.join(', ')}.` : `${base}.`;
    }
}
