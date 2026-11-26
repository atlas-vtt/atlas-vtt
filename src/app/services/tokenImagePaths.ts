import { isResourceUrl, resourceUrlToFilePath, resourceUrlToVaultPath } from '../utils/pathUtils';

/** A token image path as compared: a resource URL's file under Atlas' folder (else as the URL names it), a path without its leading slash. */
export function tokenImageKey(path: string): string {
  if (!path) return '';
  if (isResourceUrl(path)) return resourceUrlToVaultPath(path) ?? resourceUrlToFilePath(path) ?? path;
  return path.startsWith('/') ? path.substring(1) : path;
}

/** Whether two image paths name the same file, a resource URL and a file path alike. */
export function sameTokenImage(path1: string, path2: string): boolean {
  if (!path1 || !path2) return path1 === path2;
  return tokenImageKey(path1) === tokenImageKey(path2);
}
