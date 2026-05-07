import { CuitValidator } from './cuit';

/**
 * Parser de facturas AFIP basado en regex contextual.
 *
 * Cubre los formatos de los principales softwares de facturación argentinos:
 * Tango, Colppy, Rece Pro, FactuLine, QuickBooks AR, Siigo, Xubio, Griguol, etc.
 *
 * Diseñado para trabajar sobre el texto reconstruido por líneas (Y-coord)
 * que produce el DocumentExtractor.
 */
export class InvoiceParser {

    static parse(rawText: string) {
        const text = this.preprocess(rawText);
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        return {
            tipo_factura:           this.extractTipoFactura(text, lines),
            numero_factura:         this.extractNumeroFactura(text),
            fecha_emision:          this.extractFechaEmision(text),
            cuit_emisor:            this.extractCuitEmisor(text, lines),
            razon_social_emisor:    this.extractRazonSocialEmisor(text, lines),
            domicilio_comercial:    this.extractDomicilio(text, lines),
            condicion_iva:          this.extractCondicionIva(text),
            cuit_receptor:          this.extractCuitReceptor(text, lines),
            razon_social_receptor:  this.extractRazonSocialReceptor(text, lines),
            condicion_iva_receptor: this.extractCondicionIvaReceptor(text),
            domicilio_receptor:     this.extractDomicilioReceptor(text),
            condicion_venta:        this.extractCondicionVenta(text),
            descripcion:            this.extractDescripcion(text),
            periodo:                this.extractPeriodo(text),
            fecha_vencimiento_pago: this.extractFechaVencimientoPago(text),
            subtotal:               this.extractSubtotal(text),
            iva:                    this.extractIva(text),
            total:                  this.extractTotal(text),
            cae:                    this.extractCAE(text),
            fecha_vencimiento_cae:  this.extractFechaVtoCae(text),
        };
    }

    // ── Preprocessor ─────────────────────────────────────────────────────────

    private static preprocess(text: string): string {
        return text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/[^\S\n]+/g, ' ')      // colapsar espacios, preservar newlines
            .replace(/\.{3,}/g, ' ')
            .replace(/-{4,}/g, ' ')
            .replace(/_{4,}/g, ' ');
    }

    // ── Tipo Factura ──────────────────────────────────────────────────────────

    private static extractTipoFactura(text: string, lines: string[]): 'A' | 'B' | 'C' | null {
        // "FACTURA A", "Factura B", con posible contenido entre ellos (max 15 chars)
        let m = text.match(/\bFACTURA\s+([ABC])\b/i)
            ?? text.match(/\bFACTURA\b[\s\S]{0,15}?\b([ABC])\b/i);
        if (m) return m[1].toUpperCase() as 'A' | 'B' | 'C';

        // "Código 11" / "Cod. 6" → mapa AFIP tipoCmp → letra
        const codMap: Record<string, 'A' | 'B' | 'C'> = {
            '01': 'A', '02': 'A', '03': 'A',
            '06': 'B', '07': 'B', '08': 'B',
            '11': 'C', '12': 'C', '13': 'C',
        };
        const codMatch = text.match(/C[oó]d(?:igo)?\.?\s*0?([0-9]{1,2})\b/i);
        if (codMatch) {
            const cod = codMatch[1].padStart(2, '0');
            if (codMap[cod]) return codMap[cod];
        }

        // "[A]", "[ B ]"
        m = text.match(/\[\s*([ABC])\s*\]/i);
        if (m) return m[1].toUpperCase() as 'A' | 'B' | 'C';

        // Línea que contiene únicamente la letra (recuadro del comprobante)
        for (const line of lines.slice(0, 25)) {
            if (/^[ABC]$/i.test(line.trim())) {
                return line.trim().toUpperCase() as 'A' | 'B' | 'C';
            }
        }

        // "COMPROBANTE TIPO A/B/C"
        m = text.match(/\bCOMPROBANTE\s+TIPO\s+([ABC])\b/i);
        if (m) return m[1].toUpperCase() as 'A' | 'B' | 'C';

        return null;
    }

    // ── Número de Comprobante ─────────────────────────────────────────────────

    private static extractNumeroFactura(text: string): string | null {
        // "Punto de Venta: 00001 Comp. Nro.: 00001234" — en una sola línea
        let m = text.match(
            /Punto\s+de\s+Venta[:\s]*(\d{1,5})\s+Comp(?:robante)?\.?\s+N[rº°o]+\.?[:\s]*(\d{1,8})/i,
        );
        if (m) return `${m[1].padStart(4, '0')}-${m[2].padStart(8, '0')}`;

        // "Punto de Venta: Comp. Nro:\n00001 00000272" — etiquetas y valores en líneas separadas
        // (formato ARCA/AFIP donde la fila de encabezado y la fila de datos son distintas)
        m = text.match(
            /Punto\s+de\s+Venta[^\n]*Comp(?:robante)?\.?\s*N[rº°o]+\.?[:\s]*\n\s*(\d{1,5})\s+(\d{1,8})/i,
        );
        if (m) return `${m[1].padStart(4, '0')}-${m[2].padStart(8, '0')}`;

        // "Número: 0006-00004099" — acento en "Número" (Griguol, Rece Pro, etc.)
        // [A-Z]? maneja "Numero C0041-00001299" donde la letra tipo va pegada al número
        m = text.match(/N[úu]mero\s*:?\s*[A-Z]?\s*(\d{1,5})\s*[-–]\s*(\d{1,8})/i);
        if (m) return `${m[1].padStart(4, '0')}-${m[2].padStart(8, '0')}`;

        // "N°: 00006-00000407" / "Nro: 0003-00003716" / "N° C0041-00001299"
        m = text.match(/N[º°o]?r?[o°º]?\.?\s*:?\s*[A-Z]?\s*(\d{1,5})\s*[-–]\s*(\d{1,8})/i);
        if (m) return `${m[1].padStart(4, '0')}-${m[2].padStart(8, '0')}`;

        // "C0041-00001299" — letra tipo pegada directamente al número (sin etiqueta previa)
        m = text.match(/\b[A-Z](\d{3,5})\s*[-–]\s*(\d{7,8})\b/);
        if (m) return `${m[1].padStart(4, '0')}-${m[2].padStart(8, '0')}`;

        // Patrón suelto XXXX-XXXXXXXX (4-5 dígitos guión 7-8 dígitos)
        m = text.match(/\b(\d{4,5})\s*[-–]\s*(\d{7,8})\b/);
        if (m) return `${m[1].padStart(4, '0')}-${m[2].padStart(8, '0')}`;

        return null;
    }

    // ── Fecha de Emisión ──────────────────────────────────────────────────────

    private static extractFechaEmision(text: string): string | null {
        // "Fecha de Emisión: 15/02/2021" / "Fecha: 03-02-2026"
        let m = text.match(
            /Fecha(?:\s+de\s+Emisi[oó]n)?[\s:]+(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/i,
        );
        if (m) return this.formatDate(m[1], m[2], m[3]);

        // YYYY-MM-DD ya normalizado
        m = text.match(/Fecha[\s:]+(\d{4})-(\d{2})-(\d{2})/i);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;

        // Primera fecha DD/MM/YYYY que aparece antes del bloque CAE
        const beforeCae = text.split(/\bCAE\b|\bVto\b|\bVencimiento\b/i)[0];
        m = beforeCae.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/);
        if (m) return this.formatDate(m[1], m[2], m[3]);

        return null;
    }

    // ── CUITs ─────────────────────────────────────────────────────────────────

    private static findAllCuits(text: string): string[] {
        const found: string[] = [];

        // Regex con prefijos válidos y separadores opcionales
        const regex = /\b(20|23|24|27|30|33|34)[\s\-._]?(\d[\s\-._]?\d[\s\-._]?\d[\s\-._]?\d[\s\-._]?\d[\s\-._]?\d[\s\-._]?\d[\s\-._]?\d)[\s\-._]?(\d)\b/g;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(text)) !== null) {
            const digits = (m[1] + m[2] + m[3]).replace(/\D/g, '');
            if (digits.length === 11 && CuitValidator.isValid(digits) && !found.includes(digits)) {
                found.push(digits);
            }
        }

        // Fuerza bruta sobre dígitos consecutivos (formatos sin separadores).
        // IMPORTANTE: también se valida el prefijo para evitar falsos positivos
        // del CAE u otros números largos.
        const onlyDigits = text.replace(/[^0-9\n]/g, '');
        for (const line of onlyDigits.split('\n')) {
            for (let i = 0; i <= line.length - 11; i++) {
                const sub = line.substring(i, i + 11);
                const prefix = sub.substring(0, 2);
                if (
                    /^(20|23|24|27|30|33|34)/.test(prefix) &&
                    CuitValidator.isValid(sub) &&
                    !found.includes(sub)
                ) {
                    found.push(sub);
                }
            }
        }

        return found;
    }

    private static extractCuitEmisor(text: string, lines: string[]): string | null {
        // 1. Etiqueta explícita "CUIT del Emisor / Vendedor / Proveedor"
        // [\s.]* maneja "C.U.I.T", "CUIT", "C U I T", "C . U . I . T" (pdfjs char-by-char)
        let m = text.match(
            /C[\s.]*U[\s.]*I[\s.]*T[\s.]*\s*(?:del?\s+)?(?:Emisor|Vendedor|Proveedor)\s*[:\s\-]*((20|23|24|27|30|33|34)[\d\s\-._]{8,13}\d)/i,
        );
        if (m) {
            const d = m[1].replace(/\D/g, '');
            if (d.length === 11 && CuitValidator.isValid(d)) return d;
        }

        // 2. "C.U.I.T. número X" — patrón de Griguol y otros softwares AFIP
        //    "número" es un texto literal que separa la etiqueta del valor
        m = text.match(
            /C[\s.]*U[\s.]*I[\s.]*T[\s.]*\s+n[úu]mero\s*:?\s*((20|23|24|27|30|33|34)[\d\s\-._]{8,13}\d)/i,
        );
        if (m) {
            const d = m[1].replace(/\D/g, '');
            if (d.length === 11 && CuitValidator.isValid(d)) return d;
        }

        // 3. Sección del encabezado (texto antes del bloque receptor)
        //    Agrega "Nombre" para cubrir el formato Pavanetto y similares
        const clienteIdx = text.search(/\bCliente\b|\bNombre\b|\bSr\.?\s*\(?s?\)?[\s:]|\bReceptor\b|\bComprador\b/i);
        const headerText = clienteIdx > 0 ? text.slice(0, clienteIdx) : text.slice(0, 800);
        const headerCuits = this.findAllCuits(headerText);
        if (headerCuits.length > 0) return headerCuits[0];

        // 4. Primer CUIT del documento (fallback general)
        const all = this.findAllCuits(text);
        return all[0] ?? null;
    }

    private static extractCuitReceptor(text: string, lines: string[]): string | null {
        // 1. CUIT dentro de la sección del receptor (después de "Cliente:", "Nombre:", etc.)
        //    [\s.]* maneja "C.U.I.T", "CUIT", "C U I T", "C . U . I . T" (pdfjs char-by-char)
        const m = text.match(
            /(?:Sr\.?\s*\(?s?\)?|Cliente|Nombre|Receptor|Comprador|Consumidor)[\s\S]{0,350}?C[\s.]*U[\s.]*I[\s.]*T[\s.]*\s*:?\s*((20|23|24|27|30|33|34)[\d\s\-._]{8,13}\d)/i,
        );
        if (m) {
            const d = m[1].replace(/\D/g, '');
            if (d.length === 11 && CuitValidator.isValid(d)) return d;
        }

        // 2. Segundo CUIT del documento
        const all = this.findAllCuits(text);
        return all[1] ?? null;
    }

    // ── Razón Social ──────────────────────────────────────────────────────────

    private static extractRazonSocialEmisor(text: string, lines: string[]): string | null {
        // 1. Etiqueta explícita "Razón Social:"
        let m = text.match(/Raz[oó]n\s+Social(?:\s+del?\s+Emisor)?[\s:]+([^\n]{3,80})/i);
        if (m) return m[1].trim();

        // 2. "Proveedor:" o "Emisor:"
        m = text.match(/(?:Proveedor|Emisor)\s*[:\-]\s*([^\n]{3,80})/i);
        if (m) return m[1].trim();

        // 3. Buscar en el encabezado (antes de "Cliente / Sr.")
        //    Prioridad: líneas TODO EN MAYÚSCULAS de al menos 2 palabras (nombre/empresa)
        const clienteIdx = text.search(/\bCliente\b|\bNombre\b|\bSr\.?\s*\(?s?\)?[\s:]|\bReceptor\b/i);
        const headerText = clienteIdx > 0 ? text.slice(0, clienteIdx) : text.slice(0, 600);

        const headerLines = headerText.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 20);

        // Paso 3a: líneas de encabezado que tras limpiar tokens dan un nombre válido
        for (const line of headerLines) {
            const cleaned = line
                .replace(/\bFACTURA\b\s*/gi, '')
                .replace(/\bORIGINAL\b\s*/gi, '')
                .replace(/\bDUPLICADO\b\s*/gi, '')
                .replace(/\bN[úu]mero\b\s*/gi, '')
                .replace(/\bFecha\b\s*/gi, '')
                .replace(/\bSISTEMAS?\b.*/i, '')
                .replace(/\bCONTROL\b.*/i, '')
                .replace(/\bACCESO\b.*/i, '')
                .replace(/\bSEGURIDAD\b.*/i, '')
                .replace(/\d{4}\s*[-–]\s*\d{6,8}/g, '')  // número de comprobante
                .replace(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/g, '') // fechas
                .replace(/C[\s.]?U[\s.]?I[\s.]?T[\s.]?.*/i, '')   // CUIT y todo lo que sigue
                .trim();

            if (
                cleaned.length >= 4 &&
                cleaned.length <= 70 &&
                // Nombre válido: letras, espacios, puntos, coma, &, apóstrofe, guión, paréntesis
                /^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜa-záéíóúñü\s.,&'()-]+$/.test(cleaned) &&
                // Excluir palabras clave que no son nombres
                !/^(ORIGINAL|DUPLICADO|SUBTOTAL|IVA|TOTAL|FECHA|Factura|Comprobante|Recibo)$/i.test(cleaned) &&
                // Excluir nombres de una sola palabra totalmente en minúsculas (logos de marca)
                !/^[a-záéíóúñü]+$/.test(cleaned) &&
                // Preferir líneas con al menos 2 palabras o que contengan puntos de iniciales (A.)
                (/\s/.test(cleaned) || /[A-ZÁÉÍÓÚÑÜ]\.\s*[A-ZÁÉÍÓÚÑÜ]/.test(cleaned))
            ) {
                return cleaned;
            }
        }

        // 4. Líneas con forma societaria (S.A., S.R.L., etc.) en las primeras 20 líneas
        for (let i = 0; i < Math.min(lines.length, 20); i++) {
            const line = lines[i];
            if (
                /\b(S\.?A\.?S?\.?|S\.?R\.?L\.?|S\.?C\.?|S\.?H\.?|SOCIEDAD|SAS\b)\b/i.test(line) &&
                !/FACTURA|ORIGINAL|DUPLICADO|CUIT|FECHA|CODIGO|IVA|TOTAL/i.test(line)
            ) {
                return line.replace(/[\d\-:/]/g, '').trim().substring(0, 80);
            }
        }

        // 5. Primera línea con al menos 2 palabras y primer carácter mayúscula (sin números)
        for (let i = 0; i < Math.min(lines.length, 10); i++) {
            const line = lines[i].trim();
            if (
                line.length > 5 &&
                line.length < 70 &&
                /^[A-ZÁÉÍÓÚÑÜ]/.test(line) &&          // inicia con mayúscula
                /\s/.test(line) &&                      // tiene al menos 2 palabras
                /^[A-ZÁÉÍÓÚÑÜ\s.,&'.-]+$/i.test(line) &&
                !/^(FACTURA|ORIGINAL|DUPLICADO|CUIT|FECHA|CODIGO|IVA|TOTAL|SUBTOTAL)$/i.test(line)
            ) {
                return line;
            }
        }

        return null;
    }

    private static extractRazonSocialReceptor(text: string, lines: string[]): string | null {
        // "Nombre:" cubre Pavanetto y similares; "Cliente:" cubre Griguol; "Sr.:" tradicional
        let m = text.match(
            /(?:Sr\.?\s*\(?s?\)?|Señor(?:es)?|Cliente|Nombre|Raz[oó]n\s+Social\s+del?\s+Receptor)[\s:]+([^\n]{3,80})/i,
        );
        if (m) {
            let val = m[1]
                .replace(/^\/\s*Raz[oó]n\s+Social\s*:?\s*/i, '')            // "/ Razón Social: " como prefijo
                .replace(/^Raz[oó]n\s+Social\s*:?\s*/i, '')                 // "Razón Social: " como prefijo
                .replace(/\d{2}-\d{8}-\d/g, '')                             // quitar CUITs inline
                .replace(/\s*Nro\.?\s*(?:Cliente|Cl\.?)?[:\s]*\d+.*/i, '')  // "Nro. Cliente: 186"
                .replace(/\s*N[°º]\s*(?:Cliente|Cl\.?)?[:\s]*\d+.*/i, '')   // "N° Cliente: 186"
                .replace(/\s*C[\s.]*U[\s.]*I[\s.]*T[\s.]*\s*.*/i, '')       // CUIT al final
                .replace(/\s+\d{11}\s*$/, '')                                // CUIT como digits crudos al final
                .replace(/\s+\d{8,}\s*$/, '')                                // otros números largos al final
                .trim();
            if (val.length > 2) return val;
        }
        return null;
    }

    // ── Domicilio ─────────────────────────────────────────────────────────────

    private static extractDomicilio(text: string, lines: string[]): string | null {
        // Acotar al encabezado del emisor (antes del bloque receptor/cliente)
        const clienteIdx = text.search(/\bCliente\b|\bNombre\b|\bSr\.?\s*\(?s?\)?[\s:]|\bReceptor\b|\bComprador\b/i);
        const headerText = clienteIdx > 0 ? text.slice(0, clienteIdx) : text.slice(0, 600);

        // 1. Con etiqueta explícita en el encabezado
        let m = headerText.match(
            /(?:Domicilio(?:\s+Comercial)?|Direcci[oó]n(?:\s+Comercial)?)[\s:]+([^\n]{5,100})/i,
        );
        if (m) return m[1].trim();

        // 2. Dirección sin etiqueta: buscar en líneas del encabezado
        //    Patrón: tiene número de calle + nombre + separador con ciudad
        for (const line of headerText.split('\n').map(l => l.trim()).filter(Boolean)) {
            if (
                line.length >= 8 &&
                line.length <= 90 &&
                /\b\d{2,5}\b/.test(line) &&          // número de calle
                /[A-ZÁÉÍÓÚÑÜ]{3,}/i.test(line) &&   // nombre de calle/ciudad
                !/(?:FACTURA|ORIGINAL|CUIT|C\.U\.I\.T|IVA|FECHA|CAE|N[°º]|N[úu]mero|Nro|Inicio|Actividad|Factura|C[oó]digo|Subtotal|Total|Importe|Descripci[oó]n|Per[íi]odo|Remito)/i.test(line) &&
                !/^\d{4,5}[-–]\d{6,8}$/.test(line) &&               // no es número de comprobante
                !/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(line) &&  // no es fecha pura
                (/[-,]\s+[A-ZÁÉÍÓÚÑÜ]/.test(line) ||                 // tiene "- CIUDAD" o ", Ciudad"
                    /\b(?:BUENOS\s+AIRES|CÓRDOBA|CORDOBA|ROSARIO|MENDOZA|TUCUMÁN|TUCUMAN|SALTA|SANTA\s+FE|CORRIENTES|MISIONES)\b/i.test(line))
            ) {
                return line;
            }
        }

        // 3. Con etiqueta "Domicilio Comercial" en el documento completo (sin "Dirección"
        //    para no capturar la dirección del receptor que suele usar ese label)
        m = text.match(/Domicilio(?:\s+Comercial)?[\s:]+([^\n]{5,100})/i);
        if (m) return m[1].trim();

        return null;
    }

    // ── Condición IVA ─────────────────────────────────────────────────────────

    private static extractCondicionIva(text: string): string | null {
        let m = text.match(
            /Condici[oó]n\s+(?:ante\s+el\s+|frente\s+al?\s+)?IVA[\s:]+([^\n]{3,50})/i,
        );
        if (m) return m[1].trim().split(/\s{2,}/)[0];

        // Keywords directas en orden de especificidad (más específico primero)
        const keywords = [
            'IVA MONOTRIBUTO',
            'Responsable Inscripto',
            'Responsable Monotributo',
            'Monotributista',
            'Monotributo',
            'No Responsable',
            'Consumidor Final',
            'Sujeto Exento',
            'Exento',
        ];
        for (const kw of keywords) {
            if (new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'i').test(text)) return kw;
        }

        return null;
    }

    // ── Montos ────────────────────────────────────────────────────────────────

    private static extractSubtotal(text: string): number | null {
        const labels = ['Importe Neto Gravado', 'Neto Gravado', 'Subtotal', 'Sub Total', 'Sub-Total', 'Base Imponible', 'Neto'];

        // Intento 1: etiqueta seguida del monto en la misma línea
        const val = this.extractMontoByLabel(text, labels);
        if (val !== null) return val;

        // Intento 2: layout de columnas → primer monto de la fila de valores siguiente
        return this.extractMontoColumna(text, labels, 'first');
    }

    private static extractIva(text: string): number | null {
        // Patrón 1: línea de IVA explícita con separador claro.
        // "IVA 21%: 210,00" / "Alícuota IVA 21%: 210,00" / "I.V.A.: 210,00"
        // Requiere separador (: o $) para no confundir con "IVA 21,0%" de header de columna.
        // (?!\s+Contenido) evita solaparse con las líneas de Transparencia Fiscal.
        // (?!\s*%) al final evita capturar la alícuota "21,0%" como si fuera el monto.
        let m = text.match(
            /(?:Al[ií]cuota\s+)?I\.?V\.?A\.?(?!\s+Contenido)\s*(?:21|10[.,]5|27|0)?\s*%?\s*[:\s$]+\$?\s*([\d][\d.]*,[\d]{1,2})(?!\s*%)/i,
        );
        if (m) {
            const val = this.parseArgentineNumber(m[1].trim());
            if (val >= 0) return val;
        }

        // Patrón 2: "IVA Contenido: [XX%] $ amount" (Ley 27.743 - Transparencia Fiscal).
        // Maneja formatos como:
        //   "IVA Contenido: $ 1.800.560,58"       (INFORCE — sin alícuota explícita)
        //   "IVA Contenido: 21% $ 54.646,86"      (BOGAMAC — con alícuota antes del $)
        //   "IVA Contenido: $\n1.800.560,58"       (pdfjs a veces parte la línea)
        // Usa Set para deduplicar: PDFs con múltiples páginas (Original+Duplicado) repiten el
        // mismo monto; facturas con más de una alícuota tienen montos distintos que sí se suman.
        const ivaContenidoRe = /IVA\s+Contenido\s*[:\s]*(?:\d+[.,]?\d*\s*%\s*)?\$?\s*([\d][\d.]*,[\d]{1,2})/gi;
        const uniqueIvaAmounts = new Set<number>();
        let mc: RegExpExecArray | null;
        while ((mc = ivaContenidoRe.exec(text)) !== null) {
            uniqueIvaAmounts.add(this.parseArgentineNumber(mc[1]));
        }
        if (uniqueIvaAmounts.size > 0) {
            return [...uniqueIvaAmounts].reduce((a, b) => a + b, 0);
        }

        // Patrón 3: layout de columnas → segundo monto de la fila de valores.
        // "Subtotal  IVA 21,0%  IVA 10,5%  TOTAL"
        // "37.144,00  0,00       0,00        37.144,00"
        const ivaLabels = ['IVA', 'I.V.A.'];
        return this.extractMontoColumna(text, ivaLabels, 'second');
    }

    private static extractTotal(text: string): number | null {
        const labels = ['Importe Total', 'Total a Pagar', 'Total General', 'TOTAL', 'Total'];

        // Intento 1: etiqueta seguida del monto en la misma línea
        const val = this.extractMontoByLabel(text, labels);
        if (val !== null) return val;

        // Intento 2: layout de columnas → último monto de la fila de valores siguiente
        return this.extractMontoColumna(text, labels, 'last');
    }

    /**
     * Busca una etiqueta y extrae el monto que la sigue (misma línea o inmediata siguiente).
     */
    static extractMontoByLabel(text: string, labels: string[]): number | null {
        for (const label of labels) {
            const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // (?<![.\w]) evita que "Total" matchee dentro de "Imp.Total" o "SubTotal"
            const regex = new RegExp(
                `(?<![.\\w])${escaped}\\b[\\s\\n:$]*(\\$?\\s*[\\d][\\d\\s.]*,[\\d]{1,2})`,
                'i',
            );
            const m = text.match(regex);
            if (m) {
                const val = this.parseArgentineNumber(m[1].replace(/\$/g, '').trim());
                if (val > 0) return val;
            }
        }
        return null;
    }

    /**
     * Para el layout de columnas donde los montos están en la línea SIGUIENTE a las etiquetas.
     * Ejemplo:
     *   "Subtotal  IVA 21,0%  IVA 10,5%  TOTAL"  ← fila de labels
     *   "37.144,00  0,00  0,00  37.144,00"         ← fila de valores
     *
     * Usa formato argentino: miles con punto, decimales con coma (ej: 37.144,00).
     * El regex /\d[\d.]*,\d{2}/g captura números completos evitando partir "37.144,00".
     *
     * position:
     *   'first'  → primer monto  (Subtotal)
     *   'second' → segundo monto (IVA 21%)
     *   'last'   → último monto  (Total)
     */
    private static extractMontoColumna(
        text: string,
        labels: string[],
        position: 'first' | 'second' | 'last',
    ): number | null {
        for (const label of labels) {
            const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Buscar etiqueta al final de una línea seguida de una línea con números
            const regex = new RegExp(`${escaped}[^\n]*\n([\\d][\\d\\s.,]*)`, 'i');
            const m = text.match(regex);
            if (m) {
                // Formato argentino: miles con punto, decimales con coma → /\d[\d.]*,\d{2}/g
                // Esto evita partir "37.144,00" en "37.14" + "4,00"
                const nums = m[1].match(/\d[\d.]*,\d{2}/g);
                if (nums && nums.length > 0) {
                    let target: string;
                    if (position === 'last')        target = nums[nums.length - 1];
                    else if (position === 'second') target = nums.length >= 2 ? nums[1] : nums[0];
                    else                            target = nums[0];
                    const val = this.parseArgentineNumber(target);
                    if (val >= 0) return val;
                }
            }
        }
        return null;
    }

    // ── CAE ───────────────────────────────────────────────────────────────────

    private static extractCAE(text: string): string | null {
        // [\s.]* maneja "C.A.E.", "CAE", "C A E", "C . A . E ." (pdfjs char-by-char)
        // También: "Código de Autorización Electrónica"
        let m = text.match(
            /(?:C[\s.]*A[\s.]*E[\s.]*|C[oó]d(?:igo)?\s+de\s+Autorizaci[oó]n\s+Electr[oó]nica)\s*(?:N[úu]mero|N[°º]?r?\.?)?\s*:?\s*(\d{14})/i,
        );
        if (m) return m[1];

        // Fallback: keyword "CAE" + 14 dígitos cercanos (hasta 30 chars de distancia)
        m = text.match(/C[\s.]*A[\s.]*E[\s.]*[^\d]{0,30}?(\d{14})/i);
        if (m) return m[1];

        // Último recurso: 14 dígitos que empiezan con 6, 7 u 8 (prefijos reales de CAE AFIP)
        // no embebidos en una secuencia más larga
        m = text.match(/(?<!\d)([678]\d{13})(?!\d)/);
        if (m) return m[1];

        return null;
    }

    private static extractFechaVtoCae(text: string): string | null {
        // Anclar al bloque CAE para no confundir con el "Vto:" de pago del encabezado.
        // [\s.]* maneja "C . A . E ." reconstruido por pdfjs.
        const caeBlock = text.match(/C[\s.]*A[\s.]*E[\s.]*[^\n]*\d{14}/i);
        if (caeBlock) {
            const startIdx = Math.max(0, (caeBlock.index ?? 0) - 60);
            const caeArea = text.slice(startIdx, startIdx + 400);
            const m = caeArea.match(
                /(?:Fecha\s+)?V(?:to|enci?(?:miento)?)\.?\s*(?:de\s+)?(?:C\.?A\.?E\.?)?[\s:]+(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/i,
            );
            if (m) return this.formatDate(m[1], m[2], m[3]);
        }
        // Fallback: "Vencimiento:" suelto (Griguol: misma línea que CAE)
        const m = text.match(
            /\bVencimiento\s*[:\s]+(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/i,
        );
        if (m) return this.formatDate(m[1], m[2], m[3]);
        return null;
    }

    // ── Nuevos campos ─────────────────────────────────────────────────────────

    private static extractCondicionIvaReceptor(text: string): string | null {
        const clienteIdx = text.search(/\bCliente\b|\bNombre\b|\bSr\.?\s*\(?s?\)?[\s:]|\bReceptor\b|\bComprador\b/i);
        if (clienteIdx < 0) return null;

        const itemsIdx = text.search(/\bDescripci[oó]n\b/i);
        const endIdx = itemsIdx > clienteIdx ? itemsIdx : clienteIdx + 500;
        const receptorText = text.slice(clienteIdx, endIdx);

        // "Cond.IVA EXENTO" / "Cond. de IVA: Exento"
        let m = receptorText.match(/Cond(?:ici[oó]n)?\.?\s*IVA\s*[:\s]+([A-ZÁÉÍÓÚÑÜ][^\n]{2,25})/i);
        if (m) return m[1].trim();

        // "IVA: Exento" / "IVA: Consumidor Final"
        // Nota: en facturas ICARO/Sicar "CUIT/DNI/LC/LE:" aparece en la misma línea
        // que "IVA: Consumidor Final" (pdfjs fusiona columnas horizontales).
        // Se limpia todo lo que venga después de "CUIT" o de "/".
        m = receptorText.match(/\bIVA\s*[:\s]+([A-ZÁÉÍÓÚÑÜ][^\n]{2,25})/i);
        if (m) {
            const val = m[1]
                .replace(/\s+C[\s.]*U[\s.]*I[\s.]*T.*/i, '')
                .replace(/\s*\/.*$/, '')
                .split(/\s{2,}|\t/)[0]
                .trim();
            if (val.length >= 3 && !/^\d/.test(val)) return val;
        }

        const keywords = ['Consumidor Final', 'Exento', 'No Responsable', 'Responsable Inscripto', 'Monotributo'];
        for (const kw of keywords) {
            if (new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'i').test(receptorText)) return kw;
        }

        return null;
    }

    private static extractDomicilioReceptor(text: string): string | null {
        const clienteIdx = text.search(/\bCliente\b|\bNombre\b|\bSr\.?\s*\(?s?\)?[\s:]|\bReceptor\b|\bComprador\b/i);
        if (clienteIdx < 0) return null;

        const itemsIdx = text.search(/\bDescripci[oó]n\b/i);
        const endIdx = itemsIdx > clienteIdx ? itemsIdx : clienteIdx + 600;
        const receptorText = text.slice(clienteIdx, endIdx);

        const m = receptorText.match(/(?:Domicilio|Direcci[oó]n)\s*[:\s]+([^\n]{5,80})/i);
        if (m) {
            const val = m[1]
                .replace(/\s*(?:Ing\.?\s*Brutos?|C[\s.]*U[\s.]*I[\s.]*T|IVA|Cond\.?|Localidad|Remito).*/i, '')
                .trim();
            if (val.length >= 5) return val;
        }
        return null;
    }

    private static extractCondicionVenta(text: string): string | null {
        const m = text.match(
            /Cond(?:ici[oó]n)?\.?\s*(?:de\s+)?Venta\s*[:\s]+([^\n]{3,30})/i,
        );
        if (m) return m[1].trim();
        return null;
    }

    private static extractDescripcion(text: string): string | null {
        const tableHeaderIdx = text.search(/\bDescripci[oó]n\b/i);
        if (tableHeaderIdx < 0) return null;

        const afterHeader = text.slice(tableHeaderIdx);
        const lines = afterHeader.split('\n').slice(1).map(l => l.trim()).filter(Boolean);

        for (const line of lines.slice(0, 10)) {
            if (/^(C[oó]d|Cant|Precio|Pr\.|Importe|N[°º]|Descripci[oó]n|Subtotal|Total|IVA|Son\s+pesos|Obs|NOTA|Per[íi]odo)/i.test(line)) continue;
            if (line.length < 8) continue;
            if (/^\d{4,5}[-–]\d{6,8}$/.test(line)) continue;

            // Quitar cantidad/código iniciales (dígitos + espacios al comienzo)
            let cleaned = line.replace(/^[\d\s.,]{1,20}(?=[A-ZÁÉÍÓÚÑÜa-záéíóúñü])/, '').trim();
            // Quitar precios al final (formato argentino: nnn.nnn,nn)
            cleaned = cleaned.replace(/(\s+[\d.]+,\d{1,2}){1,5}\s*$/, '').trim();

            if (cleaned.length >= 8 && /[A-ZÁÉÍÓÚÑÜa-záéíóúñü]{3,}/.test(cleaned)) {
                return cleaned.substring(0, 120);
            }
        }
        return null;
    }

    private static extractPeriodo(text: string): string | null {
        // "PERIODO: FEBRERO 2026" / "Período: 02 / 2026"
        let m = text.match(/Per[íi]odo\s*:?\s*([^\n]{3,20})/i);
        if (m) return m[1].trim();
        // Período embebido en descripción como "(MM/YYYY)"
        m = text.match(/\((\d{2}\/\d{4})\)/);
        if (m) return m[1];
        return null;
    }

    private static extractFechaVencimientoPago(text: string): string | null {
        // El vto de pago está en el encabezado/receptor, antes de la tabla de ítems
        const itemsIdx = text.search(/\bDescripci[oó]n\b/i);
        const headerArea = itemsIdx > 50 ? text.slice(0, itemsIdx) : text.slice(0, 700);

        const m = headerArea.match(
            /\bVto\.?\s*(?:Pago|Factura|Cliente)?\s*[:\s]+(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/i,
        );
        if (m) return this.formatDate(m[1], m[2], m[3]);
        return null;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Convierte formato argentino "1.496.314,24" → 1496314.24
     */
    static parseArgentineNumber(str: string): number {
        const cleaned = str.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    }

    private static formatDate(day: string, month: string, year: string): string {
        const d = day.padStart(2, '0');
        const mo = month.padStart(2, '0');
        // Sanity: mes 1-12
        if (parseInt(mo) < 1 || parseInt(mo) > 12) return `${year}-${d}-${mo}`;
        return `${year}-${mo}-${d}`;
    }
}
