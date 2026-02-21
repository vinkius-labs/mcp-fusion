/**
 * Icon definition for group and tool metadata.
 */
export interface Icon {
    readonly src?: string;
    readonly mimeType?: string;
    readonly sizes?: readonly string[];
    readonly theme?: string;
}

/** Create an Icon from partial properties. */
export function createIcon(props: Icon = {}): Icon {
    return { ...props };
}
