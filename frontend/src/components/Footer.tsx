import { useAuth }      from "../AuthContext";
import { useNavigate }  from "react-router-dom";

export default function Footer() {
  const { isAuthenticated, userName, establishmentName } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated) return null;

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-white text-black py-5 px-5 flex justify-between items-center">
      {/* название заведения слева — кликабельно, ведёт на «Команда» */}
        <span className="cursor-pointer" onClick={() => navigate("/team")}>
        {establishmentName}
        </span>

        <span>{userName}</span>

    </footer>
  );
}
