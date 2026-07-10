/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../styles.css';
import { URI } from '../../../../../../../base/common/uri.js';
import { useAccessor, useChatThreadsState, useFullChatThreadsStreamState, useSettingsState, useMCPServiceState, useCommandBarState, useIsDark } from '../util/services.js';
import { ModelSelection } from '../../../../common/voidSettingsTypes.js';
import { IAgentSession, PermissionLevel, AgentType } from '../../../../common/sessionRegistryTypes.js';
import { ISkill } from '../../../../common/skillsService.js';
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';

// ── Constants ────────────────────────────────────────────────────────────────
const B = 'var(--vscode-panel-border, var(--vscode-sideBar-border, var(--vscode-contrastBorder, rgba(255,255,255,0.06))))';
const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

// Runtime codicon class helper — builds class names dynamically so scope-tailwind
// cannot prefix them. VS Code's icon CSS expects unprefixed `.codicon` selectors.
const _CI_BASE = 'codicon';
const ci = (...names: string[]) => [_CI_BASE, ...names.map(n => _CI_BASE + '-' + n)].join(' ');

// ── StatusDot ────────────────────────────────────────────────────────────────
const StatusDot = ({ status }: { status: string }) => {
  const c = status === 'running' ? '#3b82f6' : status === 'error' ? '#ef4444' : status === 'done' ? '#22c55e' : '#6b7280';
  return <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block', flexShrink: 0 }} />;
};

// ── Badge ────────────────────────────────────────────────────────────────────
const Badge = ({ count }: { count: number }) =>
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 16, height: 16, padding: '0 4px', fontSize: 10, fontWeight: 600,
    borderRadius: 8, background: 'rgba(255,255,255,0.08)',
    color: 'var(--vscode-foreground)', opacity: 0.6, fontFamily: 'var(--vscode-font-family)'
  }}>{count}</span>;

// ── SidebarBtn ───────────────────────────────────────────────────────────────
const SidebarBtn = ({ icon, label, onClick, style }: {
  icon: string; label?: string; onClick?: () => void; style?: React.CSSProperties;
}) =>
  <button onClick={onClick} title={label} style={{
    background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px',
    color: 'inherit', opacity: 0.6, outline: 'none', display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center', borderRadius: 3, ...style
  }}
  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
  onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = 'none'; }}>
    <span className={ci(icon)} style={{ fontSize: 13 }} />
  </button>;

// ── ModelDropdown ────────────────────────────────────────────────────────────
// ── ModelSelectButton ────────────────────────────────────────────────────────
const ModelSelectButton = ({
  liveModels, selectedModel, isAuto, onSelectModel, setIsAuto, direction = 'up'
}: {
  liveModels: { name: string; selection: ModelSelection }[];
  selectedModel: ModelSelection | null;
  isAuto: boolean;
  onSelectModel: (m: ModelSelection) => void;
  setIsAuto: (a: boolean) => void;
  direction?: 'up' | 'down';
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const label = isAuto ? 'Auto' : (selectedModel?.modelName || 'Auto');

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px',
          fontSize: 11, fontWeight: 500, cursor: 'pointer', borderRadius: 3, border: 'none', outline: 'none',
          background: 'none',
          color: isAuto ? '#22c55e' : 'var(--vscode-foreground)',
          opacity: 0.9,
          fontFamily: 'var(--vscode-font-family)'
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0.9'}
      >
        <span>{label}</span>
        <span className={ci('chevron-down')} style={{ fontSize: 8, opacity: 0.5, marginLeft: 2 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          ...(direction === 'up' ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }),
          left: 0, zIndex: 9999,
          minWidth: 200, maxHeight: 220, overflowY: 'auto',
          background: 'var(--vscode-dropdown-background)', border: `1px solid ${B}`,
          borderRadius: 4,
          boxShadow: direction === 'up' ? '0 -4px 16px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.3)',
          padding: '4px 0'
        }}>
          <div
            onClick={() => { setIsAuto(true); setOpen(false); }}
            style={{
              padding: '6px 14px', cursor: 'pointer', fontSize: 12,
              background: isAuto ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
              color: isAuto ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit',
              fontWeight: isAuto ? 600 : 'normal'
            }}
            onMouseEnter={e => { if (!isAuto) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'; }}
            onMouseLeave={e => { if (!isAuto) e.currentTarget.style.background = 'transparent'; }}
          >
            Auto
          </div>

          <div style={{ height: 1, background: B, margin: '4px 0' }} />

          {liveModels.length === 0 ? (
            <div style={{ padding: '6px 14px', fontSize: 12, opacity: 0.5 }}>No models available</div>
          ) : (
            liveModels.map((opt, i) => {
              const isSel = !isAuto && selectedModel?.modelName === opt.selection.modelName && selectedModel?.providerName === opt.selection.providerName;
              return (
                <div key={i}
                  onClick={() => { onSelectModel(opt.selection); setIsAuto(false); setOpen(false); }}
                  style={{
                    padding: '6px 14px', cursor: 'pointer', fontSize: 12,
                    background: isSel ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                    color: isSel ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit'
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                >
                  {opt.name}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};


// ── ApprovalsDropdown ────────────────────────────────────────────────────────
const ApprovalsDropdown = ({ approvalLevel, setApprovalLevel, direction = 'up' }: {
  approvalLevel: PermissionLevel;
  setApprovalLevel: (l: PermissionLevel) => void;
  direction?: 'up' | 'down';
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const accessor = useAccessor();

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const items = [
    {
      level: 'default' as PermissionLevel,
      title: 'Default Approvals',
      desc: 'Copilot uses your configured settings',
      icon: 'shield'
    },
    {
      level: 'bypass' as PermissionLevel,
      title: 'Bypass Approvals',
      desc: 'All tool calls are auto-approved',
      icon: 'warning'
    },
    {
      level: 'autopilot' as PermissionLevel,
      title: 'Autopilot (Preview)',
      desc: 'Autonomously iterates from start to finish',
      icon: 'rocket'
    }
  ];

  const activeItem = items.find(i => i.level === approvalLevel) || items[0];

  const handleLearnMore = () => {
    try {
      const notificationService = accessor.get('INotificationService');
      notificationService.info('Default approvals utilize settings defined in Void Settings. Bypass auto-approves all filesystem read/write and terminal actions. Autopilot runs tasks autonomously.');
    } catch {}
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', opacity: 0.7 }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
      >
        <span className={ci(activeItem.icon)} style={{ fontSize: 12 }} />
        <span>{activeItem.title}</span>
        <span className={ci('chevron-down')} style={{ fontSize: 8, opacity: 0.5, marginLeft: 2 }} />
      </div>

      {open && (
        <div style={{
          position: 'absolute',
          ...(direction === 'up' ? { bottom: '100%', marginBottom: 6 } : { top: '100%', marginTop: 4 }),
          left: 0, zIndex: 9999,
          width: 280, background: 'var(--vscode-dropdown-background)',
          border: `1px solid ${B}`, borderRadius: 6,
          boxShadow: direction === 'up' ? '0 -4px 16px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.4)',
          padding: '6px'
        }}>
          {items.map((item) => {
            const isSel = approvalLevel === item.level;
            return (
              <div key={item.level}
                onClick={() => { setApprovalLevel(item.level); setOpen(false); }}
                style={{
                  padding: '8px 12px', cursor: 'pointer', borderRadius: 4, display: 'flex', gap: 10,
                  background: isSel ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                  color: isSel ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit',
                  marginBottom: 2
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
              >
                <span className={ci(item.icon)} style={{ fontSize: 14, marginTop: 2, flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{item.title}</div>
                  <div style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.3 }}>{item.desc}</div>
                </div>
              </div>
            );
          })}

          <div style={{ height: 1, background: B, margin: '6px 2px' }} />

          <button
            onClick={handleLearnMore}
            style={{
              width: '100%', padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              borderRadius: 4, border: `1px solid ${B}`, background: 'rgba(255,255,255,0.03)',
              color: 'var(--vscode-foreground)', fontFamily: 'var(--vscode-font-family)', textAlign: 'center'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
          >
            Learn more about permissions
          </button>
        </div>
      )}
    </div>
  );
};

// ── WorkspaceDropdown ────────────────────────────────────────────────────────
const WorkspaceDropdown = ({ folders, selected, onSelect, commandService }: {
  folders: any[]; selected: URI | null; onSelect: (u: URI) => void; commandService: any;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const name = selected ? selected.fsPath.split('/').pop() || 'Workspace' : 'Workspace';
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <span onClick={() => setOpen(!open)} style={{
        cursor: 'pointer', color: 'var(--vscode-foreground)', fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: 2, padding: '0 2px'
      }}
      onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
      onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>
        📁 {name}
        <span className={ci('chevron-down')} style={{ fontSize: 8, opacity: 0.5, marginLeft: 2 }} />
      </span>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 9999,
          minWidth: 180, background: 'var(--vscode-dropdown-background)',
          border: `1px solid ${B}`, borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', padding: '4px 0'
        }}>
          {folders.map((f, i) => (
            <div key={i}
              onClick={() => { onSelect(f.uri); setOpen(false); }}
              style={{ padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {f.name || f.uri.fsPath.split('/').pop()}
            </div>
          ))}
          <div style={{ height: 1, background: B, margin: '4px 0' }} />
          <div
            onClick={() => { commandService.executeCommand('workbench.action.addRootFolder'); setOpen(false); }}
            style={{ padding: '6px 14px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span className={ci('add')} style={{ fontSize: 12 }} />
            <span>Add Folder...</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ── FileTree ─────────────────────────────────────────────────────────────────
const FileTree = ({ folderURI }: { folderURI: URI }) => {
  const accessor = useAccessor();
  const fileService = accessor.get('IFileService');
  const commandService = accessor.get('ICommandService');
  const [files, setFiles] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [childrenMap, setChildrenMap] = useState<Record<string, any[]>>({});

  useEffect(() => {
    let mounted = true;
    fileService.resolve(folderURI).then((stat: any) => {
      if (stat.children && mounted) {
        const filtered = stat.children.filter((c: any) => !c.name.startsWith('.') && c.name !== 'node_modules');
        filtered.sort((a: any, b: any) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
        setFiles(filtered);
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, [folderURI]);

  const toggleDir = async (uri: URI, path: string) => {
    if (expanded[path]) {
      setExpanded(prev => ({ ...prev, [path]: false }));
    } else {
      if (!childrenMap[path]) {
        try {
          const stat = await fileService.resolve(uri);
          if (stat.children) {
            const filtered = stat.children.filter((c: any) => !c.name.startsWith('.') && c.name !== 'node_modules');
            filtered.sort((a: any, b: any) => {
              if (a.isDirectory && !b.isDirectory) return -1;
              if (!a.isDirectory && b.isDirectory) return 1;
              return a.name.localeCompare(b.name);
            });
            setChildrenMap(prev => ({ ...prev, [path]: filtered }));
          }
        } catch {}
      }
      setExpanded(prev => ({ ...prev, [path]: true }));
    }
  };

  const renderItem = (f: any, depth: number) => {
    const path = f.resource.fsPath;
    const isExpanded = expanded[path];
    return (
      <React.Fragment key={path}>
        <div
          onClick={() => f.isDirectory ? toggleDir(f.resource, path) : commandService.executeCommand('vscode.open', f.resource)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
            paddingLeft: 8 + depth * 16, cursor: 'pointer', fontSize: 12,
            borderRadius: 0
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          {f.isDirectory ?
            <span className={ci('chevron-' + (isExpanded ? 'down' : 'right'))} style={{ fontSize: 12, opacity: 0.6, width: 16 }} /> :
            <span style={{ width: 16 }} />
          }
          <span className={ci(f.isDirectory ? 'folder' : 'symbol-file')}
            style={{ fontSize: 14, color: f.isDirectory ? '#e2c08d' : '#c5947c' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
        </div>
        {f.isDirectory && isExpanded && childrenMap[path]?.map(child => renderItem(child, depth + 1))}
      </React.Fragment>
    );
  };

  const folderName = folderURI.fsPath.split('/').pop() || 'Workspace';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 12, fontWeight: 600, opacity: 0.8 }}>
        <span className={ci('chevron-down')} style={{ fontSize: 12 }} />
        <span className={ci('folder')} style={{ fontSize: 14, color: '#e2c08d' }} />
        <span>{folderName}</span>
      </div>
      {files.map(f => renderItem(f, 1))}
    </div>
  );
};

// ── ChangesList ──────────────────────────────────────────────────────────────
const ChangesList = ({ activeSession, allThreads }: { activeSession: string | null; allThreads: any }) => {
  const commandBarState = useCommandBarState();
  const accessor = useAccessor();
  const commandService = accessor.get('ICommandService');
  const sortedURIs = commandBarState.sortedURIs || [];

  if (!activeSession || sortedURIs.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.35, gap: 6, padding: 24, textAlign: 'center' }}>
        <span className={ci('source-control')} style={{ fontSize: 28 }} />
        <div style={{ fontSize: 12, fontWeight: 500 }}>No changes yet</div>
        <div style={{ fontSize: 11 }}>Edits will appear here</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '4px 0', overflowY: 'auto', height: '100%' }}>
      {sortedURIs.map((uri: any) => {
        const name = uri.fsPath.split('/').pop() || 'file';
        const state = commandBarState.stateOfURI[uri.fsPath];
        return (
          <div key={uri.fsPath}
            onClick={() => commandService.executeCommand('vscode.open', uri)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, padding: '3px 8px' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span className={ci('file')} style={{ fontSize: 14, color: '#81b88b' }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            {state?.isStreaming && <span className={ci('loading') + ' ' + _CI_BASE + '-modifier-spin'} style={{ fontSize: 12, opacity: 0.5 }} />}
          </div>
        );
      })}
    </div>
  );
};

// ── ChatMessage ──────────────────────────────────────────────────────────────
const ChatMessage = ({ msg, modelName }: { msg: any; modelName: string }) => {
  const isUser = msg.role === 'user';
  const isTool = msg.role === 'tool' || msg.tool_calls;
  const isCheckpoint = msg.role === 'checkpoint';

  if (isCheckpoint) return null;

  // Filter out completely empty assistant messages
  if (msg.role === 'assistant' && !msg.displayContent?.trim() && !msg.content?.trim() && !msg.reasoning?.trim()) {
    return null;
  }

  // Handle cancelled tool calls cleanly
  if (msg.role === 'interrupted_streaming_tool') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', margin: '4px 0',
        background: 'rgba(255,255,255,0.02)', borderRadius: 6, fontSize: 12, opacity: 0.65,
        border: `1px solid rgba(255,255,255,0.03)`
      }}>
        <span className={ci('error')} style={{ fontSize: 12, color: 'var(--vscode-errorForeground)' }} />
        <span style={{ opacity: 0.7 }}>Tool call <strong>{msg.name}</strong> was cancelled.</span>
      </div>
    );
  }

  if (isTool) {
    const toolName = msg.tool_calls?.[0]?.name || msg.tool_call_id || 'tool';
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', margin: '4px 0',
        background: 'rgba(255,255,255,0.02)', borderRadius: 6, fontSize: 12, opacity: 0.8,
        border: `1px solid rgba(255,255,255,0.03)`
      }}>
        <span className={ci('tools')} style={{ fontSize: 12, color: 'var(--vscode-textLink-foreground)' }} />
        <span style={{ fontWeight: 600, color: 'var(--vscode-textLink-foreground)' }}>{toolName}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.5, fontStyle: 'italic' }}>
          {msg.content?.slice(0, 80)}
        </span>
      </div>
    );
  }

  const content = msg.displayContent || msg.content || '';

  return (
    <div style={{
      display: 'flex', gap: 14, padding: '16px 12px', margin: '8px 0',
      borderRadius: 8, background: isUser ? 'rgba(255,255,255,0.01)' : 'transparent',
      border: isUser ? `1px solid rgba(255,255,255,0.02)` : 'none'
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isUser ? 'rgba(255,255,255,0.08)' : 'var(--vscode-button-background)',
        color: isUser ? 'var(--vscode-foreground)' : 'var(--vscode-button-foreground)',
        boxShadow: isUser ? 'none' : '0 2px 8px rgba(0, 122, 255, 0.2)'
      }}>
        <span className={ci(isUser ? 'account' : 'sparkle')} style={{ fontSize: 14 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, marginBottom: 6,
          color: isUser ? 'var(--vscode-foreground)' : 'var(--vscode-textLink-foreground)',
          opacity: isUser ? 0.7 : 1
        }}>
          {isUser ? 'You' : modelName || 'Agent'}
        </div>
        <div className="prose-container" style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--vscode-foreground)' }}>
          <ChatMarkdownRender string={content} chatMessageLocation={undefined} />
        </div>
      </div>
    </div>
  );
};


// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN ─────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export const AgentsWindow = () => {
  const accessor = useAccessor();
  const chatThreadsService = accessor.get('IChatThreadService');
  const workspaceContextService = accessor.get('IWorkspaceContextService');
  const voidSettingsService = accessor.get('IVoidSettingsService');
  const sessionRegistry = accessor.get('ISessionRegistryService');
  const commandService = accessor.get('ICommandService');

  const threadsState = useChatThreadsState();
  const settingsState = useSettingsState();
  const mcpState = useMCPServiceState();
  const streamStateMap = useFullChatThreadsStreamState();

  // ── Sessions ─────────────────────────────────────────────────────────────
  const [registrySessions, setRegistrySessions] = useState<IAgentSession[]>([]);
  const loadSessions = useCallback(async () => {
    if (!sessionRegistry) return;
    try { setRegistrySessions((await sessionRegistry.list()).filter(s => s.status !== 'archived')); } catch {}
  }, [sessionRegistry]);

  useEffect(() => {
    loadSessions();
    if (!sessionRegistry) return;
    const sub = sessionRegistry.onDidChangeSessions(() => loadSessions());
    return () => sub.dispose();
  }, [sessionRegistry, loadSessions]);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState<AgentType>('interactive');
  const [isAuto, setIsAuto] = useState(false);
  const [approvalLevel, setApprovalLevel] = useState<PermissionLevel>('default');
  const [prompt, setPrompt] = useState('');
  const [followupText, setFollowupText] = useState('');
  const [activeRightTab, setActiveRightTab] = useState<'Changes' | 'Files'>('Changes');
  const [selectedFolder, setSelectedFolder] = useState<URI | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(null);
  const [activeCustomization, setActiveCustomization] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [hoveredSession, setHoveredSession] = useState<string | null>(null);

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string, threadId: string) => {
    e.stopPropagation();
    if (sessionRegistry) {
      try { await sessionRegistry.remove(sessionId); } catch {}
    }
    chatThreadsService.deleteThread(threadId);
    if (activeSession === threadId) {
      setActiveSession(null);
    }
  };

  const folders = workspaceContextService.getWorkspace().folders || [];
  const currentWorkspace = folders[0]?.name || 'Forge IDE';

  // ── Live model discovery ─────────────────────────────────────────────────
  const [liveModels, setLiveModels] = useState<{ name: string; selection: ModelSelection }[]>([]);
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      let registry: any;
      try { registry = accessor.get('ILocalProviderRegistryService'); } catch { return; }
      if (!registry?.listModelsFor) return;
      const providers: ('ollama' | 'vLLM' | 'lmStudio' | 'openAICompatible')[] = ['ollama', 'vLLM', 'lmStudio', 'openAICompatible'];
      const all: { name: string; selection: ModelSelection }[] = [];
      for (const p of providers) {
        try {
          const ps = settingsState.settingsOfProvider[p];
          if (ps && !ps._didFillInProviderSettings) continue;
          const res = await registry.listModelsFor(p);
          if (res?.models) res.models.forEach((m: any) => all.push({ name: `${p} · ${m.id}`, selection: { providerName: p, modelName: m.id } }));
        } catch {}
      }
      if (!cancelled) setLiveModels(all);
    };
    fetchOnce();
    return () => { cancelled = true; };
  }, [settingsState.settingsOfProvider]);

  useEffect(() => {
    if (!selectedFolder && folders.length > 0) setSelectedFolder(folders[0].uri);
  }, [folders]);

  useEffect(() => {
    if (!selectedModel && liveModels.length > 0) {
      const chat = settingsState.modelSelectionOfFeature['Chat'];
      setSelectedModel(chat || liveModels[0].selection);
    }
  }, [liveModels, settingsState]);

  const handleSelectModel = (m: ModelSelection) => {
    setSelectedModel(m);
    voidSettingsService.setModelSelectionOfFeature('Chat', m);
  };

  // ── Session data ─────────────────────────────────────────────────────────
  const allThreads = threadsState.allThreads || {};
  const sortedSessions = [...registrySessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const activeThread = activeSession ? allThreads[activeSession] : null;
  const activeStream = activeSession ? streamStateMap[activeSession] : null;
  const isStreaming = activeStream?.isRunning;

  // ── Skills & MCP counts ──────────────────────────────────────────────────
  const [skillsCount, setSkillsCount] = useState(0);
  const [skillsList, setSkillsList] = useState<ISkill[]>([]);
  useEffect(() => {
    try {
      const skillsService = accessor.get('ISkillsService');
      skillsService.getSkills([]).then((s: any[]) => {
        setSkillsCount(s.length);
        setSkillsList(s);
      }).catch(() => {});
    } catch {}
  }, []);
  const mcpCount = Object.keys(mcpState?.mcpServerOfName || {}).length;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleCreateSession = async () => {
    if (!prompt.trim()) return;
    chatThreadsService.openNewThread({ agentType: agentMode, isAuto });
    const t = chatThreadsService.getCurrentThread();
    if (!t) return;
    if (sessionRegistry) {
      try {
        await sessionRegistry.create({
          workspacePath: selectedFolder?.fsPath ?? '', agentType: agentMode,
          title: prompt.slice(0, 60), providerId: selectedModel?.providerName ?? '',
          modelId: selectedModel?.modelName ?? '', permissionLevel: approvalLevel,
          chatThreadId: t.id,
        });
      } catch {}
    }
    try {
      await chatThreadsService.addUserMessageAndStreamResponse({ userMessage: prompt, threadId: t.id });
      setActiveSession(t.id);
      setPrompt('');
    } catch {}
  };

  const handleSendFollowup = async () => {
    if (!followupText.trim() || !activeSession) return;
    await chatThreadsService.addUserMessageAndStreamResponse({ userMessage: followupText, threadId: activeSession });
    setFollowupText('');
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeThread?.messages?.length]);

  // ── Customization items ──────────────────────────────────────────────────
  const customizations: { icon: string; label: string; count: number }[] = [
    { icon: 'home', label: 'Overview', count: 0 },
    { icon: 'robot', label: 'Agents', count: 0 },
    { icon: 'lightbulb', label: 'Skills', count: skillsCount },
    { icon: 'book', label: 'Instructions', count: 0 },
    { icon: 'zap', label: 'Hooks', count: 0 },
    { icon: 'server', label: 'MCP Servers', count: mcpCount },
    { icon: 'extensions', label: 'Plugins', count: 0 },
    { icon: 'tools', label: 'Tools', count: 0 },
  ];

  const sb: React.CSSProperties = { background: 'var(--vscode-sideBar-background)', color: 'var(--vscode-sideBar-foreground, var(--vscode-foreground))' };
  const eb: React.CSSProperties = { background: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground, var(--vscode-foreground))' };

  // ════════════════════════════════════════════════════════════════════════
  // ── RENDER ─────────────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════

  return (
    <div className="@@void-scope" style={{
      display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
      fontFamily: 'var(--vscode-font-family)', fontSize: 13, userSelect: 'none', overflow: 'hidden', ...eb
    }}>

      {/* ── Title Bar ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 35, flexShrink: 0, paddingLeft: isMac ? 78 : 12, paddingRight: 8,
        background: 'var(--vscode-titleBar-activeBackground)',
        color: 'var(--vscode-titleBar-activeForeground)',
        borderBottom: `1px solid ${B}`, WebkitAppRegion: 'drag' as any
      }}>
        {/* Left: nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, WebkitAppRegion: 'no-drag' as any }}>
          <SidebarBtn icon={'layout-sidebar-left'} label="Toggle Sidebar" />
          <div style={{ width: 4 }} />
          <SidebarBtn icon={'arrow-left'} label="Back" />
          <SidebarBtn icon={'arrow-right'} label="Forward" />
        </div>

        {/* Center: breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, WebkitAppRegion: 'no-drag' as any }}>
          <span className={ci('sparkle')} style={{ fontSize: 14, opacity: 0.6 }} />
          <span>
            {activeSession
              ? `${activeThread?.messages?.[0]?.content?.slice(0, 30) || 'Session'} · ${currentWorkspace}`
              : `New Session · ${currentWorkspace}`
            }
          </span>
        </div>

        {/* Right: actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, WebkitAppRegion: 'no-drag' as any }}>
          <SidebarBtn icon={'play'} label="Run" />
          <SidebarBtn icon={'debug-disconnect'} label="Stop" />
          <span style={{ width: 8 }} />
          <SidebarBtn icon={'layout-sidebar-right-off'} label="Toggle Panel" />
          <SidebarBtn icon={'settings-gear'} label="Settings" />
          <SidebarBtn icon={'account'} label="Account" />
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ═══ LEFT SIDEBAR ════════════════════════════════════════════ */}
        <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${B}`, ...sb }}>
          {/* Sessions header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 35, padding: '0 8px 0 14px', borderBottom: `1px solid ${B}` }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Sessions</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button
                onClick={() => setActiveSession(null)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 3,
                  background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)',
                  border: 'none', outline: 'none', fontFamily: 'var(--vscode-font-family)'
                }}>
                New
                <span style={{ opacity: 0.6, fontSize: 10 }}>{isMac ? '⌘N' : 'Ctrl+N'}</span>
              </button>
              <SidebarBtn icon={'filter'} label="Filter" />
              <SidebarBtn icon={'search'} label="Search" />
            </div>
          </div>

          {/* Session list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sortedSessions.length === 0 ? (
              <div style={{ padding: '16px 14px', opacity: 0.4, fontSize: 12 }}>No sessions yet</div>
            ) : (
              sortedSessions.map(session => {
                const stream = streamStateMap[session.chatThreadId];
                const status = stream?.error ? 'error' : stream?.isRunning ? 'running' : session.status;
                const active = activeSession === session.chatThreadId;
                const isHovered = hoveredSession === session.id;
                const title = session.title || 'New Session';
                let timeStr = '';
                try {
                  const d = new Date(session.updatedAt || session.createdAt);
                  timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                } catch {}

                return (
                  <div key={session.id}
                    onClick={() => { chatThreadsService.switchToThread(session.chatThreadId); setActiveSession(session.chatThreadId); setActiveCustomization(null); }}
                    onMouseEnter={() => setHoveredSession(session.id)}
                    onMouseLeave={() => setHoveredSession(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer',
                      background: active
                        ? 'var(--vscode-list-activeSelectionBackground)'
                        : isHovered
                          ? 'var(--vscode-list-hoverBackground)'
                          : 'transparent',
                      color: active ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit'
                    }}>
                    <StatusDot status={status} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                      {timeStr && <div style={{ fontSize: 10, opacity: 0.45, marginTop: 1 }}>{timeStr}</div>}
                    </div>
                    {isHovered && (
                      <button
                        onClick={e => handleDeleteSession(e, session.id, session.chatThreadId)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                          color: 'inherit', opacity: 0.6, display: 'inline-flex', alignItems: 'center',
                          justifyContent: 'center', borderRadius: 3, outline: 'none'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = 'none'; }}
                        title="Delete Session"
                      >
                        <span className={ci('trash')} style={{ fontSize: 12 }} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Customizations */}
          <div style={{ borderTop: `1px solid ${B}`, paddingBottom: 8 }}>
            <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5 }}>
              Customizations
            </div>
            {customizations.map(item => {
              const isSel = activeCustomization === item.label;
              return (
                <div key={item.label}
                  onClick={() => { setActiveCustomization(item.label); setActiveSession(null); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '4px 14px', cursor: 'pointer', fontSize: 12,
                    background: isSel ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                    color: isSel ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit'
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span className={ci(item.icon)} style={{ fontSize: 13, width: 16, display: 'inline-flex', justifyContent: 'center' }} />
                    <span>{item.label}</span>
                  </div>
                  {item.count > 0 && <Badge count={item.count} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ CENTER PANEL ════════════════════════════════════════════ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', ...eb }}>

          {folders.length === 0 ? (
            /* ── No Folder Open View ───────────────────────────────────── */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
              <span className={ci('folder')} style={{ fontSize: 48, opacity: 0.4 }} />
              <div style={{ fontSize: 16, fontWeight: 500 }}>No Folder Open</div>
              <div style={{ fontSize: 13, opacity: 0.6, maxWidth: 320, textAlign: 'center', lineHeight: 1.5 }}>
                Open a folder to start creating sessions and pair-programming with the agent.
              </div>
              <button
                onClick={() => commandService.executeCommand('workbench.action.addRootFolder')}
                style={{
                  marginTop: 8, padding: '6px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  borderRadius: 4, border: 'none', background: 'var(--vscode-button-background)',
                  color: 'var(--vscode-button-foreground)', fontFamily: 'var(--vscode-font-family)'
                }}
              >
                Open Folder...
              </button>
            </div>
          ) : !activeSession && !activeCustomization ? (
            /* ── New Session View ──────────────────────────────────────── */
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <div style={{ width: '100%', maxWidth: 540 }}>

                {/* "New session in X" */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span style={{ opacity: 0.6 }}>New session in</span>
                  <WorkspaceDropdown folders={folders} selected={selectedFolder} onSelect={setSelectedFolder} commandService={commandService} />
                </div>

                {/* Prompt */}
                <div style={{
                  border: `1px solid ${B}`, borderRadius: 8, background: 'var(--vscode-input-background)',
                  overflow: 'hidden', transition: 'border-color 0.15s', padding: '10px 12px 8px'
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'}
                onBlur={e => e.currentTarget.style.borderColor = B}>
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreateSession(); } }}
                    placeholder="Pitch your idea"
                    rows={3}
                    style={{
                      display: 'block', width: '100%', padding: '0 0 8px 0', resize: 'none',
                      fontFamily: 'var(--vscode-font-family)', fontSize: 13,
                      background: 'transparent', border: 'none', outline: 'none',
                      color: 'var(--vscode-input-foreground)', boxSizing: 'border-box', lineHeight: 1.5
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: `1px solid rgba(255,255,255,0.04)` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button onClick={() => commandService.executeCommand('workbench.action.addRootFolder')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', color: 'inherit', opacity: 0.6 }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                        title="Add context"
                      >
                        <span className={ci('add')} style={{ fontSize: 13 }} />
                      </button>

                      <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.12)' }} />

                      <button onClick={() => setAgentMode(agentMode === 'interactive' ? 'background' : 'interactive')}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px',
                          fontSize: 11, fontWeight: 500, cursor: 'pointer', borderRadius: 3, border: 'none', outline: 'none',
                          background: 'none', color: 'var(--vscode-foreground)', opacity: 0.6,
                          fontFamily: 'var(--vscode-font-family)'
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                      >
                        <span className={ci('code')} style={{ fontSize: 12 }} />
                        <span>{agentMode === 'interactive' ? 'Agent' : 'Background'}</span>
                      </button>

                      <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.12)' }} />

                      <ModelSelectButton
                        liveModels={liveModels}
                        selectedModel={selectedModel}
                        isAuto={isAuto}
                        onSelectModel={handleSelectModel}
                        setIsAuto={setIsAuto}
                        direction="down"
                      />
                    </div>

                    <button onClick={handleCreateSession}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                        display: 'flex', alignItems: 'center', color: 'inherit',
                        opacity: prompt.trim() ? 0.9 : 0.4
                      }}
                      disabled={!prompt.trim()}
                      title="Send"
                    >
                      <span className={ci('newline')} style={{ fontSize: 13 }} />
                    </button>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.4, padding: '8px 4px 0' }}>
                  <ApprovalsDropdown approvalLevel={approvalLevel} setApprovalLevel={setApprovalLevel} direction="down" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      onClick={() => commandService.executeCommand('workbench.action.addRootFolder')}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}>
                      <span className={ci('folder')} style={{ fontSize: 12 }} />
                      <span>Folder</span>
                    </div>
                    <span style={{ opacity: 0.3 }}>|</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className={ci('git-branch')} style={{ fontSize: 12 }} />
                      <span>Branch</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeCustomization ? (
            /* ── Customization View ────────────────────────────────────── */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 24, overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <span className={ci(customizations.find(c => c.label === activeCustomization)?.icon || 'settings')} style={{ fontSize: 20 }} />
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{activeCustomization}</h2>
              </div>

              {activeCustomization === 'Skills' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {skillsList.length === 0 ? (
                    <div style={{ opacity: 0.5, fontSize: 13 }}>No custom skills loaded. Add skills under global or project customization roots.</div>
                  ) : (
                    skillsList.map((skill, i) => (
                      <div key={i} style={{ border: `1px solid ${B}`, borderRadius: 6, padding: '12px 16px', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{skill.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>{skill.description}</div>
                      </div>
                    ))
                  )}
                </div>
              ) : activeCustomization === 'MCP Servers' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {mcpCount === 0 ? (
                    <div style={{ opacity: 0.5, fontSize: 13 }}>No MCP servers registered.</div>
                  ) : (
                    Object.entries(mcpState?.mcpServerOfName || {}).map(([name, server]: [string, any], i) => (
                      <div key={i} style={{ border: `1px solid ${B}`, borderRadius: 6, padding: '12px 16px', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
                          <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.15)', color: '#22c55e', padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>Active</span>
                        </div>
                        {server?.instructions && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{server.instructions}</div>}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div style={{ opacity: 0.5, fontSize: 13 }}>
                  Customization details are configured and managed in the main editor.
                </div>
              )}

              <div style={{ marginTop: 24 }}>
                <button onClick={() => setActiveCustomization(null)}
                  style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 3, border: 'none', background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', fontFamily: 'var(--vscode-font-family)' }}>
                  Back
                </button>
              </div>
            </div>
          ) : (
            /* ── Active Session Chat ───────────────────────────────────── */
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
                <div style={{ maxWidth: 680, margin: '0 auto' }}>
                  {activeThread?.messages?.map((msg: any, i: number) => (
                    <ChatMessage key={i} msg={msg} modelName={selectedModel?.modelName || 'Agent'} />
                  ))}
                  {isStreaming && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', opacity: 0.45 }}>
                      <span className={ci('loading') + ' ' + _CI_BASE + '-modifier-spin'} style={{ fontSize: 14 }} />
                      <span style={{ fontSize: 12 }}>Thinking…</span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </div>
              <div style={{ padding: '10px 20px 14px', borderTop: `1px solid ${B}`, flexShrink: 0 }}>
                <div style={{ maxWidth: 680, margin: '0 auto' }}>
                  <div style={{
                    border: `1px solid ${B}`, borderRadius: 8, background: 'var(--vscode-input-background)',
                    overflow: 'hidden', transition: 'border-color 0.15s', padding: '10px 12px 8px'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'}
                  onBlur={e => e.currentTarget.style.borderColor = B}>
                    <textarea
                      value={followupText}
                      onChange={e => setFollowupText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendFollowup(); } }}
                      placeholder="Send a follow-up…"
                      rows={2}
                      style={{
                        display: 'block', width: '100%', padding: '0 0 8px 0', resize: 'none',
                        fontFamily: 'var(--vscode-font-family)', fontSize: 13,
                        background: 'transparent', border: 'none', outline: 'none',
                        color: 'var(--vscode-input-foreground)', boxSizing: 'border-box', lineHeight: 1.5
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: `1px solid rgba(255,255,255,0.04)` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button onClick={() => commandService.executeCommand('workbench.action.addRootFolder')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', color: 'inherit', opacity: 0.6 }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                          title="Add context"
                        >
                          <span className={ci('add')} style={{ fontSize: 13 }} />
                        </button>

                        <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.12)' }} />

                        <button onClick={() => setAgentMode(agentMode === 'interactive' ? 'background' : 'interactive')}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px',
                            fontSize: 11, fontWeight: 500, cursor: 'pointer', borderRadius: 3, border: 'none', outline: 'none',
                            background: 'none', color: 'var(--vscode-foreground)', opacity: 0.6,
                            fontFamily: 'var(--vscode-font-family)'
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                        >
                          <span className={ci('code')} style={{ fontSize: 12 }} />
                          <span>{agentMode === 'interactive' ? 'Agent' : 'Background'}</span>
                        </button>

                        <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.12)' }} />

                        <ModelSelectButton
                          liveModels={liveModels}
                          selectedModel={selectedModel}
                          isAuto={isAuto}
                          onSelectModel={handleSelectModel}
                          setIsAuto={setIsAuto}
                        />
                      </div>

                      <button onClick={handleSendFollowup}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                          display: 'flex', alignItems: 'center', color: 'inherit',
                          opacity: followupText.trim() ? 0.9 : 0.4
                        }}
                        disabled={!followupText.trim()}
                        title="Send"
                      >
                        <span className={ci('newline')} style={{ fontSize: 13 }} />
                      </button>
                    </div>
                  </div>

                  {/* Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.4, padding: '8px 4px 0' }}>
                    <ApprovalsDropdown approvalLevel={approvalLevel} setApprovalLevel={setApprovalLevel} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        onClick={() => commandService.executeCommand('workbench.action.addRootFolder')}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}>
                        <span className={ci('folder')} style={{ fontSize: 12 }} />
                        <span>Folder</span>
                      </div>
                      <span style={{ opacity: 0.3 }}>|</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className={ci('git-branch')} style={{ fontSize: 12 }} />
                        <span>Branch</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ═══ RIGHT SIDEBAR ═══════════════════════════════════════════ */}
        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${B}`, ...sb }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 35, padding: '0 8px', borderBottom: `1px solid ${B}` }}>
            <div style={{ display: 'flex' }}>
              {(['Changes', 'Files'] as const).map(t => {
                const isActive = activeRightTab === t;
                return (
                  <button key={t} onClick={() => setActiveRightTab(t)}
                    style={{
                      padding: '4px 10px', border: 'none', cursor: 'pointer', fontSize: 12,
                      background: 'transparent', color: 'var(--vscode-foreground)',
                      borderBottom: isActive ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent',
                      opacity: isActive ? 1 : 0.5, outline: 'none', fontFamily: 'var(--vscode-font-family)'
                    }}>
                    {t}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              <SidebarBtn icon={'search'} label="Search" />
              <SidebarBtn icon={'layout-sidebar-right'} label="Collapse" />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {activeRightTab === 'Files' && selectedFolder ?
              <FileTree folderURI={selectedFolder} /> :
              <ChangesList activeSession={activeSession} allThreads={allThreads} />
            }
          </div>
        </div>
      </div>
    </div>
  );
};