import React, { useState } from 'react';

const AuthForm: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Вход:', { username, password });
    alert('Вход выполнен (тест)');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-600">Логин</label>
        <input
          type="text"
          className="mt-1 w-full rounded-md border border-gray-300 p-2"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-600">Пароль</label>
        <input
          type="password"
          className="mt-1 w-full rounded-md border border-gray-300 p-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <button
        type="submit"
        className="w-full rounded-md bg-blue-600 p-2 text-white hover:bg-blue-700"
      >
        Войти
      </button>
    </form>
  );
};

export default AuthForm;