// src/pages/workspace/Workspace.mobile.tsx

import React, { useContext, useMemo, useState } from 'react';

import Header from '../../components/Header';

import Footer from '../../components/Footer';

import { AuthContext } from '../../AuthContext';



// Табки футера — подгоняем под текущий Footer.tsx

type MobileTab = 'home' | 'feed' | 'profile';



const WorkspaceMobile: React.FC = () => {

  const { user } = useContext(AuthContext);

  const [activeTab, setActiveTab] = useState<MobileTab>('home');



  const hasEstablishment = !!user?.establishment_id;



  const workspaceKind: 'personal' | 'establishment' | null = useMemo(() => {

    if (hasEstablishment) return 'establishment';

    return 'personal';

  }, [hasEstablishment]);



  const establishmentTitle = user?.establishment_name || 'Ваше заведение';



  const roleLabel = useMemo(() => {

    if (!user?.role) return null;



    switch (user.role) {

      case 'manager':

        return 'Бар-менеджер';

      case 'staff':

        return 'Сотрудник бара';

      case 'solo':

        return 'Без заведения';

      default:

        // на будущее — новые роли, которые мы добавим в БД

        return user.role;

    }

  }, [user?.role]);



  // ==== ВКЛАДКА «ГЛАВНАЯ» ===================================================



  const renderHome = () => {

    return (

      <main className="app-shell__main">

        <div className="workspace-main">

          {/* Блок заведения (если пользователь привязан к заведению) */}

          {hasEstablishment && (

            <section className="workspace-section">

              <div className="workspace-section__header">

                <div>

                  <h2 className="workspace-section__title">

                    {establishmentTitle}

                  </h2>

                  <p className="workspace-section__subtitle">

                    {roleLabel

                      ? `${roleLabel} • доступ к модулям бара`

                      : 'Работа внутри заведения'}

                  </p>

                </div>



                {/* Заглушка под будущие настройки заведения */}

                <button

                  type="button"

                  className="workspace-new-button"

                >

                  Управление

                </button>

              </div>



              {/* Главные МОДУЛИ бара */}

              <div className="workspace-card-grid">

                <ModuleCard

                  title="Обучение"

                  subtitle="Статьи, стандарты, тесты для персонала бара"

                  icon="📚"

                />



                <ModuleCard

                  title="Операционка бара"

                  subtitle="Заявки, списания, графики, генуборка, табель"

                  icon="⚙️"

                />



                <ModuleCard

                  title="Номенклатура"

                  subtitle="Товары, заготовки, техкарты и калькулятор"

                  icon="📦"

                />



                <ModuleCard

                  title="Коммуникации"

                  subtitle="Чат бара и сообщения между сменами"

                  icon="💬"

                />



                {/* Аналитика — только если роль позволяет (пока грубо по manager) */}

                {user?.role === 'manager' && (

                  <ModuleCard

                    title="Аналитика"

                    subtitle="Выручка, загрузка, средний чек, отчёты"

                    icon="📊"

                  />

                )}

              </div>

            </section>

          )}



          {/* Онбординг, если заведения ещё нет */}

          {!hasEstablishment && (

            <section className="workspace-hero">

              <h1 className="workspace-hero__title">

                Соберите всё управление баром в одном месте

              </h1>

              <p className="workspace-hero__subtitle">

                Добавьте заведение, пригласите команду и ведите обучение,

                операционку и номенклатуру прямо здесь.

              </p>



              <div className="workspace-hero__actions">

                <button

                  type="button"

                  className="workspace-hero__btn workspace-hero__btn--primary"

                >

                  Создать заведение

                </button>

                <button

                  type="button"

                  className="workspace-hero__btn workspace-hero__btn--outline"

                >

                  Присоединиться по ссылке

                </button>

              </div>



              <button

                type="button"

                className="workspace-hero__link"

              >

                Работать пока только лично

              </button>

            </section>

          )}



          {/* ЛИЧНЫЕ инструменты — есть всегда, просто ниже блоков бара */}

          <section className="workspace-section">

            <div className="workspace-section__header">

              <div>

                <h2 className="workspace-section__title">

                  Личные инструменты

                </h2>

                <p className="workspace-section__subtitle">

                  То, что принадлежит лично тебе и не привязано к конкретному

                  бару.

                </p>

              </div>

            </div>



            <div className="workspace-card-grid">

              <ModuleCard

                title="Мои рецепты"

                subtitle="Авторские коктейли, заготовки и заметки"

                icon="🥂"

              />

              <ModuleCard

                title="Мои заготовки"

                subtitle="Личные расчёты и варианты подготовок"

                icon="🧪"

              />

              <ModuleCard

                title="Мои тесты"

                subtitle="Создавай и проходи свои проверки знаний"

                icon="📝"

              />

              <ModuleCard

                title="Избранное"

                subtitle="Статьи, карты и материалы, которые ты сохранил"

                icon="⭐"

              />

            </div>

          </section>

        </div>

      </main>

    );

  };



  // ==== ВКЛАДКА «ЛЕНТА» =====================================================



  const renderFeed = () => {

    return (

      <main className="app-shell__main">

        <div className="workspace-main workspace-main--simple">

          <div className="workspace-placeholder">

            Здесь появится лента событий: обучение, заявки, списания и новости

            по твоим барам.

          </div>

        </div>

      </main>

    );

  };



  // ==== ВКЛАДКА «ПРОФИЛЬ» ===================================================



  const renderProfile = () => {

    return (

      <main className="app-shell__main">

        <div className="workspace-main workspace-main--simple">

          <div className="workspace-placeholder">

            Профиль и личные настройки мы вынесем сюда чуть позже.

          </div>

        </div>

      </main>

    );

  };



  // ==== СВИТЧ ПО ТАБАМ ======================================================



  let content: React.ReactNode;

  switch (activeTab) {

    case 'home':

    default:

      content = renderHome();

      break;

    case 'feed':

      content = renderFeed();

      break;

    case 'profile':

      content = renderProfile();

      break;

  }



  return (

    <div className="app-shell">

      <header className="app-shell__header">

        <Header />

      </header>



      {content}



      <footer className="app-shell__footer">

        <Footer

          activeTab={activeTab}

          onChangeTab={setActiveTab}

          workspaceKind={workspaceKind}

        />

      </footer>

    </div>

  );

};



type ModuleCardProps = {

  title: string;

  subtitle: string;

  icon: string;

};



const ModuleCard: React.FC<ModuleCardProps> = ({

  title,

  subtitle,

  icon,

}) => {

  return (

    <button type="button" className="workspace-card">

      <div className="workspace-card__icon">{icon}</div>

      <div className="workspace-card__text">

        <div className="workspace-card__title">{title}</div>

        <div className="workspace-card__subtitle">{subtitle}</div>

      </div>

    </button>

  );

};



export default WorkspaceMobile;
