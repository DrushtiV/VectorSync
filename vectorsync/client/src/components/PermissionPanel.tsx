import { CanvasNode, ElementId, PermissionRole } from '../shared/types';

interface Props {
  groups: CanvasNode[];
  role: PermissionRole;
  getPermission: (sectionId: ElementId) => 'viewer' | 'editor';
  onChange: (sectionId: ElementId, role: 'viewer' | 'editor') => void;
}

export function PermissionPanel({ groups, role, getPermission, onChange }: Props) {
  return (
    <div className="panel-section permissions-panel">
      <div className="panel-title">Access</div>
      <div className="role-chip">Your role: {role}</div>
      {groups.length === 0 ? (
        <div className="empty-hint">Create a group to manage access for a canvas section.</div>
      ) : (
        groups.map((group) => (
          <label className="permission-row" key={group.id}>
            <span>{group.name}</span>
            <select
              value={getPermission(group.id)}
              disabled={role !== 'owner'}
              onChange={(event) => onChange(group.id, event.target.value as 'viewer' | 'editor')}
            >
              <option value="editor">Can edit</option>
              <option value="viewer">View only</option>
            </select>
          </label>
        ))
      )}
    </div>
  );
}
