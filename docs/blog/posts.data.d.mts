export interface PostData {
    title: string;
    date: string;
    author: string;
    authorUrl?: string;
    description: string;
    tags: string[];
    image?: string;
    url: string;
}
declare const data: PostData[];
export { data };
declare const _default: {
    watch: string | string[];
    load: () => Promise<PostData[]>;
};
export default _default;
//# sourceMappingURL=posts.data.d.mts.map