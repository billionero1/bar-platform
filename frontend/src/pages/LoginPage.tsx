import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Props = {
  setRole: (r: 'user' | 'moderator') => void;
};

const LoginPage: React.FC<Props> = ({ setRole }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('http://localhost:3001/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Ошибка входа');
        return;
      }

      localStorage.setItem('token', data.token);
      setRole(data.role);

      if (data.role === 'moderator') navigate('/moderator');
      else navigate('/calculate');
    } catch (err) {
      setError('Ошибка подключения к серверу');
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-white px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center text-black">Sign In</h1>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
          required
        />
        <button
          type="submit"
          className="w-full rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700"
        >
          SIGN IN
        </button>
      </form>
    </div>
  );
};

export default LoginPage;