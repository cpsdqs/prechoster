import React, { createContext } from 'react';
import { Storage } from './storage';

export const StorageContext: React.Context<Storage> = createContext(null as any);
