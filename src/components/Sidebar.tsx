'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HomeIcon,
  UserGroupIcon,
  AcademicCapIcon,
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  UserMinusIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';

interface SidebarProps {
  currentClassId: string | null;
  className?: string;
}

export default function Sidebar({ currentClassId, className }: SidebarProps) {
  const pathname = usePathname();

  const classBasePath = currentClassId ? `/classes/${currentClassId}` : '';

  const mainLinks = [
    { href: '/', label: 'Dashboard', icon: HomeIcon },
  ];

  const classLinks = currentClassId ? [
    { href: `${classBasePath}/students`, label: 'Students', icon: UserGroupIcon },
    { href: `${classBasePath}/notes`, label: 'Notes', icon: PencilSquareIcon },
    { href: `${classBasePath}/casas-reading`, label: 'CASAS Reading', icon: AcademicCapIcon },
    { href: `${classBasePath}/casas-listening`, label: 'CASAS Listening', icon: AcademicCapIcon },
    { href: `${classBasePath}/tests`, label: 'Unit Tests', icon: ClipboardDocumentListIcon },
    { href: `${classBasePath}/attendance`, label: 'Attendance', icon: CalendarDaysIcon },
    { href: `${classBasePath}/analysis`, label: 'Analysis', icon: ChartBarIcon },
    { href: `${classBasePath}/report-cards`, label: 'Report Cards', icon: DocumentTextIcon },
  ] : [];

  const bottomLinks = [
    { href: '/dropped-students', label: 'Dropped Students', icon: UserMinusIcon },
    { href: '/settings', label: 'Settings', icon: Cog6ToothIcon },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside className={`sidebar w-64 min-h-screen flex flex-col ${className || ''}`}>
      {/* Logo / Header */}
      <div className="p-6 border-b border-white/10">
        <h1 className="text-xl font-bold tracking-tight">CACE Gradebook</h1>
        <p className="text-sm text-white/60 mt-1">A World of Opportunity</p>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {mainLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`sidebar-link ${isActive(link.href) ? 'active' : ''}`}
          >
            <link.icon className="w-5 h-5" />
            {link.label}
          </Link>
        ))}

        {currentClassId && (
          <>
            <div className="pt-4 pb-2">
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-white/40">
                Current Class
              </p>
            </div>
            {classLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`sidebar-link ${isActive(link.href) ? 'active' : ''}`}
              >
                <link.icon className="w-5 h-5" />
                {link.label}
              </Link>
            ))}
          </>
        )}

        {!currentClassId && (
          <div className="pt-4 px-3">
            <p className="text-sm text-white/60 italic">
              Select a class from the dashboard to see more options
            </p>
          </div>
        )}
      </nav>

      {/* Bottom Links */}
      <div className="p-4 border-t border-white/10 space-y-1">
        {bottomLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`sidebar-link ${isActive(link.href) ? 'active' : ''}`}
          >
            <link.icon className="w-5 h-5" />
            {link.label}
          </Link>
        ))}
      </div>
    </aside>
  );
}
