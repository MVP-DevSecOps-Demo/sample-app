import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Define a proper interface for cookie options
interface CookieOptions {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  maxAge?: number;
}

export async function middleware(request: NextRequest) {
  // Skip middleware for static routes to improve performance
  if (shouldSkipMiddleware(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    headers: {
      // Add performance headers
      'Cache-Control': isDynamicRoute(request.nextUrl.pathname) 
        ? 'no-store, max-age=0'
        : 'public, max-age=3600, stale-while-revalidate=86400',
    }
  });
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )
  
  try {
    // Only refresh session if needed based on URL path
    if (needsAuthCheck(request.nextUrl.pathname)) {
      const { data: { session } } = await supabase.auth.getSession()
      
      // Only fetch user data if session exists
      if (session) {
        await supabase.auth.getUser()
      }
    }
  } catch (error) {
    console.error("Middleware auth error:", error);
    // Continue despite auth error - Next.js pages will handle auth state
  }
  
  return response
}

// Helper to determine if middleware should be skipped entirely
function shouldSkipMiddleware(path: string): boolean {
  return (
    path.startsWith('/_next') ||
    path.startsWith('/api') ||
    path.includes('.') ||
    path === '/favicon.ico'
  );
}

// Helper to determine if a route needs authentication check
function needsAuthCheck(path: string): boolean {
  return (
    path.startsWith('/dashboard') ||
    path.startsWith('/profile') ||
    path.startsWith('/settings')
  );
}

// Helper to determine if a route is dynamic (avoids caching dynamic content)
function isDynamicRoute(path: string): boolean {
  return (
    path.startsWith('/dashboard') ||
    path.startsWith('/api') ||
    path.includes('[') ||
    path.includes('(')
  );
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
