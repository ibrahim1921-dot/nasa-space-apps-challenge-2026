'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { readStorage, writeStorage } from '@/lib/cache';
import { flushQueue } from '@/lib/cache/queue';
const Context = createContext(null);
export function AppProvider({
  children
}) {
  const [crew, setCrew] = useState(null);
  const [mission, setMission] = useState('iss');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Browser preferences hydrate only after the client mounts.
    const timer = setTimeout(() => {
      setCrew(readStorage('chm:crew'));
      setMission(readStorage('chm:mission', 'iss'));
      setReady(true);
    }, 0);
    const retry = () => {
      flushQueue();
    };
    retry();
    window.addEventListener('online', retry);
    const interval = setInterval(retry, 30000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('online', retry);
    };
  }, []);
  const chooseCrew = value => {
    writeStorage('chm:crew', value);
    setCrew(value);
  };
  const chooseMission = value => {
    writeStorage('chm:mission', value);
    setMission(value);
  };
  return <Context.Provider value={{
    crew,
    mission,
    ready,
    chooseCrew,
    chooseMission
  }}>{children}</Context.Provider>;
}
export function useApp() {
  return useContext(Context);
}
export function useRoute() {
  return usePathname();
}
