/**
 * TabBar — reusable horizontal tab navigation.
 *
 * Props:
 *   tabs      — array of { id, label, icon: LucideComponent }
 *   active    — currently active tab id
 *   onChange  — (id) => void
 */
export default function TabBar({
  tabs,
  active,
  onChange,
  edgeBleedX = 28,
  edgeBleedTop = 24,
  stickyTop = -24,
}) {
  return (
    <div style={{
      display: 'flex', gap: 4, flexWrap: 'wrap',
      background: 'var(--bg-card)',
      borderTop: '1px solid var(--border)',
      borderLeft: '1px solid var(--border)',
      borderRight: '1px solid var(--border)',
      borderBottom: '3px solid color-mix(in srgb, var(--border) 55%, var(--text-muted) 45%)',
      borderRadius: 0, padding: 4, margin: `${-edgeBleedTop}px ${-edgeBleedX}px 20px`,
      position: 'sticky', top: stickyTop, zIndex: 30,
      boxShadow: '0 8px 18px rgba(5, 10, 20, 0.28)',
    }}>
      {tabs.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 'var(--radius-md)',
              border: 'none',
              background: isActive ? 'var(--primary)' : 'transparent',
              color:      isActive ? '#fff' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: isActive ? 600 : 500,
              cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
          >
            {Icon && <Icon size={13}/>}
            {label}
          </button>
        );
      })}
    </div>
  );
}
