/** Returns a required popup element with its expected type. */
export function getRequiredElement<T extends Element>(
  id: string,
  elementType: {new (): T},
): T {
  const element = document.getElementById(id);
  if (!(element instanceof elementType)) {
    throw new Error(`Missing popup element: #${id}`);
  }
  return element;
}
