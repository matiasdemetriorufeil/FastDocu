import Tesseract from 'tesseract.js';

/**
 * Extractor de texto para documentos (imágenes y PDFs).
 *
 * - PDF: Usa Mozilla pdfjs-dist para extracción nativa de texto.
 *        Si el PDF no tiene capa de texto (escaneado), informa al usuario.
 * - Imagen: Preprocesa con Jimp (upscale + escala de grises + contraste)
 *           y luego usa Tesseract.js con rotación automática.
 */
export class DocumentExtractor {

    static async extractText(buffer: Buffer, mimeType: string): Promise<string> {
        try {
            if (mimeType.includes('pdf')) {
                return await this.extractFromPdf(buffer);
            } else if (mimeType.includes('image')) {
                return await this.extractFromImage(buffer);
            } else {
                throw new Error('Formato de archivo no soportado. Debe ser PDF o Imagen (JPG/PNG).');
            }
        } catch (error: any) {
            console.error(`[Extractor] Error extrayendo texto:`, error.message);
            throw error;
        }
    }

    // ── PDF ───────────────────────────────────────────────────────────────────

    /**
     * Extracción de texto desde PDF usando pdfjs-dist (Mozilla PDF.js).
     * Reconstruye líneas agrupando items por coordenada Y para preservar
     * la estructura visual del documento y que el parser de regex funcione bien.
     */
    private static async extractFromPdf(buffer: Buffer): Promise<string> {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

        const uint8 = new Uint8Array(buffer);
        const loadingTask = pdfjs.getDocument({
            data: uint8,
            useSystemFonts: true,
        });

        const doc = await loadingTask.promise;
        console.log(`[Extractor PDF] Documento cargado: ${doc.numPages} página(s)`);

        const allLines: string[] = [];

        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();

            // Agrupar items por coordenada Y (redondeada) para reconstruir líneas.
            // En PDFs, el eje Y va de abajo hacia arriba, por eso ordenamos descendente.
            const lineMap = new Map<number, Array<{ x: number; str: string }>>();

            for (const item of content.items as any[]) {
                if (!item.str?.trim()) continue;
                const y = Math.round(item.transform[5]);
                if (!lineMap.has(y)) lineMap.set(y, []);
                lineMap.get(y)!.push({ x: item.transform[4], str: item.str });
            }

            // Ordenar líneas de arriba a abajo (Y mayor = más arriba en la página)
            const sortedLines = Array.from(lineMap.entries())
                .sort((a, b) => b[0] - a[0])
                .map(([, items]) =>
                    items
                        .sort((a, b) => a.x - b.x)
                        .map(i => i.str)
                        .join(' ')
                        .trim(),
                )
                .filter(Boolean);

            allLines.push(...sortedLines);
        }

        const fullText = allLines.join('\n');

        if (!fullText || fullText.trim().length < 10) {
            console.warn('[Extractor PDF] El PDF no contiene texto nativo. Es probablemente un escaneo.');
            throw new Error('El PDF no contiene texto digital. Subí la factura como imagen (JPG/PNG) para usar OCR.');
        }

        console.log(`[Extractor PDF] Texto extraído: ${fullText.length} caracteres`);
        return fullText;
    }

    // ── Imagen ────────────────────────────────────────────────────────────────

    /**
     * OCR con Tesseract.js para imágenes (PNG/JPG/foto).
     *
     * Preprocesa la imagen antes de reconocer para mejorar la precisión
     * en fotos borrosas, capturas de pantalla de baja resolución o imágenes
     * comprimidas:
     *   1. Upscale a mínimo 1500 px en el lado mayor (máximo 3×).
     *      Tesseract necesita densidad de píxeles suficiente para distinguir
     *      caracteres; escalar es la mejora más efectiva para imágenes borrosas.
     *   2. Escala de grises: elimina ruido de canales de color.
     *   3. Normalización del histograma: estira el rango tonal para que el
     *      texto claro sobre fondo claro quede más marcado.
     *   4. Leve boost de contraste: separa texto del fondo sin amplificar ruido.
     */
    private static async extractFromImage(buffer: Buffer): Promise<string> {
        console.log('[Extractor OCR] Preprocesando imagen...');
        const enhanced = await this.enhanceImageForOcr(buffer);

        const worker = await Tesseract.createWorker('spa');

        // user_defined_dpi: le indica a Tesseract que trate la imagen como 300 DPI,
        // lo que mejora el umbralizado interno (binarización de Otsu).
        await worker.setParameters({
            user_defined_dpi: '300',
            preserve_interword_spaces: '1',
        });

        const { data: { text } } = await worker.recognize(enhanced, {
            rotateAuto: true,
        });

        await worker.terminate();

        console.log(`[Extractor OCR] Texto extraído: ${text.length} caracteres`);
        return text;
    }

    /**
     * Preprocesamiento de imagen para OCR usando Jimp (ya presente como dependencia).
     * Retorna el buffer original si Jimp falla, para no bloquear el flujo.
     */
    private static async enhanceImageForOcr(buffer: Buffer): Promise<Buffer> {
        try {
            const Jimp = await import('jimp').then(m => m.default ?? m);
            const image = await (Jimp as any).read(buffer);

            const { width, height } = image.bitmap;
            const maxDim = Math.max(width, height);

            // Upscalar solo si la imagen es pequeña.
            // Factor mínimo para alcanzar 1500 px, con tope en 3× para no generar
            // archivos enormes que ralenticen Tesseract.
            if (maxDim < 1500) {
                const scale = Math.min(3, Math.ceil(1500 / maxDim));
                image.scale(scale);
                console.log(
                    `[OCR] Imagen escalada ×${scale} (${width}×${height} → ${width * scale}×${height * scale} px)`,
                );
            }

            image
                .greyscale()   // escala de grises
                .normalize()   // normalizar histograma (estira el rango tonal)
                .contrast(0.2); // leve boost de contraste (valor en [-1, 1])

            return await image.getBufferAsync('image/png');
        } catch (err: any) {
            console.warn('[OCR] Preprocesamiento omitido, usando imagen original:', err.message);
            return buffer;
        }
    }
}
