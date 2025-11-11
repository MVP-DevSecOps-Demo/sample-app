import { DashboardShell } from "@/components/layout/dashboard-shell";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Define a proper type for cookie options
interface CookieOptions {
  name: string;
  value: string;
  maxAge?: number;
  domain?: string;
  path?: string;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get the cookie store
  const cookieStore = await cookies()
  
  // Create a Supabase client for server components
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // This will throw in middleware, but we can
            // safely ignore it for the purpose of authentication.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // This will throw in middleware, but we can
            // safely ignore it for the purpose of authentication.
          }
        },
      },
    }
  )

  // Get the authenticated user (using getUser for security)
  const { data: { user } } = await supabase.auth.getUser()
  console.log("[DashboardLayout] User found:", user?.id, user?.email);

  // If there's no user, redirect to the sign-in page
  if (!user) {
    console.log("[DashboardLayout] No user found, redirecting to auth page");
    redirect('/auth')
  }

  // Check if the user has admin role by querying the user_roles table
  console.log("[DashboardLayout] Querying user_roles for user ID:", user.id);
  console.log("[DashboardLayout] Query:", "SELECT role_id FROM user_roles WHERE user_id = '" + user.id + "'");
  const { data: userRoles, error: userRolesError } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('user_id', user.id);
  
  console.log("[DashboardLayout] userRoles result:", JSON.stringify(userRoles), "Error:", userRolesError);

  // If the user has roles, fetch the role details
  let isAdmin = false;
  
  if (userRoles && userRoles.length > 0) {
    const roleIds = userRoles.map(ur => ur.role_id);
    console.log("[DashboardLayout] roleIds:", roleIds);
    
    const { data: roles, error: rolesError } = await supabase
      .from('roles')
      .select('name')
      .in('id', roleIds);
    
    console.log("[DashboardLayout] roles result:", roles, "Error:", rolesError);
    
    // Check if the user has the admin role
    isAdmin = roles?.some(role => role.name === 'admin') || false;
    console.log("[DashboardLayout] isAdmin:", isAdmin);
  } else {
    console.log("[DashboardLayout] No roles found for user:", user.id);
  }

  return (
    <DashboardShell user={user} isAdmin={isAdmin}>
      {children}
    </DashboardShell>
  );
}
