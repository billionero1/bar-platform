import { useNavigate } from 'react-router-dom';

export default function MenuPage() {
  const nav = useNavigate();

  return (
    <div className="p-4 space-y-4">
      <button
        onClick={() => nav('/ingredients')}
        className="w-full p-3 border border-gray-300 rounded text-left"
      >
        Ingredients
      </button>
      <button
        onClick={() => nav('/preparations')}
        className="w-full p-3 border border-gray-300 rounded text-left"
      >
        Preparations
      </button>
      <button
        onClick={() => nav('/team')}
        className="w-full p-3 border border-gray-300 rounded text-left"
      >
        Team
      </button>
    </div>
  );
}
