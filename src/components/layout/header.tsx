'use client';

import Link from 'next/link';
import { Package2, Menu, UserCircle, Store, ShoppingBag, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import { CartIcon } from '@/components/cart/cart-icon';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useFirebase } from '@/firebase';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { getAuth, signOut } from 'firebase/auth';
import { useState } from 'react';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/stores', label: 'Stores' },
];

const customerLinks = [
    { href: '/dashboard/my-orders', label: 'My Orders', icon: ShoppingBag},
]

const ownerLinks = [
    { href: '/dashboard/my-store', label: 'My Store', icon: Store },
    { href: '/dashboard/orders', label: 'Store Orders', icon: ShoppingBag },
]

const deliveryLinks = [
    { href: '/dashboard/deliveries', label: 'Deliveries', icon: Truck },
]


function UserMenu() {
  const { user, isUserLoading } = useFirebase();
  const [isOwnerView, setIsOwnerView] = useState(false);

  const handleLogout = async () => {
    const auth = getAuth();
    await signOut(auth);
  };

  if (isUserLoading) {
    return <Skeleton className="h-10 w-10 rounded-full" />;
  }

  if (!user) {
    return (
      <Button asChild variant="outline">
        <Link href="/login">Login</Link>
      </Button>
    );
  }

  const visibleDashboardLinks = isOwnerView ? [...ownerLinks, ...deliveryLinks] : customerLinks;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" className="rounded-full">
          <UserCircle className="h-5 w-5" />
          <span className="sr-only">Toggle user menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuItem disabled>{user.email}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
            checked={isOwnerView}
            onCheckedChange={setIsOwnerView}
        >
            Store Owner/Partner View
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Dashboard</DropdownMenuLabel>
        {visibleDashboardLinks.map(({ href, label, icon: Icon }) => (
             <Link key={href} href={href} passHref>
                <DropdownMenuItem>
                    <Icon className="mr-2 h-4 w-4" />
                    <span>{label}</span>
                </DropdownMenuItem>
             </Link>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Add Skeleton component for loading state
function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}


export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 md:px-6">
      <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold md:text-base"
        >
          <Package2 className="h-6 w-6 text-primary" />
          <span className="font-headline">LocalBasket</span>
        </Link>
        {navLinks.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'transition-colors hover:text-foreground',
              pathname === href ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="shrink-0 md:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
           <SheetHeader>
            <SheetTitle>
                 <Link
                    href="/"
                    className="flex items-center gap-2 text-lg font-semibold"
                    >
                    <Package2 className="h-6 w-6 text-primary" />
                    <span className="font-headline">LocalBasket</span>
                </Link>
            </SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col justify-between">
            <nav className="grid gap-6 text-lg font-medium mt-8">
                {navLinks.map(({ href, label }) => (
                <SheetClose asChild key={href}>
                    <Link
                        href={href}
                        className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                        pathname === href && 'text-primary'
                        )}
                    >
                        {label}
                    </Link>
                </SheetClose>
                ))}
            </nav>
            <div className="border-t pt-4">
                <p className="px-3 text-sm font-medium text-muted-foreground mb-2">Dashboard</p>
                <div className="grid gap-2">
                    {[...customerLinks, ...ownerLinks, ...deliveryLinks].map(({ href, label, icon: Icon }) => (
                    <SheetClose asChild key={href}>
                        <Link
                            href={href}
                            className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
                        >
                            <Icon className="h-4 w-4" />
                            {label}
                        </Link>
                    </SheetClose>
                    ))}
                </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <div className="flex w-full items-center justify-end gap-4 md:ml-auto md:gap-2 lg:gap-4">
        <CartIcon />
        <UserMenu />
      </div>
    </header>
  );
}
