import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../../../AuthContext';

const LandingRedirect: React.FC = () => {
  const { loading, hasSession } = useContext(AuthContext);

  if (loading) return null;

  return <Navigate to={hasSession ? '/workspace' : '/login'} replace />;
};

export default LandingRedirect;
