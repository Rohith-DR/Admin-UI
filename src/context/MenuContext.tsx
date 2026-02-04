import React, { createContext, useContext, useState, ReactNode } from 'react';

interface MenuContextType {
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  toggleMenu: () => void;
}

const MenuContext = createContext<MenuContextType | undefined>(undefined);

export const useMenu = () => {
  const context = useContext(MenuContext);
  if (context === undefined) {
    throw new Error('useMenu must be used within a MenuProvider');
  }
  return context;
};

interface MenuProviderProps {
  children: ReactNode;
}

export const MenuProvider: React.FC<MenuProviderProps> = ({ children }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleMenu = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <MenuContext.Provider value={{ isExpanded, setIsExpanded, toggleMenu }}>
      {children}
    </MenuContext.Provider>
  );
};