/**
 * Removes the first occurrence of an item from an array (by reference equality).
 * Returns true if the item was found and removed, false otherwise.
 */
export function removeFromArray<T>(array: T[], item: T): boolean {
    const index = array.indexOf(item);
    if (index === -1) return false;
    array.splice(index, 1);
    return true;
}
