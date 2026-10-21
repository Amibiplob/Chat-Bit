"use client";
import { NavigationLink } from '@/components/navigation/navigation-link';
import { MessageCircle, Phone, Users, Settings } from 'lucide-react';

const destinations = [
  { href: '/chat', label: 'Chats', icon: MessageCircle },
  { href: '/calls', label: 'Calls', icon: Phone },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];
export function MobileNavigation({ pathname, unread }: { pathname: string; unread: boolean }) {
  return <nav aria-label="Mobile navigation" className="cb-mobile-navigation md:hidden">
    {destinations.map(({ href, label, icon: Icon }) => {
      const active = pathname === href || pathname.startsWith(href + '/');
      return <NavigationLink key={href} href={href} aria-current={active ? 'page' : undefined} className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground">
        <span className={`relative flex h-7 w-14 items-center justify-center rounded-full ${active ? 'bg-primary/12 text-primary' : ''}`}><Icon className="size-5"/>{href === '/chat' && unread && <span aria-label="Unread conversations" className="absolute right-3 top-0 size-2 rounded-full bg-primary"/>}</span>{label}
      </NavigationLink>;
    })}
  </nav>;
}
