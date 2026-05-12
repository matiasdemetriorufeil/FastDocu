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
                output.detalle = 'No se pudo extraer información de la factura. Si es un PDF escaneado, intentá subir la imagen JPG/PNG directamente.';
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
            console.warn('[OCR] Error extrayendo texto del PDF, continuando con estrategias de imagen:', err.message);
            // No retornar — las estrategias D/E pueden extraer el QR de imágenes embebidas
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

        // ── Estrategia D: extraer imágenes JPEG embebidas del PDF binario ────────
        // Último recurso para PDFs donde el QR es una imagen gráfica (ICARO/Sicar).
        // Extrae cada JPEG directamente del stream binario y lo escanea con jsqr.
        // Más rápido y estable que renderizar toda la página.
        console.log('[OCR] QR no encontrado en texto/anotaciones/bytes → extrayendo imágenes embebidas...');
        const embeddedQr = await QRExtractor.extractFromPdfEmbeddedImages(buffer);
        if (embeddedQr) {
            output.invoice = this.mergeWithQr(InvoiceParser.parse(nativeText), embeddedQr.data);
            return { qrData: embeddedQr.data, qrSource: embeddedQr.source };
        }

        // ── Estrategia E: imágenes inline del content stream vía getOperatorList() ─
        // Cubre PDFs legacy (FPDF/PHP) donde el QR está como imagen BI/ID/EI con
        // ASCII85+LZW — invisible para los buscadores binarios pero decodificado
        // automáticamente por pdfjs. Sin canvas, sin riesgo de segfault.
        console.log('[OCR] QR no encontrado en imágenes XObject → buscando imágenes inline...');
        const inlineQr = await QRExtractor.extractFromPdfInlineImages(buffer);
        if (inlineQr) {
            output.invoice = this.mergeWithQr(InvoiceParser.parse(nativeText), inlineQr.data);
            return { qrData: inlineQr.data, qrSource: inlineQr.source };
        }

        // ── Estrategia F: OCR Tesseract sobre páginas del PDF escaneado ──────────
        // Se activa cuando no hay texto nativo ni QR. Usa pdfjs para obtener
        // las imágenes de página y corre Tesseract sobre cada una.
        if (!nativeText) {
            console.log('[OCR] PDF escaneado sin QR → OCR Tesseract en páginas...');
            const scanned = await this.extractOcrFromScannedPdf(buffer, output);
            if (scanned.qrData) {
                output.invoice = this.mergeWithQr(InvoiceParser.parse(scanned.text ?? ''), scanned.qrData);
                return { qrData: scanned.qrData, qrSource: scanned.qrSource };
            }
            if (scanned.text) nativeText = scanned.text;
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

    // ── Estrategia F: OCR Tesseract en PDFs escaneados ───────────────────────

    /**
     * Usa pdfjs para obtener las imágenes XObject de cada página.
     * Para cada imagen intenta: (1) QR via Jimp→jsqr, (2) OCR Tesseract.
     * Activa solo cuando no hay texto nativo ni QR en las estrategias A-E.
     */
    private async extractOcrFromScannedPdf(
        buffer: Buffer,
        output: ValidationOutput,
    ): Promise<{ text: string | null; qrData: Partial<InvoiceData> | null; qrSource: QrSource }> {
        try {
            const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
            const pdfjsLib = (pdfjs as any).default ?? pdfjs;
            const OPS = pdfjsLib.OPS ?? {};
            const OP_xobj = OPS.paintImageXObject ?? 85;

            const doc = await (pdfjsLib as any).getDocument({
                data: new Uint8Array(buffer),
                useSystemFonts: true,
            }).promise;

            const Jimp = await import('jimp').then(m => m.default ?? m);
            const allTexts: string[] = [];

            for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
                const page = await doc.getPage(pageNum);

                let opList: any;
                try {
                    opList = await Promise.race([
                        page.getOperatorList(),
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error('timeout')), 15000),
                        ),
                    ]);
                } catch (e: any) {
                    console.warn(`[OCR PDF] Página ${pageNum} saltada: ${e.message}`);
                    continue;
                }

                const xobjNames = new Set<string>();
                for (let i = 0; i < opList.fnArray.length; i++) {
                    if (opList.fnArray[i] === OP_xobj) {
                        const name = opList.argsArray[i]?.[0];
                        if (name && typeof name === 'string') xobjNames.add(name);
                    }
                }

                for (const name of xobjNames) {
                    const imgData: any = await Promise.race([
                        new Promise<any>((resolve) => {
                            page.objs.get(name, (d: any) => resolve(d ?? null));
                        }),
                        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
                    ]);

                    if (!imgData?.data || !imgData.width || !imgData.height) continue;
                    if (imgData.width < 200 || imgData.height < 200) continue;

                    console.log(`[OCR PDF] Convirtiendo imagen ${imgData.width}×${imgData.height} → PNG...`);
                    const pngBuffer = await this.pdfjsImageToPng(Jimp, imgData);
                    if (!pngBuffer) continue;

                    // Intentar QR via Jimp.read → jsqr (distinto al camino raw-pixels de estrategia E)
                    try {
                        const qrData = await QRExtractor.extractFromImage(pngBuffer);
                        if (qrData) {
                            console.log(`[OCR PDF] QR AFIP encontrado vía Jimp en página ${pageNum}`);
                            output.texto_extraido = allTexts.join('\n\n');
                            return { text: allTexts.join('\n\n') || null, qrData, qrSource: 'image_scan' };
                        }
                    } catch { /* continuar si falla */ }

                    try {
                        const text = await DocumentExtractor.extractText(pngBuffer, 'image/png');
                        if (text && text.trim().length > 20) {
                            console.log(`[OCR PDF] Página ${pageNum}: ${text.length} chars extraídos`);
                            allTexts.push(text);
                        }
                    } catch (e: any) {
                        console.warn(`[OCR PDF] Tesseract error en página ${pageNum}:`, e.message);
                    }
                }
            }

            if (allTexts.length > 0) {
                const combined = allTexts.join('\n\n');
                output.texto_extraido = combined;

                // Si el OCR extrajo los campos críticos, derivar qrData para activar has_qr=true
                const parsed = InvoiceParser.parse(combined);
                if (parsed.cuit_emisor && parsed.cae && parsed.total) {
                    const derivedQr: Partial<InvoiceData> = {
                        tipo_factura: parsed.tipo_factura,
                        numero_factura: parsed.numero_factura,
                        fecha_emision: parsed.fecha_emision,
                        cuit_emisor: parsed.cuit_emisor,
                        total: parsed.total,
                        cae: parsed.cae,
                        fecha_vencimiento_cae: parsed.fecha_vencimiento_cae,
                    };
                    console.log('[OCR PDF] Campos críticos extraídos por OCR → qrData derivado (ocr_derived)');
                    return { text: combined, qrData: derivedQr, qrSource: 'ocr_derived' };
                }

                return { text: combined, qrData: null, qrSource: null };
            }
        } catch (err: any) {
            console.warn('[OCR PDF] Error en OCR de páginas escaneadas:', err.message);
        }
        return { text: null, qrData: null, qrSource: null };
    }

    private async pdfjsImageToPng(Jimp: any, imgData: any): Promise<Buffer | null> {
        return QRExtractor.pdfImageToPng(Jimp, imgData.data, imgData.width, imgData.height);
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
