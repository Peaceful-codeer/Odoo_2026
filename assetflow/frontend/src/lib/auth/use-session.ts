import { useEffect, useState } from "react";
import { auth, isLoggedIn, toAppRole, type ApiUser } from "@/lib/api";

export type AppRole = "admin" | "asset_manager" | "dept_head" | "employee";

export interface AppProfile {
  id: string;
  full_name: string;
  email: string;
  department_id: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

export interface SessionState {
  loading: boolean;
  session: { user: { id: string; email: string } } | null;
  user: { id: string; email: string } | null;
  profile: AppProfile | null;
  roles: AppRole[];
  apiUser: ApiUser | null;
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    loading: true, session: null, user: null, profile: null, roles: [], apiUser: null,
  });

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!isLoggedIn()) {
        if (!cancelled) setState({ loading: false, session: null, user: null, profile: null, roles: [], apiUser: null });
        return;
      }
      try {
        const me = await auth.me();
        if (cancelled) return;
        const user = { id: String(me.id), email: me.email };
        setState({
          loading: false,
          session: { user },
          user,
          profile: {
            id: String(me.id), full_name: me.name, email: me.email,
            department_id: me.department_id != null ? String(me.department_id) : null,
            avatar_url: null, is_active: me.status === "active",
          },
          roles: [toAppRole(me.role)],
          apiUser: me,
        });
      } catch {
        if (!cancelled) setState({ loading: false, session: null, user: null, profile: null, roles: [], apiUser: null });
      }
    }
    void hydrate();
    const onStorage = () => void hydrate();
    window.addEventListener("storage", onStorage);
    return () => { cancelled = true; window.removeEventListener("storage", onStorage); };
  }, []);

  return state;
}
