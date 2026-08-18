export function permissionKey(resource: string, action: string): string {
  return `${resource}.${action}`;
}

export function hasAllPermissions(
  owned: readonly string[],
  required: readonly string[],
): boolean {
  if (required.length === 0) {
    return true;
  }
  const granted = new Set(owned);
  return required.every((permission) => granted.has(permission));
}
