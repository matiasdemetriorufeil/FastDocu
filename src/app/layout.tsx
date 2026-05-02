import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-outfit',
  weight: ['300', '400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'FastDocu — Validación Documental Inteligente',
  description:
    'Plataforma de validación y conciliación de documentos fiscales para empresas argentinas. Detectá inconsistencias, duplicados y errores en facturas y comprobantes.',
  keywords: 'factura electrónica, validación CUIT, CAE, IVA, conciliación documental, Argentina',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${outfit.variable}`}>
      <body className="antialiased overflow-hidden">{children}</body>
    </html>
  );
}
