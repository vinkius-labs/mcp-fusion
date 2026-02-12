import { Group } from '../Group.js';

export interface GroupConverter<GroupType> {
    convertFromGroups(groups: Group[]): GroupType[];
    convertFromGroup(group: Group): GroupType;
    convertToGroups(groups: GroupType[]): Group[];
    convertToGroup(group: GroupType): Group;
}

export abstract class AbstractGroupConverter<GroupType> implements GroupConverter<GroupType> {
    public convertFromGroups(groups: Group[]): GroupType[] {
        return groups
            .map(gn => this.convertFromGroup(gn))
            .filter(item => item !== null && item !== undefined);
    }

    public abstract convertFromGroup(group: Group): GroupType;

    public convertToGroups(groups: GroupType[]): Group[] {
        return groups
            .map(g => this.convertToGroup(g))
            .filter(item => item !== null && item !== undefined);
    }

    public abstract convertToGroup(group: GroupType): Group;
}
