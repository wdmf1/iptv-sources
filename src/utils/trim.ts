export const trimAny = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => trimAny(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, trimAny(item)])
    ) as T;
  }

  if (typeof value === 'string') {
    return value.trim() as T;
  }

  return value;
};
