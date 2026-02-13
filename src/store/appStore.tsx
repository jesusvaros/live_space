import React, { createContext, useContext, useMemo, useReducer } from 'react';

type AuthSlice = {
  userId: string | null;
};

type WorkspaceSlice = {
  activeWorkspaceId: string | null;
};

type AppState = {
  auth: AuthSlice;
  workspace: WorkspaceSlice;
};

type AppAction =
  | { type: 'auth/setUserId'; payload: string | null }
  | { type: 'workspace/setActiveId'; payload: string | null }
  | { type: 'workspace/reset' };

const initialState: AppState = {
  auth: { userId: null },
  workspace: { activeWorkspaceId: null },
};

const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'auth/setUserId':
      return {
        ...state,
        auth: { userId: action.payload },
      };
    case 'workspace/setActiveId':
      return {
        ...state,
        workspace: { activeWorkspaceId: action.payload },
      };
    case 'workspace/reset':
      return {
        ...state,
        workspace: { activeWorkspaceId: null },
      };
    default:
      return state;
  }
};

const AppStateContext = createContext<AppState | undefined>(undefined);
const AppDispatchContext = createContext<React.Dispatch<AppAction> | undefined>(undefined);

export const AppStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const memoState = useMemo(() => state, [state]);

  return (
    <AppDispatchContext.Provider value={dispatch}>
      <AppStateContext.Provider value={memoState}>{children}</AppStateContext.Provider>
    </AppDispatchContext.Provider>
  );
};

export const useAppStore = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppStore must be used within AppStoreProvider');
  }
  return context;
};

export const useAppDispatch = () => {
  const context = useContext(AppDispatchContext);
  if (!context) {
    throw new Error('useAppDispatch must be used within AppStoreProvider');
  }
  return context;
};

export const useAuthStore = () => {
  const { auth } = useAppStore();
  const dispatch = useAppDispatch();

  return {
    userId: auth.userId,
    setUserId: (userId: string | null) => dispatch({ type: 'auth/setUserId', payload: userId }),
  };
};

export const useWorkspaceStore = () => {
  const { workspace } = useAppStore();
  const dispatch = useAppDispatch();

  return {
    activeWorkspaceId: workspace.activeWorkspaceId,
    setActiveWorkspaceId: (workspaceId: string | null) =>
      dispatch({ type: 'workspace/setActiveId', payload: workspaceId }),
    resetWorkspace: () => dispatch({ type: 'workspace/reset' }),
  };
};
