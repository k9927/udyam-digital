import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export const HOME_FOR_ROLE = { customer: '/app', partner: '/partner', delivery: '/field', technician: '/field', kyc_officer: '/review', ops_admin: '/ops', super_admin: '/ops' };

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, business: null, loading: true });
  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setState({ user: data.user, business: data.business, loading: false });
      return data.user;
    } catch {
      setState({ user: null, business: null, loading: false });
      return null;
    }
  }, []);
  useEffect(() => {
    api.get('/auth/me')
      .then(({ data }) => setState({ user: data.user, business: data.business, loading: false }))
      .catch(() => setState({ user: null, business: null, loading: false }));
  }, []);
  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setState({ user: null, business: null, loading: false });
  }, []);
  const value = useMemo(() => ({ ...state, refresh, logout }), [state, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
