
import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="flex justify-around bg-white shadow p-4 text-sm">
      <Link to="/dashboard">🏠 Главная</Link>
      <Link to="/ingredients">📦 Ингредиенты</Link>
      <Link to="/preparations">🧪 Заготовки</Link>
      <Link to="/calculations">⚙️ Расчёт</Link>
      <Link to="/team">👥 Команда</Link>
    </nav>
  );
}
