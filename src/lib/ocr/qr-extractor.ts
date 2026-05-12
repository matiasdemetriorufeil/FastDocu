import { inflateSync } from 'zlib';
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

interface PdfImageEntry {
    stream: Buffer;
    width: number;
    height: number;
    filter: 'dct' | 'flate';
    bpc: number;
    channels: number;
    predictor: number;
    paletteRef: string | null;
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
                            /https?:\/\/(?:www\.)?(?:afip|arca)\.gob\.ar\/fe\/qr\/?\?p=([A-Za-z0-9+/=_%\-]+)/i,
                        );
                        if (match) {
                            // La URL puede estar percent-encoded dentro del PDF
                            const base64 = decodeURIComponent(match[1]);
                            const data = this.parseAfipBase64(base64);
                            if (data) {
                                console.log('[QR] URL AFIP/ARCA encontrada en anotación PDF');
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
            /https?:\/\/(?:www\.)?(?:afip|arca)\.gob\.ar\/fe\/qr\/?\?p=([A-Za-z0-9+/=_%\-]+)/i,
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
            /https?:\/\/(?:www\.)?(?:afip|arca)\.gob\.ar\/fe\/qr\/?\?p=([A-Za-z0-9+/=_-]+)/i,
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
     * Estrategia D: extrae imágenes embebidas directamente del PDF binario
     * y escanea cada una buscando un QR AFIP.
     *
     * Soporta los dos formatos más comunes en facturas argentinas:
     *  - DCTDecode (JPEG): ICARO, Sicar — bytes pasados directo a Jimp
     *  - FlateDecode (zlib): Thomson Reuters — descomprime, aplica paleta, pasa a jsqr
     * Evita renderizar el PDF completo (causa segfault en Node.js) y funciona en O(n).
     */
    static async extractFromPdfEmbeddedImages(
        buffer: Buffer,
    ): Promise<{ data: Partial<InvoiceData>; source: 'image_scan' } | null> {
        try {
            const raw = buffer.toString('latin1');
            const images = this.extractPdfImageEntries(raw, buffer);
            if (images.length === 0) return null;

            console.log(`[QR] ${images.length} imagen(es) encontrada(s) en el PDF binario`);

            // Evaluar primero las más cuadradas (QR codes tienen ratio 1:1)
            images.sort((a, b) =>
                Math.abs(1 - a.width / a.height) - Math.abs(1 - b.width / b.height),
            );

            const jsQR = await import('jsqr').then(m => m.default ?? m);

            for (const img of images) {
                console.log(`[QR] Escaneando imagen ${img.width}×${img.height} filtro=${img.filter} bpc=${img.bpc} ch=${img.channels} pred=${img.predictor} bytes=${img.stream.length}`);
                let qrText: string | null = null;

                if (img.filter === 'dct') {
                    qrText = await this.scanQrFromImageBuffer(img.stream);
                } else if (img.filter === 'flate') {
                    qrText = this.scanQrFromFlateImage(jsQR, img, raw, buffer);
                }

                if (!qrText) {
                    console.log(`[QR] → sin QR en esta imagen`);
                    continue;
                }
                console.log(`[QR] → texto leído: ${qrText.substring(0, 80)}`);

                const match = qrText.match(
                    /https?:\/\/(?:www\.)?(?:afip|arca)\.gob\.ar\/fe\/qr\/?\?p=([A-Za-z0-9+/=_\-]+)/i,
                );
                if (!match) {
                    console.log(`[QR] → QR encontrado pero no es URL AFIP`);
                    continue;
                }

                const data = this.parseAfipBase64(match[1]);
                if (data) {
                    console.log(`[QR] QR AFIP en imagen embebida ${img.width}×${img.height} (${img.filter})`);
                    return { data, source: 'image_scan' };
                }
            }
        } catch (err: any) {
            console.warn('[QR] Error extrayendo imágenes del PDF:', err.message);
        }
        return null;
    }

    /**
     * Estrategia E: extrae imágenes inline del contenido del PDF vía getOperatorList().
     *
     * Cubre PDFs generados con FPDF/PHP legacy que codifican el QR como imagen inline
     * (BI/ID/EI con ASCII85+LZW), no como XObject. pdfjs decodifica automáticamente
     * la imagen a RGBA — solo necesitamos pasársela a jsqr.
     * NO requiere canvas ni rendering → sin riesgo de segfault.
     */
    static async extractFromPdfInlineImages(
        buffer: Buffer,
    ): Promise<{ data: Partial<InvoiceData>; source: 'image_scan' } | null> {
        const STRATEGY_TIMEOUT_MS = 40_000; // 40 s máximo para toda la estrategia
        const PAGE_TIMEOUT_MS     = 15_000; // 15 s por página (getOperatorList)
        const OBJ_TIMEOUT_MS      =  5_000; // 5 s por imagen XObject
        const start = Date.now();

        try {
            const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
            const pdfjsLib = (pdfjs as any).default ?? pdfjs;
            const OPS = pdfjsLib.OPS ?? {};
            const OP_inline = OPS.paintInlineImageXObject ?? 86;
            const OP_xobj   = OPS.paintImageXObject       ?? 85;

            const doc = await (pdfjsLib as any).getDocument({
                data: new Uint8Array(buffer),
                useSystemFonts: true,
            }).promise;

            const jsQR = await import('jsqr').then(m => m.default ?? m);

            for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
                if (Date.now() - start > STRATEGY_TIMEOUT_MS) {
                    console.warn('[QR] Timeout global en estrategia E, abortando');
                    break;
                }

                const page = await doc.getPage(pageNum);

                // getOperatorList puede colgar en PDFs escaneados con imágenes muy grandes
                let opList: any;
                try {
                    opList = await Promise.race([
                        page.getOperatorList(),
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error('getOperatorList timeout')), PAGE_TIMEOUT_MS),
                        ),
                    ]);
                } catch (e: any) {
                    console.warn(`[QR] Página ${pageNum} saltada: ${e.message}`);
                    continue;
                }

                // ── Imágenes inline (Griguol/FPDF legacy — ASCII85+LZW) ──────────
                for (let i = 0; i < opList.fnArray.length; i++) {
                    if (opList.fnArray[i] !== OP_inline) continue;

                    const img = opList.argsArray[i]?.[0];
                    if (!img?.data || !img.width || !img.height) continue;

                    const result = this.tryQrFromImageData(jsQR, img.data, img.width, img.height);
                    if (result) {
                        console.log(`[QR] QR AFIP/ARCA en imagen inline ${img.width}×${img.height}`);
                        return { data: result, source: 'image_scan' };
                    }
                }

                // ── XObject images (ARCA/AFIP — sin filtro, DeviceGray o RGB) ───
                const xobjNames = new Set<string>();
                for (let i = 0; i < opList.fnArray.length; i++) {
                    if (opList.fnArray[i] === OP_xobj) {
                        const name = opList.argsArray[i]?.[0];
                        if (name && typeof name === 'string') xobjNames.add(name);
                    }
                }

                for (const name of xobjNames) {
                    // page.objs.get puede no llamar su callback si el objeto no se resuelve
                    const imgData: any = await Promise.race([
                        new Promise<any>((resolve) => {
                            page.objs.get(name, (d: any) => resolve(d ?? null));
                        }),
                        new Promise<null>((resolve) =>
                            setTimeout(() => resolve(null), OBJ_TIMEOUT_MS),
                        ),
                    ]);
                    if (!imgData?.data || !imgData.width || !imgData.height) continue;

                    const { width: iw, height: ih, data: idata } = imgData;
                    const dataLen = (idata as any).length;
                    const detectedCh = dataLen === iw * ih * 4 ? 4 : dataLen === iw * ih * 3 ? 3 : dataLen === iw * ih ? 1 : `raw(${dataLen})`;
                    console.log(`[QR] XObject ${name}: ${iw}×${ih} kind=${imgData.kind ?? '?'} dataLen=${dataLen} channels=${detectedCh}`);

                    // Intento 1: conversión manual RGBA → jsqr
                    const result = this.tryQrFromImageData(jsQR, idata, iw, ih);
                    if (result) {
                        console.log(`[QR] QR AFIP/ARCA en XObject ${name} ${iw}×${ih}`);
                        return { data: result, source: 'image_scan' };
                    }

                    // Intento 2: recodificar a PNG vía Jimp → Jimp.read → jsqr
                    // El pipeline de Jimp aplica corrección de espacio de color
                    // y puede producir RGBA más limpio que la conversión manual.
                    try {
                        const JimpMod = await import('jimp').then(m => m.default ?? m);
                        const pngBuf = await this.pdfImageToPng(JimpMod, idata, iw, ih);
                        if (pngBuf) {
                            const qrText = await this.scanQrFromImageBuffer(pngBuf);
                            if (qrText) {
                                const m = qrText.replace(/[\r\n]/g, '').match(
                                    /https?:\/\/(?:www\.)?(?:afip|arca)\.gob\.ar\/fe\/qr\/?\?p=([A-Za-z0-9+/=_\-]+)/i,
                                );
                                if (m) {
                                    const data = this.parseAfipBase64(m[1]);
                                    if (data) {
                                        console.log(`[QR] QR AFIP/ARCA vía Jimp en XObject ${name}`);
                                        return { data, source: 'image_scan' };
                                    }
                                }
                            }
                        }
                    } catch (e: any) {
                        console.warn(`[QR] Jimp fallback error en ${name}:`, e.message);
                    }
                }
            }
        } catch (err: any) {
            console.warn('[QR] Error en getOperatorList:', err.message);
        }
        return null;
    }

    /**
     * Convierte datos de imagen (RGBA/RGB/Gray) a Uint8ClampedArray RGBA,
     * escanea con jsqr y devuelve los datos AFIP si hay QR.
     */
    private static tryQrFromImageData(
        jsQR: any,
        data: ArrayLike<number>,
        w: number,
        h: number,
    ): Partial<InvoiceData> | null {
        const dataLen: number = (data as any).length;
        const channels = dataLen === w * h * 4 ? 4
            : dataLen === w * h * 3 ? 3
            : dataLen === w * h ? 1 : 0;

        let rgba: Uint8ClampedArray;
        if (channels === 4) {
            rgba = new Uint8ClampedArray(data as any);
        } else if (channels === 3) {
            rgba = new Uint8ClampedArray(w * h * 4);
            for (let p = 0; p < w * h; p++) {
                rgba[p * 4]     = (data as any)[p * 3];
                rgba[p * 4 + 1] = (data as any)[p * 3 + 1];
                rgba[p * 4 + 2] = (data as any)[p * 3 + 2];
                rgba[p * 4 + 3] = 255;
            }
        } else if (channels === 1) {
            rgba = new Uint8ClampedArray(w * h * 4);
            for (let p = 0; p < w * h; p++) {
                rgba[p * 4] = rgba[p * 4 + 1] = rgba[p * 4 + 2] = (data as any)[p];
                rgba[p * 4 + 3] = 255;
            }
        } else if (dataLen === Math.ceil(w / 8) * h) {
            // GRAYSCALE_1BPP (pdfjs kind=1): 1 bit per pixel, packed MSB-first per row
            const stride = Math.ceil(w / 8);
            rgba = new Uint8ClampedArray(w * h * 4);
            for (let row = 0; row < h; row++) {
                for (let col = 0; col < w; col++) {
                    const byteOff = row * stride + Math.floor(col / 8);
                    const bit = ((data as any)[byteOff] >> (7 - col % 8)) & 1;
                    const gray = bit ? 255 : 0;
                    const p = (row * w + col) * 4;
                    rgba[p] = rgba[p + 1] = rgba[p + 2] = gray;
                    rgba[p + 3] = 255;
                }
            }
        } else {
            rgba = new Uint8ClampedArray(data as any);
        }

        const qrText = this.scanQrFromRgba(jsQR, rgba, w, h);
        if (!qrText) return null;

        const qrNorm = qrText.replace(/[\r\n]/g, '');
        const match = qrNorm.match(
            /https?:\/\/(?:www\.)?(?:afip|arca)\.gob\.ar\/fe\/qr\/?\?p=([A-Za-z0-9+/=_\-]+)/i,
        );
        if (!match) return null;

        return this.parseAfipBase64(match[1]);
    }

    /**
     * Escanea RGBA con jsqr.
     *
     * Para imágenes grandes (páginas escaneadas completas):
     *  1. Intento directo a resolución completa
     *  2. Binarizado a resolución completa (elimina artefactos JPEG del escaneo)
     *  3. Cuadrantes de la página — el QR de AFIP/ARCA está en la zona inferior
     *     y ocupa solo ~15 % del ancho total; al recortar un cuadrante pasa a
     *     ocupar ~30 %, lo que mejora mucho la detección con jsqr
     *  4. Versión reducida a 1200 px (fallback)
     *
     * Para imágenes pequeñas (recortes de QR):
     *  Reintenta escalando 2×, 4× y 8× si el primer intento falla.
     */
    private static scanQrFromRgba(jsQR: any, rgba: Uint8ClampedArray, w: number, h: number): string | null {
        const MAX_DIM = 1200;

        if (w > MAX_DIM || h > MAX_DIM) {
            // 1. Resolución completa
            const direct = (jsQR as any)(rgba, w, h, { inversionAttempts: 'attemptBoth' });
            if (direct?.data) return direct.data;

            // 2. Binarizado completo — elimina ruido JPEG que confunde jsqr
            const binary = this.binarizeRgba(rgba, w, h);
            const binFull = (jsQR as any)(binary, w, h, { inversionAttempts: 'attemptBoth' });
            if (binFull?.data) return binFull.data;

            // 3. Cuadrantes — el QR suele estar en la parte inferior (AFIP bottom-right)
            const tiled = this.scanQrTiled(jsQR, rgba, w, h);
            if (tiled) return tiled;

            // 4. Fallback reducido
            const scale = MAX_DIM / Math.max(w, h);
            const nw = Math.round(w * scale);
            const nh = Math.round(h * scale);
            const downscaled = this.nearestNeighborDownscale(rgba, w, h, nw, nh);
            console.log(`[QR] Downscaling ${w}×${h} → ${nw}×${nh} para jsqr`);
            const dsResult = (jsQR as any)(downscaled, nw, nh, { inversionAttempts: 'attemptBoth' });
            if (dsResult?.data) return dsResult.data;
            const binDs = this.binarizeRgba(downscaled, nw, nh);
            const binDsResult = (jsQR as any)(binDs, nw, nh, { inversionAttempts: 'attemptBoth' });
            return binDsResult?.data ?? null;
        }

        const direct = (jsQR as any)(rgba, w, h, { inversionAttempts: 'attemptBoth' });
        if (direct?.data) return direct.data;

        for (const scale of [4, 8, 2]) {
            const sw = w * scale, sh = h * scale;
            const scaled = new Uint8ClampedArray(sw * sh * 4);
            for (let sy = 0; sy < sh; sy++) {
                for (let sx = 0; sx < sw; sx++) {
                    const ox = Math.floor(sx / scale);
                    const oy = Math.floor(sy / scale);
                    const si = (sy * sw + sx) * 4;
                    const oi = (oy * w + ox) * 4;
                    scaled[si]     = rgba[oi];
                    scaled[si + 1] = rgba[oi + 1];
                    scaled[si + 2] = rgba[oi + 2];
                    scaled[si + 3] = 255;
                }
            }
            const r = (jsQR as any)(scaled, sw, sh, { inversionAttempts: 'attemptBoth' });
            if (r?.data) return r.data;
        }
        return null;
    }

    /**
     * Convierte datos de imagen pdfjs (array de píxeles + dimensiones) a PNG via Jimp.
     * Necesario para el camino Jimp.read → jsqr que maneja mejor los espacios de color.
     */
    static async pdfImageToPng(Jimp: any, data: ArrayLike<number>, w: number, h: number): Promise<Buffer | null> {
        try {
            const dataLen: number = (data as any).length;
            const channels = dataLen === w * h * 4 ? 4 : dataLen === w * h * 3 ? 3 : dataLen === w * h ? 1 : 0;
            if (channels === 0) return null;

            const img = new (Jimp as any)(w, h, 0x00000000);
            const bmp: Buffer = img.bitmap.data;
            for (let i = 0; i < w * h; i++) {
                if (channels === 4) {
                    bmp[i * 4]     = (data as any)[i * 4];
                    bmp[i * 4 + 1] = (data as any)[i * 4 + 1];
                    bmp[i * 4 + 2] = (data as any)[i * 4 + 2];
                    bmp[i * 4 + 3] = (data as any)[i * 4 + 3];
                } else if (channels === 3) {
                    bmp[i * 4]     = (data as any)[i * 3];
                    bmp[i * 4 + 1] = (data as any)[i * 3 + 1];
                    bmp[i * 4 + 2] = (data as any)[i * 3 + 2];
                    bmp[i * 4 + 3] = 255;
                } else {
                    const g = (data as any)[i];
                    bmp[i * 4] = bmp[i * 4 + 1] = bmp[i * 4 + 2] = g;
                    bmp[i * 4 + 3] = 255;
                }
            }
            return await img.getBufferAsync('image/png');
        } catch {
            return null;
        }
    }

    /**
     * Convierte RGBA a blanco/negro puro (umbral 128).
     * Elimina artefactos JPEG y ruido de escaneo que confunden jsqr.
     */
    private static binarizeRgba(rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
        const out = new Uint8ClampedArray(rgba.length);
        for (let i = 0; i < w * h; i++) {
            const gray = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114;
            const val = gray > 128 ? 255 : 0;
            out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = val;
            out[i * 4 + 3] = 255;
        }
        return out;
    }

    /**
     * Divide la imagen en cuadrantes y escanea cada uno con jsqr.
     * El QR de AFIP/ARCA suele estar en la zona inferior del comprobante,
     * por lo que los cuadrantes inferiores se escanean primero.
     * También prueba la versión binarizada de cada cuadrante.
     */
    private static scanQrTiled(jsQR: any, rgba: Uint8ClampedArray, w: number, h: number): string | null {
        const hw = Math.floor(w / 2);
        const hh = Math.floor(h / 2);

        // Orden de prioridad: inferior-derecho (AFIP), inferior-izquierdo, superior-derecho, superior-izquierdo
        const offsets: Array<[number, number]> = [[hw, hh], [0, hh], [hw, 0], [0, 0]];

        for (const [ox, oy] of offsets) {
            const tile = new Uint8ClampedArray(hw * hh * 4);
            for (let y = 0; y < hh; y++) {
                for (let x = 0; x < hw; x++) {
                    const si = ((oy + y) * w + (ox + x)) * 4;
                    const di = (y * hw + x) * 4;
                    tile[di]     = rgba[si];
                    tile[di + 1] = rgba[si + 1];
                    tile[di + 2] = rgba[si + 2];
                    tile[di + 3] = rgba[si + 3];
                }
            }

            const r = (jsQR as any)(tile, hw, hh, { inversionAttempts: 'attemptBoth' });
            if (r?.data) return r.data;

            const binTile = this.binarizeRgba(tile, hw, hh);
            const br = (jsQR as any)(binTile, hw, hh, { inversionAttempts: 'attemptBoth' });
            if (br?.data) return br.data;
        }
        return null;
    }

    /** Nearest-neighbor downscale de buffer RGBA. */
    private static nearestNeighborDownscale(
        src: Uint8ClampedArray,
        sw: number, sh: number,
        dw: number, dh: number,
    ): Uint8ClampedArray {
        const dst = new Uint8ClampedArray(dw * dh * 4);
        for (let y = 0; y < dh; y++) {
            const sy = Math.floor(y * sh / dh);
            for (let x = 0; x < dw; x++) {
                const sx = Math.floor(x * sw / dw);
                const si = (sy * sw + sx) * 4;
                const di = (y * dw + x) * 4;
                dst[di]     = src[si];
                dst[di + 1] = src[si + 1];
                dst[di + 2] = src[si + 2];
                dst[di + 3] = src[si + 3];
            }
        }
        return dst;
    }

    /** Descomprime una imagen FlateDecode y escanea su QR sincrónicamente. */
    private static scanQrFromFlateImage(
        jsQR: any,
        img: PdfImageEntry,
        raw: string,
        buffer: Buffer,
    ): string | null {
        try {
            let pixelData: Buffer = Buffer.from(inflateSync(img.stream));
            const expectedPixels = img.width * img.height;

            // Si hay DecodeParms con Predictor ≥ 10 (PNG filter), desaplicar predictor
            if (img.predictor >= 10) {
                pixelData = this.removePngPredictor(pixelData, img.width, img.bpc, img.channels);
            }

            if (pixelData.length < expectedPixels) return null;

            // Resolver paleta si el colorspace es Indexed
            const palette = img.paletteRef ? this.resolvePalette(img.paletteRef, raw, buffer) : null;

            const rgba = new Uint8ClampedArray(img.width * img.height * 4);
            for (let i = 0; i < Math.min(pixelData.length, img.width * img.height); i++) {
                const v = pixelData[i];
                let r: number, g: number, b: number;
                if (palette) {
                    r = palette[v * 3];
                    g = palette[v * 3 + 1];
                    b = palette[v * 3 + 2];
                } else {
                    // DeviceGray u otro: escalar el valor al rango 0-255
                    const gray = img.bpc === 1 ? (v ? 255 : 0) : v;
                    r = g = b = gray;
                }
                rgba[i * 4]     = r;
                rgba[i * 4 + 1] = g;
                rgba[i * 4 + 2] = b;
                rgba[i * 4 + 3] = 255;
            }

            const result = (jsQR as any)(rgba, img.width, img.height, { inversionAttempts: 'attemptBoth' });
            return result?.data ?? null;
        } catch {
            return null;
        }
    }

    /** Aplica la función de desfilterado PNG (Predictor 12/15) fila a fila. */
    private static removePngPredictor(data: Buffer, width: number, bpc: number, channels: number): Buffer {
        const bytesPerPixel = Math.ceil(bpc * channels / 8);
        const bytesPerRow = Math.ceil(width * bpc * channels / 8);
        const rowStride = bytesPerRow + 1; // +1 for filter byte
        const out = Buffer.allocUnsafe(bytesPerRow * Math.floor(data.length / rowStride));
        let outPos = 0;

        for (let rowStart = 0; rowStart + rowStride <= data.length; rowStart += rowStride) {
            const filterType = data[rowStart];
            const row = data.slice(rowStart + 1, rowStart + rowStride);
            const prev = outPos >= bytesPerRow ? out.slice(outPos - bytesPerRow, outPos) : Buffer.alloc(bytesPerRow);

            for (let i = 0; i < bytesPerRow; i++) {
                const x = row[i];
                const a = i >= bytesPerPixel ? out[outPos + i - bytesPerPixel] : 0;
                const b2 = prev[i] ?? 0;
                const c = i >= bytesPerPixel ? (prev[i - bytesPerPixel] ?? 0) : 0;
                let val: number;
                switch (filterType) {
                    case 0: val = x; break;
                    case 1: val = (x + a) & 0xFF; break;
                    case 2: val = (x + b2) & 0xFF; break;
                    case 3: val = (x + Math.floor((a + b2) / 2)) & 0xFF; break;
                    case 4: {
                        const p = a + b2 - c;
                        const pa = Math.abs(p - a), pb = Math.abs(p - b2), pc = Math.abs(p - c);
                        val = (x + (pa <= pb && pa <= pc ? a : pb <= pc ? b2 : c)) & 0xFF;
                        break;
                    }
                    default: val = x;
                }
                out[outPos + i] = val;
            }
            outPos += bytesPerRow;
        }
        return out.slice(0, outPos);
    }

    /** Resuelve la paleta de un colorspace Indexed buscando el objeto de referencia. */
    private static resolvePalette(objRef: string, raw: string, buffer: Buffer): Buffer | null {
        try {
            const [objNum] = objRef.split(' ').map(Number);
            const marker = `\n${objNum} 0 obj`;
            const objStart = raw.indexOf(marker);
            if (objStart === -1) return null;

            const streamStart = raw.indexOf('stream', objStart);
            if (streamStart === -1 || streamStart - objStart > 500) return null;

            const dictSnippet = raw.slice(objStart, streamStart);
            const isFlateDecode = dictSnippet.includes('FlateDecode');

            // Permissive stream start: skip 'stream' + any whitespace until '\n'
            let dataStart = streamStart + 6;
            while (dataStart < raw.length && raw[dataStart] !== '\n') dataStart++;
            dataStart++; // skip '\n'

            const endStream = raw.indexOf('endstream', dataStart);
            const paletteStream = buffer.slice(dataStart, endStream);

            const palette = isFlateDecode ? inflateSync(paletteStream) : paletteStream;
            console.log(`[QR] Paleta objeto ${objNum}: ${palette.length} bytes, primeros RGB: [${palette[0]},${palette[1]},${palette[2]}] [${palette[3]},${palette[4]},${palette[5]}] [${palette[6]},${palette[7]},${palette[8]}]`);
            return palette;
        } catch (err: any) {
            console.warn('[QR] Error resolviendo paleta:', err.message);
            return null;
        }
    }

    /**
     * Recorre el PDF binario y extrae todas las entradas de imagen (XObject /Image)
     * con filtros DCTDecode o FlateDecode, junto con sus metadatos.
     */
    private static extractPdfImageEntries(raw: string, buffer: Buffer): PdfImageEntry[] {
        const results: PdfImageEntry[] = [];
        let pos = 0;
        let imgIdx = 0;

        while (true) {
            // Handle both "/Subtype /Image" (with space) and "/Subtype/Image" (no space)
            const idx1 = raw.indexOf('/Subtype /Image', pos);
            const idx2 = raw.indexOf('/Subtype/Image', pos);
            let idx: number;
            if (idx1 === -1 && idx2 === -1) break;
            else if (idx1 === -1) idx = idx2;
            else if (idx2 === -1) idx = idx1;
            else idx = Math.min(idx1, idx2);
            pos = idx + 1;
            imgIdx++;

            const streamKwIdx = raw.indexOf('stream', idx);
            if (streamKwIdx === -1 || streamKwIdx - idx > 2000) {
                console.log(`[QR] Img#${imgIdx}: sin 'stream' en 2000 chars`);
                continue;
            }

            // Skip 'endstream' false positives: the char before 'stream' must not be 'd'
            if (raw[streamKwIdx - 1] === 'd') {
                console.log(`[QR] Img#${imgIdx}: 'stream' es parte de 'endstream', saltando`);
                continue;
            }

            const dict = raw.slice(idx, streamKwIdx);
            const isDct   = dict.includes('DCTDecode');
            const isFlate = !isDct && dict.includes('FlateDecode');
            if (!isDct && !isFlate) {
                // Log the filter so we know what we're missing
                const filterMatch = dict.match(/\/Filter\s*(\S+)/);
                console.log(`[QR] Img#${imgIdx}: filtro no soportado (${filterMatch?.[1] ?? 'ninguno'})`);
                continue;
            }

            const wm = dict.match(/\/Width\s+(\d+)/);
            const hm = dict.match(/\/Height\s+(\d+)/);
            const width  = wm ? parseInt(wm[1], 10) : 0;
            const height = hm ? parseInt(hm[1], 10) : 0;
            if (width < 50 || height < 50) {
                console.log(`[QR] Img#${imgIdx}: muy pequeña ${width}×${height}, saltando`);
                continue;
            }

            // Permissive stream start: skip 'stream' keyword + any whitespace until '\n'
            let dataStart = streamKwIdx + 6; // skip the word 'stream'
            while (dataStart < raw.length && raw[dataStart] !== '\n') dataStart++;
            dataStart++; // skip '\n'

            const endStreamIdx = raw.indexOf('endstream', dataStart);
            if (endStreamIdx === -1) {
                console.log(`[QR] Img#${imgIdx}: sin 'endstream'`);
                continue;
            }

            const stream = buffer.slice(dataStart, endStreamIdx);

            if (isDct) {
                if (stream[0] === 0xFF && stream[1] === 0xD8) {
                    results.push({ stream, width, height, filter: 'dct', bpc: 8, channels: 3, predictor: 0, paletteRef: null });
                }
            } else {
                // FlateDecode: leer metadatos adicionales
                const bpcMatch = dict.match(/\/BitsPerComponent\s+(\d+)/);
                const bpc = bpcMatch ? parseInt(bpcMatch[1], 10) : 8;

                // Predictor (PNG sub-filters)
                const predMatch = dict.match(/\/Predictor\s+(\d+)/);
                const predictor = predMatch ? parseInt(predMatch[1], 10) : 1;

                // ColorSpace: puede ser directo (/DeviceGray, /DeviceRGB) o referencia (n 0 R)
                const csMatch = dict.match(/\/ColorSpace\s+(\d+\s+\d+\s+R|\/\w+)/);
                let paletteRef: string | null = null;
                let channels = 1;

                if (csMatch) {
                    const cs = csMatch[1];
                    if (cs.match(/^\d/)) {
                        // Referencia a objeto — puede ser Indexed
                        const csObjNum = cs.split(' ')[0];
                        const csObjMarker = `\n${csObjNum} 0 obj`;
                        const csObjStart = raw.indexOf(csObjMarker);
                        if (csObjStart !== -1) {
                            const csEnd = raw.indexOf('endobj', csObjStart);
                            const csContent = raw.slice(csObjStart, csEnd);
                            // [ /Indexed /DeviceRGB 255 <paletteRef 0 R> ]
                            const indexedMatch = csContent.match(/\/Indexed[\s\S]*?(\d+\s+\d+\s+R)/);
                            if (indexedMatch) {
                                paletteRef = indexedMatch[1];
                                channels = 1; // indexed = 1 byte per pixel
                            } else if (csContent.includes('DeviceRGB')) {
                                channels = 3;
                            }
                        }
                    } else if (cs.includes('DeviceRGB')) {
                        channels = 3;
                    }
                }

                results.push({ stream, width, height, filter: 'flate', bpc, channels, predictor, paletteRef });
            }
        }

        return results;
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
                /https?:\/\/(?:www\.)?(?:afip|arca)\.gob\.ar\/fe\/qr\/?\?p=([A-Za-z0-9+/=_-]+)/i,
            );
            if (!match) {
                console.log('[QR] El QR no es de AFIP/ARCA, se ignora');
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
            // Algunos generadores de QR insertan \r\n cada 76 chars (MIME base64).
            // Hay que eliminar todo whitespace antes de decodificar.
            // También soporta base64 URL-safe (- → +, _ → /).
            const clean = base64.replace(/[\r\n\s]/g, '').replace(/-/g, '+').replace(/_/g, '/');
            json = Buffer.from(clean, 'base64').toString('utf-8');
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
