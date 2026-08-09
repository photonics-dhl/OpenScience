'use client';

import * as React from 'react';
import { createContext, useContext, type ReactNode } from 'react';

export type WorkspaceMode = 'overview' | 'sdf' | 'artifacts' | 'versions' | 'collaboration' | 'public';
export type WorkspacePermission = 'read' | 'comment' | 'edit' | 'admin';

export interface WorkspaceContextValue {
  roId: string;
  versionId: string;
  workspaceId: string;
  mode: WorkspaceMode;
  permission: WorkspacePermission;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceContextProvider({ value, children }: { value: WorkspaceContextValue; children: ReactNode }) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspaceContext must be used within WorkspaceContextProvider');
  return value;
}
