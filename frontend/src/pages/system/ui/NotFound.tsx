import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../../AuthContext';
import './NotFound.css';

const NotFound: React.FC = () => {
  const { loading, hasSession } = useContext(AuthContext);

  if (loading) {
    return <div className="nf" aria-busy="true" />;
  }

  const homeHref = hasSession ? '/workspace' : '/login';

  return (
    <div className="nf">
      <div className="nf-card">
        <div className="nf-code">404</div>
        <div className="nf-title">Такой страницы не существует.</div>

        <div className="nf-actions">
          <Link className="nf-link" to={homeHref}>
            Вернуться
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
