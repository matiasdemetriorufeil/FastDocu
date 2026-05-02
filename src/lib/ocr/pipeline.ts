import { DocumentExtractor } from './extractor';
import { QRExtractor } from './qr-extractor';
import { InvoiceParser } from './parser';
import { InvoiceCleaner } from './cleaner';
import { CuitValidator } from './cuit';
import { CuitApiClient } from './api';
import { ReconciliationEngine } from './reconciler';
import { ScoringEngine } from './scorer';
import { DecisionEngine } from './decision';
import type {
    ValidationOutput,
    InvoiceData,
    QrSource,
    ApiStatusResponse,
} from './types';

const DEFAULT_SCORE: ValidationOutput['score'] = {
    total: 0,
    confidence: 'no_procesado',
    breakdown: { qr_presence: 0, critical_fields: 0, amount_coherence: 0, completeness: 0 },
};

/**
 * Orquestador de extracción y validación de facturas AFIP.
 *
 * Estrategia de extracción (en orden de prioridad):
 *
 *  1. QR AFIP (RG 4786/2020) — máxima precisión, sin OCR.
 *     - Para PDFs: busca la URL del QR en el texto nativo (muchos softwares
 *       la incluyen como texto plano junto al código gráfico).
 *     - Para PDFs: también detecta el código de barras AFIP (RG 2485/08).
 *     - Para imágenes: escanea el QR con jsqr + jimp (pure JS).
 *
 *  2. Texto nativo PDF + regex — para PDFs digitales sin QR en texto.
 *
 *  3. OCR Tesseract + regex — último recurso para imágenes sin QR legible.
 *
 * Los tres caminos convergen en Reconciliación → Scoring → Decisión.
 */
export class FastDocuOCR {
    private readonly apiClient: CuitApiClient;

    constructor() {
        this.apiClient = new CuitApiClient();
    }

    async processDocument(buffer: Buffer, mimeType: string): Promise<ValidationOutput> {
        const output: ValidationOutput = {
            texto_extraido: '',
            invoice: this.emptyInvoice(),
            cuit_valido_localmente: false,
            consultado_api: false,
            estado_final: 'NO_ENCONTRADO',
            detalle: '',
            warnings: [],
            reconciliation: null,
            score: DEFAULT_SCORE,
            apto_pago: false,
            decision_reason: '',
        };

        try {
            let qrData: Partial<InvoiceData> | null = null;
            let qrSource: QrSource = null;

            if (mimeType.includes('pdf')) {
                ({ qrData, qrSource } = await this.processPdf(buffer, output));
            } else if (mimeType.includes('image')) {
                ({ qrData, qrSource } = await this.processImage(buffer, output));
            } else {
                output.detalle = 'Formato de archivo no soportado. Usá PDF, PNG o JPG.';
                return output;
            }

            if (!output.invoice.cuit_emisor && !output.invoice.total) {
                output.detalle = 'No se pudo extraer información de la factura.';
                return output;
            }

            // ── CLEAN ────────────────────────────────────────────────────────
            const { cleaned, warnings } = InvoiceCleaner.clean(output.invoice);
            output.invoice = cleaned;
            output.warnings = warnings;
            if (warnings.length > 0) console.log('[OCR] Warnings:', warnings);

            // ── RECONCILE ────────────────────────────────────────────────────
            output.reconciliation = qrData !== null
                ? ReconciliationEngine.reconcile(qrData, cleaned, qrSource)
                : ReconciliationEngine.noQr();

            // ── SCORE ────────────────────────────────────────────────────────
            output.score = ScoringEngine.score(output.reconciliation, cleaned);
            console.log(`[OCR] Score: ${output.score.total}/100 (${output.score.confidence})`);

            // ── VALIDATE CUIT ────────────────────────────────────────────────
            const cuitRaw = cleaned.cuit_emisor?.replace(/\D/g, '') ?? '';
            output.cuit_valido_localmente = CuitValidator.isValid(cuitRaw);

            // ── API AFIP (opcional) ──────────────────────────────────────────
            let apiResult: ApiStatusResponse | null = null;
            if (cuitRaw && output.cuit_valido_localmente) {
                try {
                    apiResult = await this.apiClient.checkStatus(cuitRaw);
                    output.consultado_api = true;
                    if (apiResult?.razonSocial) {
                        output.invoice.razon_social_emisor =
                            output.invoice.razon_social_emisor || apiResult.razonSocial;
                    }
                } catch {
                    // API no disponible — la decisión se toma igual con datos locales
                }
            }

            // ── DECIDE ───────────────────────────────────────────────────────
            const decision = DecisionEngine.decide(
                output.score,
                output.reconciliation,
                cleaned,
                output.cuit_valido_localmente,
                apiResult,
                output.consultado_api,
            );
            output.apto_pago       = decision.apto_pago;
            output.estado_final    = decision.estado_final;
            output.decision_reason = decision.decision_reason;
            output.detalle         = decision.decision_reason;

        } catch (err: any) {
            console.error('[OCR] Error crítico en pipeline:', err);
            output.detalle = `Error de procesamiento: ${err.message}`;
        }

        return output;
    }

    // ── Procesamiento PDF ─────────────────────────────────────────────────────

    private async processPdf(
        buffer: Buffer,
        output: ValidationOutput,
    ): Promise<{ qrData: Partial<InvoiceData> | null; qrSource: QrSource }> {
        // ── Extraer texto (siempre necesario para campos no-QR) ───────────────
        let nativeText = '';
        try {
            nativeText = await DocumentExtractor.extractText(buffer, 'application/pdf');
            output.texto_extraido = nativeText;
            console.log(`[OCR] PDF: texto extraído (${nativeText.length} chars)`);
        } catch (err: any) {
            console.warn('[OCR] PDF sin texto nativo:', err.message);
            output.detalle = err.message;
            return { qrData: null, qrSource: null };
        }

        // ── Estrategia A: URL o barcode en el texto extraído ──────────────────
        const textQr = QRExtractor.extractFromPdfText(nativeText);
        if (textQr) {
            console.log(`[OCR] QR AFIP en texto PDF (${textQr.source}) → datos exactos`);
            output.invoice = this.mergeWithQr(InvoiceParser.parse(nativeText), textQr.data);
            return { qrData: textQr.data, qrSource: textQr.source };
        }

        // ── Estrategia B: anotaciones de enlace del PDF (ICARO/Sicar/Bejerman) ─
        // Muchos generadores insertan la URL como Link annotation sobre el QR
        // gráfico en lugar de como texto plano, invisible para getTextContent().
        const annotQr = await QRExtractor.extractFromPdfAnnotations(buffer);
        if (annotQr) {
            output.invoice = this.mergeWithQr(InvoiceParser.parse(nativeText), annotQr.data);
            return { qrData: annotQr.data, qrSource: annotQr.source };
        }

        // ── Estrategia C: búsqueda directa en bytes crudos del PDF ────────────
        // Cubre URLs en streams sin comprimir, metadatos XMP o form fields.
        const rawQr = QRExtractor.extractFromPdfRaw(buffer);
        if (rawQr) {
            output.invoice = this.mergeWithQr(InvoiceParser.parse(nativeText), rawQr.data);
            return { qrData: rawQr.data, qrSource: rawQr.source };
        }

        // ── Estrategia D: renderizar página y escanear QR con jsqr ────────────
        // Último recurso: el QR es una imagen gráfica sin URL embedida en ningún
        // lado (ICARO/Sicar y otros generadores que no exponen la URL como texto).
        // Usa pdfjs-dist + @napi-rs/canvas para renderizar la página a píxeles.
        console.log('[OCR] QR no encontrado en texto/anotaciones/bytes → renderizando página...');
        const renderedQr = await QRExtractor.extractFromPdfRendered(buffer);
        if (renderedQr) {
            output.invoice = this.mergeWithQr(InvoiceParser.parse(nativeText), renderedQr.data);
            return { qrData: renderedQr.data, qrSource: renderedQr.source };
        }

        // ── Fallback final: solo regex sobre el texto ─────────────────────────
        console.log('[OCR] Sin QR detectado → parseo por regex');
        output.invoice = InvoiceParser.parse(nativeText);
        return { qrData: null, qrSource: null };
    }

    // ── Procesamiento Imagen ──────────────────────────────────────────────────

    private async processImage(
        buffer: Buffer,
        output: ValidationOutput,
    ): Promise<{ qrData: Partial<InvoiceData> | null; qrSource: QrSource }> {
        const qrData = await QRExtractor.extractFromImage(buffer);
        if (qrData) {
            console.log('[OCR] QR AFIP encontrado en imagen → datos exactos');
            const ocrText = await this.runTesseract(buffer, output);
            const parsedFromOcr = ocrText ? InvoiceParser.parse(ocrText) : this.emptyInvoice();
            output.invoice = this.mergeWithQr(parsedFromOcr, qrData);
            return { qrData, qrSource: 'image_scan' };
        }

        console.log('[OCR] Sin QR → Tesseract + regex');
        const ocrText = await this.runTesseract(buffer, output);
        if (ocrText) output.invoice = InvoiceParser.parse(ocrText);
        return { qrData: null, qrSource: null };
    }

    private async runTesseract(buffer: Buffer, output: ValidationOutput): Promise<string | null> {
        try {
            const text = await DocumentExtractor.extractText(buffer, 'image/png');
            output.texto_extraido = text;
            console.log(`[OCR] Tesseract: texto extraído (${text.length} chars)`);
            return text;
        } catch (err: any) {
            console.warn('[OCR] Error en Tesseract:', err.message);
            return null;
        }
    }

    // ── Merge QR + Parser ─────────────────────────────────────────────────────

    /**
     * Combina datos del parser (campos textuales: razon_social, domicilio, etc.)
     * con los datos exactos del QR. El QR tiene prioridad en los campos que incluye.
     */
    private mergeWithQr(parsed: InvoiceData, qr: Partial<InvoiceData>): InvoiceData {
        return {
            ...parsed,
            ...Object.fromEntries(
                Object.entries(qr).filter(([, v]) => v !== null && v !== undefined),
            ),
        } as InvoiceData;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private emptyInvoice(): InvoiceData {
        return {
            tipo_factura: null,
            numero_factura: null,
            fecha_emision: null,
            cuit_emisor: null,
            razon_social_emisor: null,
            domicilio_comercial: null,
            condicion_iva: null,
            cuit_receptor: null,
            razon_social_receptor: null,
            condicion_iva_receptor: null,
            domicilio_receptor: null,
            condicion_venta: null,
            descripcion: null,
            periodo: null,
            fecha_vencimiento_pago: null,
            subtotal: null,
            iva: null,
            total: null,
            cae: null,
            fecha_vencimiento_cae: null,
        };
    }
}
