import type { InvoiceData } from './types';

/**
 * Extractor de QR AFIP (Resolución General 4786/2020).
 *
 * Toda factura electrónica argentina emitida desde julio 2020 debe incluir
 * un código QR que codifica los datos del comprobante como JSON en base64
 * dentro de una URL: https://www.afip.gob.ar/fe/qr/?p=<base64>
 *
 * Decodificar el QR da datos exactos sin depender de OCR ni regex sobre texto.
 *
 * Estrategias:
 *  1. Buscar la URL del QR dentro del texto extraído del PDF (muchos sistemas
 *     de facturación la incluyen como texto plano junto al QR gráfico).
 *  2. Escanear el código QR desde los píxeles de la imagen (PNG/JPG).
 */

// Mapping tipoCmp → tipo_factura según tablas AFIP
const TIPO_CMP_TO_LETRA: Record<number, 'A' | 'B' | 'C'> = {
    1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'A',
    6: 'B', 7: 'B', 8: 'B', 9: 'B', 10: 'B',
    11: 'C', 12: 'C', 13: 'C',
    201: 'A', 202: 'A', 203: 'A',
    206: 'B', 207: 'B', 208: 'B',
    211: 'C', 212: 'C', 213: 'C',
};

interface AfipQrPayload {
    ver: number;
    fecha: string;      // "YYYY-MM-DD"
    cuit: number;       // CUIT emisor sin guiones
    ptoVta: number;
    tipoCmp: number;
    nroCmp: number;
    importe: number;    // importe total del comprobante
    moneda: string;     // "PES", "DOL", etc.
    ctz: number;        // cotización
    tipoDocRec: number; // 80 = CUIT, 96 = DNI, etc.
    nroDocRec: number;  // número de documento receptor
    tipoCodAut: string; // "E" = CAE, "A" = CAEA
    codAut: number;     // número de CAE/CAEA
}

export class QRExtractor {

    /**
     * Estrategia 1-extra: busca la URL de QR AFIP en las anotaciones de enlace
     * del PDF (Link annotations). Muchos generadores (ICARO, Sicar, Bejerman)
     * crean una anotación invisible sobre el QR gráfico en lugar de insertar
     * la URL como texto plano, por lo que pdfjs.getTextContent() no la ve.
     * Requiere pdfjs-dist (ya instalado) — NO necesita canvas ni rendering.
     */
    static async extractFromPdfAnnotations(
        buffer: Buffer,
    ): Promise<{ data: Partial<InvoiceData>; source: 'url' } | null> {
        try {
            const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
            const doc = await (pdfjs as any).getDocument({
                data: new Uint8Array(buffer),
                useSystemFonts: true,
            }).promise;

            for (let i = 1; i <= doc.numPages; i++) {
                const page = await doc.getPage(i);
                const annotations: any[] = await page.getAnnotations();

                for (const ann of annotations) {
                    // Los Link annotations pueden guardar la URL en distintas propiedades
                    const candidates: string[] = [
                        ann.url,
                        ann.unsafeUrl,
                        ann.action?.uri,
                        ann.action?.url,
                        ann.dest,
                    ].filter((v): v is string => typeof v === 'string');

                    for (const candidate of candidates) {
                        const match = candidate.match(
                            /https?:\/\/(?:www\.)?afip\.gob\.ar\/fe\/qr\/?\?p=([A-Za-z0-9+/=_%\-]+)/i,
                        );
                        if (match) {
                            // La URL puede estar percent-encoded dentro del PDF
                            const base64 = decodeURIComponent(match[1]);
                            const data = this.parseAfipBase64(base64);
                            if (data) {
                                console.log('[QR] URL AFIP encontrada en anotación PDF');
                                return { data, source: 'url' };
                            }
                        }
                    }
                }
            }
        } catch (err: any) {
            console.warn('[QR] Error leyendo anotaciones del PDF:', err.message);
        }
        return null;
    }

    /**
     * Estrategia 1-extra-b: busca la URL de QR AFIP en los bytes crudos del PDF.
     * Funciona cuando la URL está en un stream sin comprimir, en los metadatos XMP,
     * o en el diccionario de un form field — todos casos donde pdfjs.getTextContent()
     * no la extrae pero la URL es texto ASCII puro en el binario del PDF.
     * Es síncrono y O(n) sobre el tamaño del archivo.
     */
    static extractFromPdfRaw(
        buffer: Buffer,
    ): { data: Partial<InvoiceData>; source: 'url' } | null {
        // latin1 preserva los bytes 1:1 sin modificar — ideal para buscar texto ASCII
        const raw = buffer.toString('latin1');
        const match = raw.match(
            /https?:\/\/(?:www\.)?afip\.gob\.ar\/fe\/qr\/?\?p=([A-Za-z0-9+/=_%\-]+)/i,
        );
        if (!match) return null;

        try {
            const base64 = decodeURIComponent(match[1]);
            const data = this.parseAfipBase64(base64);
            if (data) {
                console.log('[QR] URL AFIP encontrada en bytes crudos del PDF');
                return { data, source: 'url' };
            }
        } catch {
            // decodeURIComponent puede fallar con bytes inválidos — ignorar silenciosamente
        }
        return null;
    }

    /**
     * Busca y parsea la URL de QR AFIP dentro del texto extraído de un PDF.
     * Retorna los datos junto a la fuente ('url' | 'barcode') para trazabilidad.
     */
    static extractFromPdfText(
        text: string,
    ): { data: Partial<InvoiceData>; source: 'url' | 'barcode' } | null {
        // Estrategia 1: URL del QR AFIP (RG 4786/2020)
        const qrMatch = text.match(
            /https?:\/\/(?:www\.)?afip\.gob\.ar\/fe\/qr\/?\?p=([A-Za-z0-9+/=_-]+)/i,
        );
        if (qrMatch) {
            console.log('[QR] URL de QR AFIP encontrada en texto PDF');
            const data = this.parseAfipBase64(qrMatch[1]);
            if (data) return { data, source: 'url' };
        }

        // Estrategia 2: código de barras AFIP (RG 2485/08)
        // CUIT(11) + TipoCmp(3) + PtoVta(5) + CAE(14) + FechaVto(8) + Check(1) = 42 chars
        // O con NroCmp(8): CUIT(11) + TipoCmp(3) + PtoVta(5) + NroCmp(8) + CAE(14) + FechaVto(8) + Check(1) = 50 chars
        const barcodeMatch = text.match(/\b((?:20|23|24|27|30|33|34)\d{9})(0\d{2})(\d{5})(\d{8})?(8\d{13})(\d{8})\d\b/);
        if (barcodeMatch) {
            console.log('[QR] Código de barras AFIP encontrado en texto PDF');
            const data = this.parseAfipBarcode(barcodeMatch);
            if (data) return { data, source: 'barcode' };
        }

        return null;
    }

    /**
     * Parsea la cadena del código de barras AFIP.
     * Grupos: [1]=CUIT, [2]=tipoCmp, [3]=ptoVta, [4]=nroCmp(opcional), [5]=CAE, [6]=fechaVto
     */
    private static parseAfipBarcode(groups: RegExpMatchArray): Partial<InvoiceData> | null {
        try {
            const cuitDigits = groups[1];
            const tipoCmpStr = groups[2];          // "006"
            const ptoVtaStr = groups[3];            // "00006"
            const nroCmpStr = groups[4] ?? null;   // "00000407" (puede no estar)
            const caeStr = groups[5];              // "86106501175429"
            const fechaVtoStr = groups[6];          // "20260309"

            const tipoCmp = parseInt(tipoCmpStr, 10);
            const tipoLetra = TIPO_CMP_TO_LETRA[tipoCmp] ?? null;

            const ptoVta = ptoVtaStr.replace(/^0+/, '') || '0';
            const nroCmp = nroCmpStr ? nroCmpStr.replace(/^0+/, '') || '0' : null;

            const numeroFactura = nroCmp
                ? `${ptoVtaStr}-${nroCmpStr}`
                : null;

            const fechaVto = fechaVtoStr.length === 8
                ? `${fechaVtoStr.slice(0, 4)}-${fechaVtoStr.slice(4, 6)}-${fechaVtoStr.slice(6, 8)}`
                : null;

            const result: Partial<InvoiceData> = {
                tipo_factura: tipoLetra,
                cuit_emisor: this.formatCuit(cuitDigits),
                cae: caeStr,
                fecha_vencimiento_cae: fechaVto,
            };

            if (numeroFactura) result.numero_factura = numeroFactura;

            console.log('[QR] Datos del código de barras AFIP:', JSON.stringify(result));
            return result;
        } catch (err: any) {
            console.warn('[QR] Error parseando código de barras AFIP:', err.message);
            return null;
        }
    }

    /**
     * Estrategia 1-extra-c: renderiza la página del PDF a imagen usando
     * pdfjs-dist + @napi-rs/canvas, luego escanea el QR con jsqr.
     * Cubre todos los casos donde el QR es puramente gráfico (ICARO, Sicar, etc.)
     * sin URL embedida como texto ni como anotación.
     * Escanea las primeras 3 páginas en caso de facturas multi-página.
     */
    static async extractFromPdfRendered(
        buffer: Buffer,
    ): Promise<{ data: Partial<InvoiceData>; source: 'image_scan' } | null> {
        try {
            const [pdfjs, { createCanvas }] = await Promise.all([
                import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<any>,
                import('@napi-rs/canvas') as Promise<any>,
            ]);

            const doc = await pdfjs.getDocument({
                data: new Uint8Array(buffer),
                useSystemFonts: true,
            }).promise;

            for (let pageNum = 1; pageNum <= Math.min(doc.numPages, 3); pageNum++) {
                const page = await doc.getPage(pageNum);
                // 2× escala: mejora la detección del QR sin ser excesivamente lento
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
                const context = canvas.getContext('2d');

                await page.render({ canvasContext: context, viewport }).promise;

                // Reutilizar el scanner existente (jimp + jsqr)
                const pngBuffer: Buffer = canvas.toBuffer('image/png');
                const qrText = await this.scanQrFromImageBuffer(pngBuffer);
                if (!qrText) continue;

                const match = qrText.match(
                    /https?:\/\/(?:www\.)?afip\.gob\.ar\/fe\/qr\/?\?p=([A-Za-z0-9+/=_\-]+)/i,
                );
                if (!match) continue;

                const data = this.parseAfipBase64(match[1]);
                if (data) {
                    console.log(`[QR] QR AFIP encontrado renderizando página ${pageNum} del PDF`);
                    return { data, source: 'image_scan' };
                }
            }
        } catch (err: any) {
            console.warn('[QR] Error renderizando PDF para escaneo QR:', err.message);
        }
        return null;
    }

    /**
     * Escanea el código QR de una imagen (PNG/JPG) y parsea los datos AFIP.
     * Usa jsqr (pure JS) + jimp (pure JS) — sin dependencias nativas.
     */
    static async extractFromImage(buffer: Buffer): Promise<Partial<InvoiceData> | null> {
        try {
            const qrText = await this.scanQrFromImageBuffer(buffer);
            if (!qrText) return null;

            console.log('[QR] QR decodificado desde imagen:', qrText.substring(0, 80));

            const match = qrText.match(
                /https?:\/\/(?:www\.)?afip\.gob\.ar\/fe\/qr\/?\?p=([A-Za-z0-9+/=_-]+)/i,
            );
            if (!match) {
                console.log('[QR] El QR no es de AFIP, se ignora');
                return null;
            }

            return this.parseAfipBase64(match[1]);

        } catch (err: any) {
            console.warn('[QR] Error escaneando QR desde imagen:', err.message);
            return null;
        }
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private static async scanQrFromImageBuffer(buffer: Buffer): Promise<string | null> {
        // jimp y jsqr son pure JS, sin compilación nativa
        const [jsQR, Jimp] = await Promise.all([
            import('jsqr').then(m => m.default ?? m),
            import('jimp').then(m => m.default ?? m),
        ]);

        const image = await (Jimp as any).read(buffer);
        const { width, height, data } = image.bitmap;

        // jsqr necesita Uint8ClampedArray RGBA
        const result = (jsQR as any)(
            new Uint8ClampedArray(data.buffer),
            width,
            height,
            { inversionAttempts: 'attemptBoth' },
        );

        return result?.data ?? null;
    }

    private static parseAfipBase64(base64: string): Partial<InvoiceData> | null {
        let json: string;
        try {
            // La URL usa base64 URL-safe (reemplaza + y / con - y _)
            // Node.js Buffer.from maneja ambas variantes
            json = Buffer.from(base64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
        } catch {
            return null;
        }

        let payload: AfipQrPayload;
        try {
            payload = JSON.parse(json);
        } catch {
            console.warn('[QR] JSON del QR AFIP inválido:', json.substring(0, 100));
            return null;
        }

        const cuitEmisor = this.formatCuit(String(payload.cuit).padStart(11, '0'));
        const cuitReceptor = payload.tipoDocRec === 80 && payload.nroDocRec
            ? this.formatCuit(String(payload.nroDocRec).padStart(11, '0'))
            : null;

        const ptoVta = String(payload.ptoVta).padStart(4, '0');
        const nroCmp = String(payload.nroCmp).padStart(8, '0');

        const result: Partial<InvoiceData> = {
            tipo_factura: TIPO_CMP_TO_LETRA[payload.tipoCmp] ?? null,
            numero_factura: `${ptoVta}-${nroCmp}`,
            fecha_emision: payload.fecha,   // ya viene "YYYY-MM-DD"
            cuit_emisor: cuitEmisor,
            total: payload.importe,
            cae: String(payload.codAut),
        };

        if (cuitReceptor) result.cuit_receptor = cuitReceptor;

        console.log('[QR] Datos extraídos del QR AFIP:', JSON.stringify(result));
        return result;
    }

    private static formatCuit(digits: string): string {
        if (digits.length !== 11) return digits;
        return `${digits.substring(0, 2)}-${digits.substring(2, 10)}-${digits.substring(10)}`;
    }
}
