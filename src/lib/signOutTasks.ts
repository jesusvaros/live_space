// Work that needs the session one last time before signing out (e.g.
// deleting this device's push token, which RLS ties to the person). The
// sign-out never waits more than `timeoutMs` for them.

type Task = () => Promise<unknown>;

const tasks = new Set<Task>();

export const onBeforeSignOut = (task: Task) => {
  tasks.add(task);
  return () => {
    tasks.delete(task);
  };
};

export const runBeforeSignOut = async (timeoutMs = 3000) => {
  if (tasks.size === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled([...tasks].map(task => Promise.resolve().then(task))),
    new Promise(resolve => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  clearTimeout(timer);
};
