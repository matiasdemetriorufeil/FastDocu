export class CuitValidator {
    /**
     * Extrae el primer CUIT válido encontrado en un texto.
     * Acepta formatos con o sin guiones.
     */
    static extract(text: string): string | null {
        // Busca 11 dígitos que empiecen por 20, 23, 24, 27, 30, 33 o 34
        // Puede contener o no guiones en las posiciones correctas.
        const regex = /\b(20|23|24|27|30|33|34)[-._\s]?([0-9]{8})[-._\s]?([0-9])\b/g;

        let match;
        while ((match = regex.exec(text)) !== null) {
            const cleanCuit = match[0].replace(/\D/g, '');
            // Verificamos matemáticamente para evitar falsos positivos (ej. números de teléfono)
            if (this.isValid(cleanCuit)) {
                return cleanCuit;
            }
        }

        return null;
    }

    /**
     * Implementación estricta del Módulo 11 para CUIT argentino.
     */
    static isValid(cuit: string): boolean {
        if (!cuit || cuit.length !== 11) return false;

        const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
        const documentStr = cuit.substring(0, 10);
        const verifier = parseInt(cuit.charAt(10), 10);

        let sum = 0;
        for (let i = 0; i < 10; i++) {
            sum += parseInt(documentStr.charAt(i), 10) * multipliers[i];
        }

        const mod = sum % 11;
        let expectedVerifier = 11 - mod;

        if (expectedVerifier === 11) expectedVerifier = 0;
        if (expectedVerifier === 10) expectedVerifier = 9; // Caso excepcional AFIP

        return verifier === expectedVerifier;
    }
}
