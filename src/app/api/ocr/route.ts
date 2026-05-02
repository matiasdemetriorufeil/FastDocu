import { NextRequest, NextResponse } from 'next/server';
import { DocumentScanner } from '@/lib/ocr';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'Falta enviar el archivo (campo "file").' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // DocumentScanner procesará el buffer resolviendo con Tesseract o pdf-parse
        // según el mimetype.
        const resultado = await DocumentScanner.processDocument(buffer, file.type);

        return NextResponse.json(resultado);
    } catch (err: any) {
        console.error('[API/OCR] Error processing file:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
