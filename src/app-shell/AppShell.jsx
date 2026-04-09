import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Minus, Square, X } from 'lucide-react';
import '../styles/theme.css';
import { useSettings } from '../hooks/useSettings';

function BrandText({ primary, accent }) {
  return (
    <>
      <span>{primary}</span>
      {accent ? <span style={{ color: 'var(--primary, #6366f1)' }}>{accent}</span> : null}
    </>
  );
}

function TitleBar({ primary, accent }) {
  const [isMax, setIsMax] = useState(false);
  const checkMax = useCallback(async () => {
    try { setIsMax(await window.electronAPI.windowIsMaximized()); } catch {}
  }, []);

  useEffect(() => { checkMax(); }, [checkMax]);

  const handleMin = () => window.electronAPI.windowMinimize();
  const handleMax = async () => { await window.electronAPI.windowMaximize(); setTimeout(checkMax, 100); };
  const handleClose = () => window.electronAPI.windowClose();

  const btnBase = {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    width: 46,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.15s',
  };

  return (
    <div style={{
      height: 32,
      display: 'flex',
      alignItems: 'center',
      background: 'var(--bg-sidebar, #0d1117)',
      borderBottom: '1px solid var(--border)',
      WebkitAppRegion: 'drag',
      position: 'relative',
      zIndex: 100,
      flexShrink: 0,
    }}>
      <div style={{ padding: '0 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 0.5 }}>
        <BrandText primary={primary} accent={accent} />
      </div>
      <div style={{ flex: 1 }}/>
      <div style={{ display: 'flex', WebkitAppRegion: 'no-drag' }}>
        <button style={btnBase} onClick={handleMin}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
          <Minus size={14}/>
        </button>
        <button style={btnBase} onClick={handleMax}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
          {isMax ? <Copy size={12}/> : <Square size={12}/>}
        </button>
        <button style={btnBase} onClick={handleClose}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#e81123'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
          <X size={14}/>
        </button>
      </div>
    </div>
  );
}

const APP_VERSION = '0.1.0';

function FooterBar({ activeLabel, fullName, savedAt }) {
  const [savedFlash, setSavedFlash] = useState(false);
  const savedAtRef = useRef(null);

  useEffect(() => {
    if (!savedAt || savedAt === savedAtRef.current) return;
    savedAtRef.current = savedAt;
    setSavedFlash(true);
    const t = setTimeout(() => setSavedFlash(false), 2500);
    return () => clearTimeout(t);
  }, [savedAt]);

  return (
    <footer className="footer-bar" style={{ flexShrink: 0 }}>
      {/* LEFT — saved flash */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {savedFlash && (
          <span style={{ color: '#34d399' }}>✓ Saved</span>
        )}
      </div>

      {/* CENTER — active page */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{activeLabel}</span>
      </div>

      {/* RIGHT — version */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <span title={`${fullName} version ${APP_VERSION}`}>
          {fullName} v{APP_VERSION}
        </span>
      </div>
    </footer>
  );
}

export default function AppShell({ groups, standaloneItems = [], defaultActiveId }) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(() =>
    Object.fromEntries(groups.map((group) => [group.id, true]))
  );
  const { settings, savedAt } = useSettings();
  const company = settings?.company || {};
  const primary = company.namePrimary || company.name || 'App';
  const accent = company.nameAccent || '';
  const fullName = `${primary}${accent}`.trim() || 'Knowledgebase';
  const initials = company.initials || primary.slice(0, 1).toUpperCase() || 'A';
  const showIcon = company.showIcon !== false;
  const showName = company.showName !== false;

  const flatNavItems = useMemo(
    () => [...groups.flatMap((group) => group.items), ...standaloneItems.filter((item) => !item.divider)],
    [groups, standaloneItems]
  );

  const [activeId, setActiveId] = useState(defaultActiveId || flatNavItems[0]?.id);
  const [visitedPages, setVisitedPages] = useState(
    () => new Set([defaultActiveId || flatNavItems[0]?.id].filter(Boolean))
  );

  const navigateTo = (id) => {
    setActiveId(id);
    setVisitedPages(prev => { const s = new Set(prev); s.add(id); return s; });
    window.electronAPI?.setLastPage?.(id);
  };

  useEffect(() => {
    window.electronAPI?.getLastPage?.().then(lastId => {
      if (lastId && flatNavItems.some(item => item.id === lastId)) {
        setActiveId(lastId);
        setVisitedPages(prev => { const s = new Set(prev); s.add(lastId); return s; });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!flatNavItems.some((item) => item.id === activeId)) {
      setActiveId(defaultActiveId || flatNavItems[0]?.id);
    }
  }, [activeId, defaultActiveId, flatNavItems]);

  // Cross-page navigation via CustomEvent (e.g. "Go to Parsing →" button)
  useEffect(() => {
    const handler = (e) => {
      const id = e.detail?.tab;
      if (id && flatNavItems.some(item => item.id === id)) navigateTo(id);
    };
    window.addEventListener('kb:navigate', handler);
    return () => window.removeEventListener('kb:navigate', handler);
  }, [flatNavItems]);

  const activeItem = flatNavItems.find((item) => item.id === activeId) || flatNavItems[0];
  const ActivePage = activeItem?.page;

  const toggleGroup = (groupId) => {
    setExpandedGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  };

  if (!ActivePage) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TitleBar primary={primary} accent={accent}/>
      <div className="app-layout" style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} style={{ flexShrink: 0 }}>
          <nav className="sidebar-nav">
            {groups.map((group) => {
              const isExpanded = expandedGroups[group.id];
              return (
                <div key={group.id} className="nav-group">
                  <button
                    className={`nav-group-header ${isExpanded ? 'expanded' : ''}`}
                    onClick={() => toggleGroup(group.id)}
                    title={collapsed ? group.label : undefined}
                  >
                    <ChevronRight className="nav-group-chevron" size={14} />
                    <span className="nav-group-label">{group.label}</span>
                  </button>
                  {isExpanded ? (
                    <div className="nav-group-items">
                      {group.items.map(({ id, label, icon: Icon }) => (
                        <div
                          key={id}
                          className={`nav-item ${activeId === id ? 'active' : ''}`}
                          onClick={() => navigateTo(id)}
                          title={collapsed ? label : undefined}
                        >
                          <Icon className="nav-icon" />
                          <span className="nav-label">{label}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {standaloneItems.length ? (
              <div className="nav-standalone">
                {standaloneItems.map((item) => {
                  if (item.divider) {
                    return (
                      <div
                        key={item.id}
                        style={{
                          height: 1,
                          background: 'rgba(255,255,255,0.06)',
                          margin: '4px 0',
                          flexShrink: 0,
                        }}
                      />
                    );
                  }
                  const { id, label, icon: Icon } = item;
                  return (
                    <div
                      key={id}
                      className={`nav-item ${activeId === id ? 'active' : ''}`}
                      onClick={() => navigateTo(id)}
                      title={collapsed ? label : undefined}
                    >
                      <Icon className="nav-icon" />
                      <span className="nav-label">{label}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </nav>
          <div className="sidebar-footer">
            <button
              className="collapse-btn"
              onClick={() => setCollapsed((current) => !current)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight size={16}/> : <><ChevronLeft size={16}/><span className="nav-label">Collapse</span></>}
            </button>
          </div>
        </aside>
        <div className="main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <main className="page-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
            {flatNavItems.map(({ id, page: Page }) => {
              if (!Page || !visitedPages.has(id)) return null;
              return (
                <div key={id} style={{
                  display: activeId === id ? 'flex' : 'none',
                  flexDirection: 'column',
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                }}>
                  <Page />
                </div>
              );
            })}
          </main>
          <FooterBar activeLabel={activeItem?.label || ''} fullName={fullName} savedAt={savedAt} />
        </div>
      </div>
    </div>
  );
}
