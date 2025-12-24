// src/layouts/Mobile/MobileLayout.tsx
import React from 'react';
import './MobileLayout.css';

interface MobileLayoutProps {
  children: React.ReactNode;
  showHeader?: boolean;
  showFooter?: boolean;
}

const MobileLayout: React.FC<MobileLayoutProps> = ({
  children,
  showHeader = true,
  showFooter = true,
}) => {
  return (
    <div className="mobile-layout">
      {showHeader && (
        <header className="mobile-layout__header">
          {/* Встраиваемый хедер */}
        </header>
      )}
      
      <main className="mobile-layout__main">
        {children}
      </main>
      
      {showFooter && (
        <footer className="mobile-layout__footer">
          {/* Встраиваемый футер */}
        </footer>
      )}
    </div>
  );
};

export default MobileLayout;