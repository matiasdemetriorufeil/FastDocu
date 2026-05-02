import Anthropic from '@anthropic-ai/sdk';
import type { InvoiceData } from './types';

const SYSTEM_PROMPT = `Sos un experto en facturas argentinas del sistema AFIP.
Tu única función es extraer datos estructurados de facturas y devolverlos en formato JSON estricto.
Devolvé ÚNICAMENTE el objeto JSON, sin texto adicional, explicaciones ni bloques de código markdown.`;

const EXTRACTION_PROMPT = `Analizá esta factura argentina (AFIP) y extraé los datos con este formato JSON exacto:

{
  "tipo_factura": "A" | "B" | "C" | null,
  "numero_factura": string | null,
  "fecha_emision": string | null,
  "cuit_emisor": string | null,
  "razon_social_emisor": string | null,
  "domicilio_comercial": string | null,
  "condicion_iva": string | null,
  "cuit_receptor": string | null,
  "razon_social_receptor": string | null,
  "subtotal": number | null,
  "iva": number | null,
  "total": number | null,
  "cae": string | null,
  "fecha_vencimiento_cae": string | null
}

Reglas:
- tipo_factura: "A", "B" o "C" según el tipo de comprobante (letra del recuadro superior)
- numero_factura: formato "0001-00001234" (punto de venta 4 dígitos + número de comprobante 8 dígitos)
- fechas: formato ISO "YYYY-MM-DD"
- CUITs: formato "XX-XXXXXXXX-X" con guiones
- montos: número decimal con punto (ej: 1234.56), sin signos de moneda ni separadores de miles
- cae: exactamente 14 dígitos numéricos (el número que aparece después de "CAE N°" o "C.A.E.")
- Usá null para cualquier campo que no puedas determinar con certeza`;

export class ClaudeInvoiceExtractor {
    private static client: Anthropic | null = null;

    static isAvailable(): boolean {
        return !!process.env.ANTHROPIC_API_KEY;
    }

    private static getClient(): Anthropic {
        if (!this.client) {
            this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        }
        return this.client;
    }

    /**
     * Extrae datos de una imagen (PNG/JPG) usando Claude Vision.
     */
    static async extractFromImage(
        buffer: Buffer,
        mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
    ): Promise<InvoiceData | null> {
        const client = this.getClient();
        const base64 = buffer.toString('base64');

        const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            system: [
                {
                    type: 'text',
                    text: SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral' },
                },
            ],
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: { type: 'base64', media_type: mimeType, data: base64 },
                        },
                        { type: 'text', text: EXTRACTION_PROMPT },
                    ],
                },
            ],
        });

        return this.parseResponse(response);
    }

    /**
     * Extrae datos de un PDF usando el soporte nativo de Claude para documentos.
     * Funciona tanto con PDFs digitales como escaneados.
     */
    static async extractFromPdf(buffer: Buffer): Promise<InvoiceData | null> {
        const client = this.getClient();
        const base64 = buffer.toString('base64');

        const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            system: [
                {
                    type: 'text',
                    text: SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral' },
                },
            ],
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'document',
                            source: {
                                type: 'base64',
                                media_type: 'application/pdf',
                                data: base64,
                            },
                        },
                        { type: 'text', text: EXTRACTION_PROMPT },
                    ],
                },
            ],
        });

        return this.parseResponse(response);
    }

    /**
     * Extrae datos a partir de texto ya extraído (para PDFs con texto nativo).
     * Más económico en tokens que enviar el PDF completo.
     */
    static async extractFromText(text: string): Promise<InvoiceData | null> {
        const client = this.getClient();

        const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            system: [
                {
                    type: 'text',
                    text: SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral' },
                },
            ],
            messages: [
                {
                    role: 'user',
                    content: `${EXTRACTION_PROMPT}\n\nTexto extraído de la factura:\n\`\`\`\n${text}\n\`\`\``,
                },
            ],
        });

        return this.parseResponse(response);
    }

    private static parseResponse(response: Anthropic.Message): InvoiceData | null {
        const block = response.content[0];
        if (!block || block.type !== 'text') return null;

        // Eliminar posibles bloques de código markdown
        const cleaned = block.text
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        const parsed = JSON.parse(cleaned);
        return parsed as InvoiceData;
    }
}
