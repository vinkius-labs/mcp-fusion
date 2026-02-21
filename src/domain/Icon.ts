/**
 * Icon definition for entity metadata.
 *
 * Icons can be associated with {@link Group}, {@link Tool},
 * or any {@link BaseModel} entity.
 *
 * @example
 * ```typescript
 * import { createIcon } from '@vinkius-core/mcp-fusion';
 *
 * const icon = createIcon({
 *     src: 'https://example.com/icon.png',
 *     mimeType: 'image/png',
 *     sizes: ['32x32', '64x64'],
 *     theme: 'dark',
 * });
 * ```
 */
export interface Icon {
    /** URL or path to the icon image */
    readonly src?: string;
    /** MIME type of the icon (e.g. `"image/png"`, `"image/svg+xml"`) */
    readonly mimeType?: string;
    /** Available sizes (e.g. `["32x32", "64x64"]`) */
    readonly sizes?: readonly string[];
    /** Theme variant (e.g. `"dark"`, `"light"`) */
    readonly theme?: string;
}

/**
 * Create an Icon from partial properties.
 *
 * @param props - Icon properties (all optional)
 * @returns A frozen Icon instance
 *
 * @example
 * ```typescript
 * const icon = createIcon({ src: '/icons/tool.svg', mimeType: 'image/svg+xml' });
 * ```
 */
export function createIcon(props: Icon = {}): Icon {
    return { ...props };
}
