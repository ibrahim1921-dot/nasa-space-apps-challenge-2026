'use client';

import { useEffect, useState } from 'react';
import { request } from '@/lib/api/client';
export function useApi(path) {
  const [state, setState] = useState({
    path: null,
    data: null,
    loading: true
  });
  useEffect(() => {
    let active = true;
    if (path) request(path).then(result => {
      if (active) setState({
        ...result,
        path,
        loading: false
      });
    }).catch(error => {
      if (active) setState({
        path,
        error: error.message,
        loading: false
      });
    });
    return () => {
      active = false;
    };
  }, [path]);
  return state.path === path ? state : {
    data: null,
    loading: Boolean(path)
  };
}
