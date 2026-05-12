'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
    Search, Bell, Upload, ChevronDown, X,
    FileText, CheckCircle2, Clock, AlertTriangle, Settings, LogOut,
} from 'lucide-react';
import { useDocumentsStore } from '@/hooks/useDocuments';
import { formatCurrency } from '@/lib/validators';
import type { DocumentStatus } from '@/types';

const STATUS_DOT: Record<DocumentStatus, string> = {
    aprobado:  '#16a34a',
    pendiente: '#ca8a04',
    revisar:   '#ea580c',
    observado: '#ef4444',
    duplicado: '#8b5cf6',
    archivado: '#94a3b8',
};

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
}

interface HeaderProps {
    onUpload?: () => void;
}

export default function Header({ onUpload }: HeaderProps) {
    const router   = useRouter();
    const pathname = usePathname();

    const searchValue  = useDocumentsStore((s) => s.filters.search);
    const updateFilter = useDocumentsStore((s) => s.updateFilter);
    const documents    = useDocumentsStore((s) => s.documents);

    const [searchFocused, setSearchFocused] = useState(false);
    const [notifOpen,  setNotifOpen]  = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);

    const inputRef   = useRef<HTMLInputElement>(null);
    const notifRef   = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    // ⌘K focus
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // Click-outside para cerrar dropdowns
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(e.target as Node))
                setNotifOpen(false);
            if (profileRef.current && !profileRef.current.contains(e.target as Node))
                setProfileOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        updateFilter('search', value);
        if (value && !pathname.startsWith('/documents')) {
            router.push('/documents');
        }
    };

    const clearSearch = () => {
        updateFilter('search', '');
        inputRef.current?.focus();
    };

    // Últimos 5 documentos para notificaciones
    const recentDocs = [...documents]
        .sort((a, b) => new Date(b.uploadedAt ?? 0).getTime() - new Date(a.uploadedAt ?? 0).getTime())
        .slice(0, 5);

    const hasNotifications = recentDocs.length > 0;

    return (
        <header
            className="flex h-[54px] items-center flex-shrink-0 sticky top-0 z-10 bg-white/95 backdrop-blur-sm"
            style={{ borderBottom: '1px solid var(--border)', boxShadow: '0 1px 0 rgba(0,0,0,0.03)', paddingLeft: '40px', paddingRight: '24px' }}
        >
            {/* Search */}
            <div
                className="relative w-[300px] rounded-full transition-all duration-150"
                style={{
                    marginLeft: '16px',
                    boxShadow: searchFocused ? '0 0 0 3px rgba(79,70,229,0.12)' : 'none',
                }}
            >
                <Search
                    className="absolute top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-150"
                    style={{ left: '16px', width: '14px', height: '14px', color: searchFocused ? 'var(--accent)' : 'var(--text-muted)' }}
                />
                <input
                    ref={inputRef}
                    type="text"
                    value={searchValue}
                    onChange={handleSearch}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    placeholder="Buscar documentos, proveedores, CUIT..."
                    className="w-full rounded-full py-[7px] text-sm outline-none transition-all duration-150"
                    style={{
                        paddingLeft: '46px',
                        paddingRight: '64px',
                        background: searchFocused ? '#fff' : '#f1f3f7',
                        border: `1.5px solid ${searchFocused ? 'var(--accent)' : 'transparent'}`,
                        color: 'var(--text-primary)',
                    }}
                />

                <AnimatePresence>
                    {!searchFocused && !searchValue && (
                        <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        >
                            <kbd
                                className="px-1.5 py-0.5 rounded-md text-[10px] font-medium font-mono"
                                style={{ background: '#e5e7eb', color: 'var(--text-muted)', lineHeight: '1.4' }}
                            >
                                ⌘K
                            </kbd>
                        </motion.span>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {searchValue && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            onClick={clearSearch}
                            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full transition-colors hover:bg-slate-200"
                        >
                            <X className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            {/* Upload — next to search */}
            <motion.button
                onClick={onUpload}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                className="group flex items-center gap-2 rounded-full text-[13px] font-semibold text-white transition-all duration-200 whitespace-nowrap flex-shrink-0"
                style={{
                    marginLeft: '40px',
                    padding: '7px 18px',
                    background: 'linear-gradient(160deg, #6366f1 0%, #4338ca 100%)',
                    boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset, 0 2px 10px rgba(79,70,229,0.35)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 0 rgba(255,255,255,0.15) inset, 0 4px 18px rgba(79,70,229,0.5)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 0 rgba(255,255,255,0.15) inset, 0 2px 10px rgba(79,70,229,0.35)'; }}
            >
                <Upload className="h-3.5 w-3.5 opacity-90 transition-transform duration-200 group-hover:-translate-y-px" />
                Subir archivo
            </motion.button>

            {/* Spacer — empuja bell/profile al extremo derecho */}
            <div className="flex-1" />

            {/* Bell + Profile — esquina derecha */}
            <div className="flex items-center gap-2 flex-shrink-0">

                {/* Notifications */}
                <div ref={notifRef} className="relative">
                    <button
                        onClick={() => { setNotifOpen((v) => !v); setProfileOpen(false); }}
                        className="relative flex h-8 w-8 items-center justify-center rounded-xl transition-colors hover:bg-slate-100"
                    >
                        <Bell className="h-[15px] w-[15px]" style={{ color: 'var(--text-secondary)' }} />
                        {hasNotifications && (
                            <span
                                className="absolute top-1.5 right-1.5 h-[7px] w-[7px] rounded-full ring-[1.5px] ring-white"
                                style={{ background: '#ef4444' }}
                            />
                        )}
                    </button>

                    <AnimatePresence>
                        {notifOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                                transition={{ duration: 0.15, ease: 'easeOut' }}
                                className="absolute right-0 top-[calc(100%+8px)] w-[320px] rounded-2xl bg-white overflow-hidden z-50"
                                style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)', border: '1px solid var(--border)' }}
                            >
                                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                                    <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>Actividad reciente</p>
                                    <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>{recentDocs.length} docs</span>
                                </div>

                                <div className="py-1 max-h-[280px] overflow-y-auto">
                                    {recentDocs.length === 0 ? (
                                        <p className="text-center text-sm py-6" style={{ color: 'var(--text-muted)' }}>Sin actividad reciente</p>
                                    ) : recentDocs.map((doc) => (
                                        <Link
                                            key={doc.id}
                                            href={`/documents/${encodeURIComponent(doc.id)}`}
                                            onClick={() => setNotifOpen(false)}
                                            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50"
                                        >
                                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: '#f3f4f6' }}>
                                                <FileText className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{doc.proveedor}</p>
                                                <p className="text-[11px] truncate flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                                                    <span
                                                        className="h-[5px] w-[5px] rounded-full flex-shrink-0"
                                                        style={{ background: STATUS_DOT[doc.status] }}
                                                    />
                                                    {formatCurrency(doc.total, 'ARS')}
                                                </p>
                                            </div>
                                            <span className="text-[10px] font-medium flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                                                {doc.uploadedAt ? timeAgo(doc.uploadedAt) : '—'}
                                            </span>
                                        </Link>
                                    ))}
                                </div>

                                <div className="border-t px-4 py-2.5" style={{ borderColor: 'var(--border)' }}>
                                    <Link
                                        href="/documents"
                                        onClick={() => setNotifOpen(false)}
                                        className="block text-center text-[12px] font-semibold transition-colors"
                                        style={{ color: 'var(--accent)' }}
                                    >
                                        Ver todos los documentos
                                    </Link>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="h-4 w-px" style={{ background: 'var(--border)' }} />

                {/* Profile */}
                <div ref={profileRef} className="relative">
                    <button
                        onClick={() => { setProfileOpen((v) => !v); setNotifOpen(false); }}
                        className="flex items-center gap-2 rounded-xl pl-1.5 pr-2 py-1 transition-colors hover:bg-slate-100"
                    >
                        <div
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                            style={{ background: '#3451b2' }}
                        >
                            LM
                        </div>
                        <div className="hidden sm:flex flex-col items-start">
                            <span className="text-[13px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>L. Méndez</span>
                            <span className="text-[10px] uppercase tracking-wider font-medium leading-tight" style={{ color: 'var(--text-muted)' }}>Admin</span>
                        </div>
                        <ChevronDown
                            className="h-3.5 w-3.5 transition-transform duration-150"
                            style={{
                                color: 'var(--text-muted)',
                                transform: profileOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            }}
                        />
                    </button>

                    <AnimatePresence>
                        {profileOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                                transition={{ duration: 0.15, ease: 'easeOut' }}
                                className="absolute right-0 top-[calc(100%+8px)] w-[200px] rounded-2xl bg-white overflow-hidden z-50"
                                style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)', border: '1px solid var(--border)' }}
                            >
                                {/* User info */}
                                <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                                    <p className="text-[13px] font-bold leading-snug" style={{ color: 'var(--text-primary)' }}>Laura Méndez</p>
                                    <p className="text-[11px] leading-snug mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>Administradora</p>
                                </div>

                                {/* Actions */}
                                <div className="py-1">
                                    <Link
                                        href="/settings"
                                        onClick={() => setProfileOpen(false)}
                                        className="flex items-center gap-2.5 px-4 py-2 text-[13px] font-medium transition-colors hover:bg-slate-50"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        <Settings className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                                        Configuración
                                    </Link>
                                </div>

                                <div className="border-t py-1" style={{ borderColor: 'var(--border)' }}>
                                    <button
                                        onClick={() => setProfileOpen(false)}
                                        className="flex items-center gap-2.5 w-full px-4 py-2 text-[13px] font-medium transition-colors hover:bg-red-50"
                                        style={{ color: '#dc2626' }}
                                    >
                                        <LogOut className="h-3.5 w-3.5 flex-shrink-0" />
                                        Cerrar sesión
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </header>
    );
}
