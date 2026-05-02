import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfjs-dist', 'tesseract.js', 'jimp', 'jsqr'],
};

export default nextConfig;
