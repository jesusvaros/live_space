import React from 'react';

/**
 * Screens load as separate chunks (React.lazy). Two additions:
 *
 * - Once a chunk is loaded the page renders directly, without React.lazy:
 *   React holds a Suspense reveal for ~300 ms after showing its fallback, so a
 *   page whose data is already in the cache would otherwise appear a third of
 *   a second late.
 * - preloadRoute(pathname) loads the chunk of the screen the app opens on,
 *   alongside the cache, before the first render (main.tsx).
 */

type PageModule<T> = { default: T };

export type LazyPage<T extends React.ComponentType<any>> = React.FC<React.ComponentProps<T>> & {
  preload: () => Promise<PageModule<T>>;
};

export const lazyPage = <T extends React.ComponentType<any>>(load: () => Promise<PageModule<T>>): LazyPage<T> => {
  let loaded: T | null = null;
  let pending: Promise<PageModule<T>> | null = null;
  const preload = () => {
    pending ??= load().then(module => {
      loaded = module.default;
      return module;
    });
    pending.catch(() => {
      pending = null;
    });
    return pending;
  };
  const Lazy = React.lazy(preload);
  const Page = ((props: React.ComponentProps<T>) =>
    React.createElement((loaded ?? Lazy) as React.ComponentType<any>, props)) as LazyPage<T>;
  Page.preload = preload;
  return Page;
};

const routes: Array<[pattern: RegExp, preload: () => Promise<unknown>]> = [];

/** The chunk to load first when the app opens on a path matching `pattern`. */
export const registerRoutePreload = (pattern: RegExp, page: { preload: () => Promise<unknown> }) => {
  routes.push([pattern, page.preload]);
};

export const preloadRoute = (pathname: string) => {
  const match = routes.find(([pattern]) => pattern.test(pathname));
  return match ? match[1]().then(() => undefined, () => undefined) : Promise.resolve();
};
