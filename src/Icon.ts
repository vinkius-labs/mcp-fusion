/**
 * Icon definition
 */
export class Icon {
    private src: string | undefined;
    private mimeType: string | undefined;
    private sizes: string[] | undefined;
    private theme: string | undefined;

    public getSrc(): string | undefined {
        return this.src;
    }

    public setSrc(src: string): void {
        this.src = src;
    }

    public getMimeType(): string | undefined {
        return this.mimeType;
    }

    public setMimeType(mimeType: string): void {
        this.mimeType = mimeType;
    }

    public getSizes(): string[] | undefined {
        return this.sizes;
    }

    public setSizes(sizes: string[]): void {
        this.sizes = sizes;
    }

    public getTheme(): string | undefined {
        return this.theme;
    }

    public setTheme(theme: string): void {
        this.theme = theme;
    }

    public toString(): string {
        return `Icon [src=${this.src}, mimeType=${this.mimeType}, sizes=${this.sizes}, theme=${this.theme}]`;
    }
}
