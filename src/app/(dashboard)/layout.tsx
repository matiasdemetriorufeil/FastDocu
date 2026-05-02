'use client';

import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import UploadModal from '@/components/ui/UploadModal';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [isUploadOpen, setIsUploadOpen] = useState(false);

    return (
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--surface)' }}>
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
                <Header onUpload={() => setIsUploadOpen(true)} />
                <main className="flex-1 overflow-y-auto p-8">
                    {children}
                </main>
            </div>
            <UploadModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />
        </div>
    );
}
