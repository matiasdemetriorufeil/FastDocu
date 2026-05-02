'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Bell, Upload, ChevronDown, X } from 'lucide-react';

interface HeaderProps {
    onUpload?: () => void;
    onSearch?: (query: string) => void;
}

export default function Header({ onUpload, onSearch }: HeaderProps) {
    const [searchValue, setSearchValue] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    const [hasNotifications] = useState(true);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchValue(e.target.value);
        onSearch?.(e.target.value);
    };

    const clearSearch = () => {
        setSearchValue('');
        onSearch?.('');
    };

    return (
        <header
            className="flex h-[64px] items-center gap-4 px-6 flex-shrink-0 border-b sticky top-0 z-10 bg-white"
            style={{ borderColor: 'var(--border)' }}
        >
            {/* Search */}
            <div className="relative flex-1 max-w-[400px]">
                <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-[15px] w-[15px] pointer-events-none transition-colors"
                    style={{ color: searchFocused ? 'var(--accent)' : 'var(--text-muted)' }}
                />
                <input
                    type="text"
                    value={searchValue}
                    onChange={handleSearch}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    placeholder="Buscar documentos, proveedores, CUIT..."
                    className="w-full rounded-lg pl-9 pr-9 py-[7px] text-sm border outline-none transition-all"
                    style={{
                        borderColor: searchFocused ? 'var(--accent)' : 'var(--border)',
                        background: searchFocused ? '#fff' : 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        boxShadow: searchFocused ? '0 0 0 3px var(--accent-muted)' : 'none',
                    }}
                />
                <AnimatePresence>
                    {searchValue && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            onClick={clearSearch}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full transition-colors hover:bg-slate-200"
                        >
                            <X className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 ml-auto">
                {/* Upload */}
                <button
                    onClick={onUpload}
                    className="flex items-center gap-1.5 rounded-lg px-4 py-[7px] text-sm font-semibold text-white transition-colors"
                    style={{ background: 'var(--accent)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
                >
                    <Upload className="h-[14px] w-[14px]" />
                    Subir archivo
                </button>

                <div className="h-5 w-px mx-1" style={{ background: 'var(--border)' }} />

                {/* Notifications */}
                <button
                    className="relative flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-slate-50"
                    style={{ borderColor: 'var(--border)' }}
                >
                    <Bell className="h-[15px] w-[15px]" style={{ color: 'var(--text-secondary)' }} />
                    {hasNotifications && (
                        <span
                            className="absolute top-[7px] right-[7px] h-[7px] w-[7px] rounded-full ring-[1.5px] ring-white"
                            style={{ background: '#ef4444' }}
                        />
                    )}
                </button>

                {/* Profile */}
                <button
                    className="flex items-center gap-2 rounded-lg pl-1.5 pr-2 py-1 transition-colors hover:bg-slate-50"
                >
                    <div
                        className="h-7 w-7 rounded-md flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                        style={{ background: '#3451b2' }}
                    >
                        LM
                    </div>
                    <div className="hidden sm:flex flex-col items-start">
                        <span className="text-[13px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
                            L. Méndez
                        </span>
                        <span
                            className="text-[10px] uppercase tracking-wider font-medium leading-tight"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            Admin
                        </span>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                </button>
            </div>
        </header>
    );
}
