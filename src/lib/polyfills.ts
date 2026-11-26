// Old Android WebViews (Chrome < 92) lack `.at()`; it broke Conciertos and the concert page
// there («e.at is not a function»). Imported first in main.tsx, before any other module runs.

function at<T>(this: ArrayLike<T>, index: number): T | undefined {
  const length = this.length;
  let i = Math.trunc(index) || 0;
  if (i < 0) i += length;
  return i < 0 || i >= length ? undefined : this[i];
}

const targets: object[] = [Array.prototype, String.prototype, Object.getPrototypeOf(Int8Array.prototype)];
for (const proto of targets) {
  if (!('at' in proto)) {
    Object.defineProperty(proto, 'at', { value: at, writable: true, configurable: true, enumerable: false });
  }
}

export {};
