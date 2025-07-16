// src/components/Footer.tsx
import React from 'react';
import { useAuth } from "../AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

export default function Footer() {
  const { isAuthenticated, userName, establishmentName } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!isAuthenticated) return null;

  // Определяем кнопку действия для разных страниц
  let actionButton: React.ReactNode = null;

  switch (true) {
    // Список заготовок → добавить новую
    case pathname === "/preparations":
      actionButton = (
        <button
          onClick={() => navigate("/preparations/new")}
          className="text-2xl"
          aria-label="Добавить заготовку"
        >
          ＋
        </button>
      );
      break;

    // Список сотрудников → добавить нового
    case pathname === "/team":
      actionButton = (
        <button
          onClick={() => navigate("/team/new")}
          className="text-2xl"
          aria-label="Добавить сотрудника"
        >
          ＋
        </button>
      );
      break;

    // Форма заготовки (новая или редактирование) — сабмит формы с id="prep-form"
    case pathname === "/preparations/new" ||
         pathname.startsWith("/preparations/"):
      actionButton = (
      <button
        onClick={() => {
          const form = document.getElementById("prep-form") as HTMLFormElement | null;
          form?.requestSubmit();
        }}
        className="text-2xl"
        aria-label="Сохранить заготовку"
      >
        ✔
      </button>
      );
      break;

    // Форма пользователя (новая или редактирование) — сабмит формы с id="team-form"
    case pathname === "/team/new" ||
         pathname.startsWith("/team/"):
      actionButton = (
      <button
        onClick={() => {
          const form = document.getElementById("team-form") as HTMLFormElement | null;
          form?.requestSubmit();
        }}
        className="text-2xl"
        aria-label="Сохранить пользователя"
      >
        ✔
      </button>
      );
      break;

    // Страница калькулятора — кнопки не показываем
    case pathname.startsWith("/main/"):
      actionButton = null;
      break;

    // По умолчанию — никаких кнопок
    default:
      actionButton = null;
  }

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-white text-black py-8 px-6 flex items-center justify-between">
      {/* Название заведения слева — ведёт в «Команда» */}
      <span
        className="cursor-pointer font-medium"
        onClick={() => navigate("/team")}
      >
        {establishmentName}
      </span>

      {/* Центральная кнопка действия */}
      <div>
        {actionButton}
      </div>

      {/* Имя пользователя справа */}
      <span className="font-medium">{userName}</span>
    </footer>
  );
}
