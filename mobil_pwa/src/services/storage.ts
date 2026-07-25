export async function getItem(key: string): Promise<string | null> {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export async function deleteItem(key: string): Promise<void> {
  try {
    localStorage.removeItem(key);
  } catch {}
}
