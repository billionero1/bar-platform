
import { useNavigate } from 'react-router-dom';

export default function BackArrow() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(-1)}
      className="text-xl text-blue-600 font-semibold px-4 py-2"
    >
      ← Назад
    </button>
  );
}
