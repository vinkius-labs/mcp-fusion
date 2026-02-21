import { Group } from '../Group.js';
import { ConverterBase } from './ConverterBase.js';

export interface GroupConverter<GroupType> {
    convertFromGroups(groups: Group[]): GroupType[];
    convertFromGroup(group: Group): GroupType;
    convertToGroups(groups: GroupType[]): Group[];
    convertToGroup(group: GroupType): Group;
}

export abstract class GroupConverterBase<GroupType>
    extends ConverterBase<Group, GroupType>
    implements GroupConverter<GroupType>
{
    public convertFromGroups(groups: Group[]): GroupType[] {
        return this.convertFromBatch(groups);
    }

    public abstract convertFromGroup(group: Group): GroupType;

    public convertToGroups(groups: GroupType[]): Group[] {
        return this.convertToBatch(groups);
    }

    public abstract convertToGroup(group: GroupType): Group;

    // ── Bridge to ConverterBase ──
    protected convertFromSingle(source: Group): GroupType {
        return this.convertFromGroup(source);
    }

    protected convertToSingle(target: GroupType): Group {
        return this.convertToGroup(target);
    }
}
