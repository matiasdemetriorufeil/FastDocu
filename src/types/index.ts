// ─── Document Status ─────────────────────────────────────────────────────────

export type DocumentStatus =
  | 'pendiente'
  | 'aprobado'
  | 'revisar'
  | 'duplicado'
  | 'observado';

// ─── Document Type ────────────────────────────────────────────────────────────

export type DocumentType =
  | 'factura'
  | 'comprobante'
  | 'orden_de_compra'
  | 'nota_de_credito'
  | 'nota_de_debito'
  | 'recibo';

// ─── IVA Rates ───────────────────────────────────────────────────────────────

export type IVARate = 0 | 10.5 | 21 | 27;

// ─── Core Document ───────────────────────────────────────────────────────────

export interface Document {
  id: string;
  filename: string;
  type: DocumentType;
  status: DocumentStatus;
  proveedor: string;
  cuit: string;
  fecha: string;           // ISO date string
  fechaVencimiento?: string;
  neto: number;
  iva: number;
  ivaRate: IVARate;
  total: number;
  cae?: string;
  cai?: string;
  qrCode?: string;
  ordenDeCompra?: string;
  puntoVenta: string;
  numeroComprobante: string;
  moneda: 'ARS' | 'USD';
  uploadedAt: string;      // ISO date string
  uploadedBy: string;
  observaciones?: string;
  fileUrl?: string;        // Blob URL del archivo original — válido en la sesión actual
  tipoLetra?: 'A' | 'B' | 'C';
  razonSocialReceptor?: string;
  cuitReceptor?: string;
  condicionIvaReceptor?: string;
  domicilioComercial?: string;
  domicilioReceptor?: string;
  condicionIva?: string;
  condicionVenta?: string;
  descripcion?: string;
  periodo?: string;
  fechaVencimientoPago?: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  code: string;
  field?: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationResult {
  documentId: string;
  status: DocumentStatus;
  aptoPago: boolean;
  decisionReason: string;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  observations: string[];
  checks: {
    cuitValido: boolean | null;
    ivaCoherente: boolean | null;
    totalCoherente: boolean | null;
    caeValido: boolean | null;
    qrValido: boolean | null;
    duplicado: boolean;
    camposCompletos: boolean;
  };
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface Metric {
  label: string;
  value: number;
  delta?: number;
  deltaType?: 'increase' | 'decrease' | 'neutral';
  icon?: string;
  color?: string;
  status?: DocumentStatus;
}

export interface DashboardMetrics {
  total: number;
  aprobados: number;
  pendientes: number;
  revisar: number;
  duplicados: number;
  observados: number;
  montoTotal: number;
  documentosHoy: number;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
  disabled?: boolean;
}

// ─── Capability Feature ───────────────────────────────────────────────────────

export type CapabilityStatus = 'activo' | 'proximo' | 'beta';

export interface Capability {
  id: string;
  title: string;
  description: string;
  icon: string;
  status: CapabilityStatus;
}

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'analyst' | 'viewer';
  avatar?: string;
  company: string;
}

// ─── Filter ───────────────────────────────────────────────────────────────────

export interface DocumentFilters {
  search: string;
  status: DocumentStatus | 'todos';
  type: DocumentType | 'todos';
  dateFrom?: string;
  dateTo?: string;
  proveedor?: string;
}
