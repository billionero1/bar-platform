import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from 'react';
import { jwtDecode } from 'jwt-decode';




/* -------- тип payload’а токена -------- */
type JwtPayload = {
  id: number;
  establishment_id: number;
  is_admin: 0 | 1;
  name: string;
  establishment_name: string;
  exp: number;
};

interface AuthCtx {
  isAuthenticated: boolean;
  isAdmin: boolean;
  userId: number | null;
  userName: string;
  establishmentName: string;
  establishmentId: number | null;
  login(token: string): void;
  logout(): void;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

/* -------- «ленивое» начальное состояние -------- */
function getInitialAuth(): {
  auth: boolean;
  admin: boolean;
  userId: number | null;   
  userName: string;
  establishmentName: string;
  establishmentId: number | null;
} {
  const token = localStorage.getItem('token');
  if (!token) {
    return {
      auth: false,
      admin: false,
      userId: null,
      userName: '',
      establishmentName: '',
      establishmentId: null,
    };
  }

  try {
    const payload: JwtPayload = jwtDecode(token);

    const isExpired = payload.exp * 1000 < Date.now();
    if (isExpired) {
      console.warn('⏳ Токен истёк');
      localStorage.clear();
      return {
        auth: false,
        admin: false,
        userId: null,
        userName: '',
        establishmentName: '',
        establishmentId: null,
      };
    }

    return {
      auth: true,
      admin: !!payload.is_admin,
      userId: payload.id,
      userName: payload.name,
      establishmentName: payload.establishment_name,
      establishmentId: payload.establishment_id,
    };
  } catch (e) {
    console.error('❌ Ошибка при декодировании токена:', e);
    localStorage.clear();
    return {
      auth: false,
      admin: false,
      userId: null,
      userName: '',
      establishmentName: '',
      establishmentId: null,
    };
  }
}

/* -------- провайдер авторизации -------- */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const initial = getInitialAuth();

  const [isAuthenticated, setAuth] = useState(initial.auth);
  const [isAdmin, setAdmin] = useState(initial.admin);
  const [userId, setUserId] = useState<number | null>(initial.userId); // ← вот это обязательно!
  const [userName, setUserName] = useState<string>(initial.userName);
  const [establishmentName, setEstablishmentName] = useState<string>(initial.establishmentName);
  const [establishmentId, setEstablishmentId] = useState<number | null>(initial.establishmentId);


  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      logout();
      return;
    }

    try {
      const payload: JwtPayload = jwtDecode(token);
      const isExpired = payload.exp * 1000 < Date.now();
      if (isExpired) {
        console.warn('⏳ Токен истёк');
        logout();
      }
    } catch (err) {
      console.error('❌ Ошибка декодирования токена:', err);
      logout();
    }
  }, []);

  /* ── login ───────────────────────────────────────── */
  const login = (token: string) => {
    try {
      const decoded = jwtDecode<JwtPayload>(token);
      const { id, is_admin, name, establishment_id, establishment_name } = decoded;
      // Сохраняем JWT
      localStorage.setItem('token', token);
      // Обязательные поля
      setAuth(true);
      setUserId(id);
      setAdmin(Boolean(is_admin));
      setUserName(name);
      setEstablishmentId(establishment_id);
      // establishment_name может отсутствовать, поэтому проверяем
      if (establishment_name) {
        localStorage.setItem('establishmentName', establishment_name);
        setEstablishmentName(establishment_name);
      } else {
        console.warn('JWT не содержит establishment_name');
      }
    } catch (err) {
      console.error('Ошибка при логине:', err);
      // необязательно кидать дальше, можно просто не логинить
    }
  };


  /* ── logout ──────────────────────────────────────── */
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('userName');
    localStorage.removeItem('establishmentName');
    localStorage.removeItem('establishmentId');
    localStorage.removeItem('userId');
    setAuth(false);
    setAdmin(false);
    setUserName('');
    setEstablishmentName('');
    setEstablishmentId(null);
    setUserId(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isAdmin,
        userId, 
        userName,
        establishmentName,
        establishmentId,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/* -------- удобный хук -------- */
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
