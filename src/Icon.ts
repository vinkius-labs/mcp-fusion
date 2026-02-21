/**
 * Icon definition
 */
export class Icon {
    public src: string | undefined;
    public mimeType: string | undefined;
    public sizes: string[] | undefined;
    public theme: string | undefined;

    public toString(): string {
        return `Icon [src=${this.src}, mimeType=${this.mimeType}, sizes=${this.sizes}, theme=${this.theme}]`;
    }
}
