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

// ── Constants ────────────────────────────────────────────────────────────────
const B = 'var(--vscode-panel-border, var(--vscode-sideBar-border, var(--vscode-contrastBorder, rgba(255,255,255,0.06))))';
const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

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
    <span className={`codicon ${icon}`} style={{ fontSize: 13 }} />
  </button>;

// ── ModelDropdown ────────────────────────────────────────────────────────────
const ModelDropdown = ({ options, selected, onSelect }: {
  options: { name: string; selection: ModelSelection }[];
  selected: ModelSelection | null;
  onSelect: (m: ModelSelection) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const label = selected ? selected.modelName : 'Select model';
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <span onClick={() => setOpen(!open)} style={{
        cursor: 'pointer', color: 'var(--vscode-foreground)', fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: 2, padding: '0 2px'
      }}
      onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
      onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>
        🤖 {label}
        <span className="codicon codicon-chevron-down" style={{ fontSize: 8, opacity: 0.5, marginLeft: 2 }} />
      </span>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 9999,
          minWidth: 240, maxHeight: 220, overflowY: 'auto',
          background: 'var(--vscode-dropdown-background)', border: `1px solid ${B}`,
          borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', padding: '4px 0'
        }}>
          {options.length === 0 ?
            <div style={{ padding: '8px 14px', fontSize: 12, opacity: 0.5 }}>No models available</div> :
            options.map((opt, i) => {
              const isSel = selected?.modelName === opt.selection.modelName && selected?.providerName === opt.selection.providerName;
              return (
                <div key={i}
                  onClick={() => { onSelect(opt.selection); setOpen(false); }}
                  style={{
                    padding: '6px 14px', cursor: 'pointer', fontSize: 12,
                    background: isSel ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                    color: isSel ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit'
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}>
                  {opt.name}
                </div>
              );
            })
          }
        </div>
      )}
    </div>
  );
};

// ── WorkspaceDropdown ────────────────────────────────────────────────────────
const WorkspaceDropdown = ({ folders, selected, onSelect }: {
  folders: any[]; selected: URI | null; onSelect: (u: URI) => void;
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
        {folders.length > 1 && <span className="codicon codicon-chevron-down" style={{ fontSize: 8, opacity: 0.5, marginLeft: 2 }} />}
      </span>
      {open && folders.length > 1 && (
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
            <span className={`codicon codicon-chevron-${isExpanded ? 'down' : 'right'}`} style={{ fontSize: 12, opacity: 0.6, width: 16 }} /> :
            <span style={{ width: 16 }} />
          }
          <span className={`codicon ${f.isDirectory ? 'codicon-folder' : 'codicon-symbol-file'}`}
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
        <span className="codicon codicon-chevron-down" style={{ fontSize: 12 }} />
        <span className="codicon codicon-folder" style={{ fontSize: 14, color: '#e2c08d' }} />
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
        <span className="codicon codicon-source-control" style={{ fontSize: 28 }} />
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
            <span className="codicon codicon-file" style={{ fontSize: 14, color: '#81b88b' }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            {state?.isStreaming && <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 12, opacity: 0.5 }} />}
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

  if (isTool) {
    const toolName = msg.tool_calls?.[0]?.name || msg.tool_call_id || 'tool';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', margin: '2px 0', background: 'rgba(255,255,255,0.02)', borderRadius: 4, fontSize: 12, opacity: 0.65 }}>
        <span className="codicon codicon-tools" style={{ fontSize: 12, color: '#60a5fa' }} />
        <span style={{ fontWeight: 500, color: '#60a5fa' }}>{toolName}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.5 }}>{msg.content?.slice(0, 80)}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 10, padding: '10px 0' }}>
      <div style={{
        width: 24, height: 24, borderRadius: 6, flexShrink: 0, marginTop: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isUser ? 'rgba(255,255,255,0.08)' : 'var(--vscode-button-background)',
        color: isUser ? 'var(--vscode-foreground)' : 'var(--vscode-button-foreground)'
      }}>
        <span className={`codicon ${isUser ? 'codicon-account' : 'codicon-sparkle'}`} style={{ fontSize: 13 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3, opacity: 0.6 }}>{isUser ? 'You' : modelName || 'Agent'}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {msg.displayContent || msg.content || ''}
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
  useEffect(() => {
    try {
      const skillsService = accessor.get('ISkillsService');
      skillsService.getSkills([]).then((s: any[]) => setSkillsCount(s.length)).catch(() => {});
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
  const customizations: { emoji: string; label: string; count: number }[] = [
    { emoji: '🏠', label: 'Overview', count: 0 },
    { emoji: '🤖', label: 'Agents', count: 0 },
    { emoji: '💡', label: 'Skills', count: skillsCount },
    { emoji: '📖', label: 'Instructions', count: 0 },
    { emoji: '⚡', label: 'Hooks', count: 0 },
    { emoji: '🖥️', label: 'MCP Servers', count: mcpCount },
    { emoji: '🔌', label: 'Plugins', count: 0 },
    { emoji: '🛠️', label: 'Tools', count: 0 },
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
          <SidebarBtn icon="codicon-layout-sidebar-left" label="Toggle Sidebar" />
          <div style={{ width: 4 }} />
          <SidebarBtn icon="codicon-arrow-left" label="Back" />
          <SidebarBtn icon="codicon-arrow-right" label="Forward" />
        </div>

        {/* Center: breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, WebkitAppRegion: 'no-drag' as any }}>
          <span className="codicon codicon-sparkle" style={{ fontSize: 14, opacity: 0.6 }} />
          <span>
            {activeSession
              ? `${activeThread?.messages?.[0]?.content?.slice(0, 30) || 'Session'} · ${currentWorkspace}`
              : `New Session · ${currentWorkspace}`
            }
          </span>
        </div>

        {/* Right: actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, WebkitAppRegion: 'no-drag' as any }}>
          <SidebarBtn icon="codicon-play" label="Run" />
          <SidebarBtn icon="codicon-debug-disconnect" label="Stop" />
          <span style={{ width: 8 }} />
          <SidebarBtn icon="codicon-layout-sidebar-right-off" label="Toggle Panel" />
          <SidebarBtn icon="codicon-settings-gear" label="Settings" />
          <SidebarBtn icon="codicon-account" label="Account" />
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
              <SidebarBtn icon="codicon-filter" label="Filter" />
              <SidebarBtn icon="codicon-search" label="Search" />
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
                const title = session.title || 'New Session';
                let timeStr = '';
                try {
                  const d = new Date(session.updatedAt || session.createdAt);
                  timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                } catch {}

                return (
                  <div key={session.id}
                    onClick={() => { chatThreadsService.switchToThread(session.chatThreadId); setActiveSession(session.chatThreadId); setActiveCustomization(null); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer',
                      background: active ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                      color: active ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit'
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                    <StatusDot status={status} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                      {timeStr && <div style={{ fontSize: 10, opacity: 0.45, marginTop: 1 }}>{timeStr}</div>}
                    </div>
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
                    <span style={{ fontSize: 13, width: 16, display: 'inline-flex', justifyContent: 'center' }}>{item.emoji}</span>
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

          {!activeSession && !activeCustomization ? (
            /* ── New Session View ──────────────────────────────────────── */
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <div style={{ width: '100%', maxWidth: 540 }}>

                {/* "New session in X with Y" */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span style={{ opacity: 0.6 }}>New session in</span>
                  <WorkspaceDropdown folders={folders} selected={selectedFolder} onSelect={setSelectedFolder} />
                  <span style={{ opacity: 0.6 }}>with</span>
                  <ModelDropdown options={liveModels} selected={selectedModel} onSelect={handleSelectModel} />
                </div>

                {/* Prompt */}
                <div style={{
                  border: `1px solid ${B}`, borderRadius: 6, background: 'var(--vscode-input-background)',
                  overflow: 'hidden', transition: 'border-color 0.15s'
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'}
                onBlur={e => e.currentTarget.style.borderColor = B}>
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCreateSession(); } }}
                    placeholder="What's next on your roadmap?"
                    rows={3}
                    style={{
                      display: 'block', width: '100%', padding: '12px 14px', resize: 'none',
                      fontFamily: 'var(--vscode-font-family)', fontSize: 13,
                      background: 'transparent', border: 'none', outline: 'none',
                      color: 'var(--vscode-input-foreground)', boxSizing: 'border-box', lineHeight: 1.5
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderTop: `1px solid rgba(255,255,255,0.04)` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <SidebarBtn icon="codicon-add" label="Add context" />
                      <button onClick={() => setAgentMode(agentMode === 'interactive' ? 'background' : 'interactive')}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                          fontSize: 11, cursor: 'pointer', borderRadius: 3, border: 'none', outline: 'none',
                          background: 'rgba(255,255,255,0.06)', color: 'var(--vscode-foreground)',
                          fontFamily: 'var(--vscode-font-family)'
                        }}>
                        <span className="codicon codicon-sparkle" style={{ fontSize: 12 }} />
                        {agentMode === 'interactive' ? 'Agent' : 'Background'}
                      </button>
                      <button onClick={() => setIsAuto(!isAuto)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                          fontSize: 11, cursor: 'pointer', borderRadius: 3, border: 'none', outline: 'none',
                          background: isAuto ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                          color: isAuto ? '#22c55e' : 'var(--vscode-foreground)',
                          fontFamily: 'var(--vscode-font-family)'
                        }}>
                        Auto
                      </button>
                    </div>
                    <SidebarBtn icon="codicon-newline" label="Send" onClick={handleCreateSession} />
                  </div>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.4, padding: '8px 4px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className="codicon codicon-shield" style={{ fontSize: 12 }} />
                    <span>{approvalLevel === 'default' ? 'Default' : approvalLevel === 'bypass' ? 'Bypass' : 'Autopilot'} Approvals</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="codicon codicon-folder" style={{ fontSize: 12 }} />
                      <span>Folder</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="codicon codicon-git-branch" style={{ fontSize: 12 }} />
                      <span>Branch</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeCustomization ? (
            /* ── Customization View ────────────────────────────────────── */
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5, gap: 8, flexDirection: 'column' }}>
              <span className="codicon codicon-settings" style={{ fontSize: 32 }} />
              <div style={{ fontSize: 14, fontWeight: 500 }}>{activeCustomization}</div>
              <div style={{ fontSize: 12 }}>Managed by the main editor.</div>
              <button onClick={() => setActiveCustomization(null)}
                style={{ marginTop: 8, padding: '4px 12px', fontSize: 12, cursor: 'pointer', borderRadius: 3, border: 'none', background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', fontFamily: 'var(--vscode-font-family)' }}>
                Back
              </button>
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
                      <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 14 }} />
                      <span style={{ fontSize: 12 }}>Thinking…</span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </div>
              <div style={{ padding: '10px 20px 14px', borderTop: `1px solid ${B}`, flexShrink: 0 }}>
                <div style={{ maxWidth: 680, margin: '0 auto' }}>
                  <div style={{
                    display: 'flex', alignItems: 'flex-end', gap: 8,
                    background: 'var(--vscode-input-background)', border: `1px solid ${B}`,
                    borderRadius: 6, padding: '8px 10px', transition: 'border-color 0.15s'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'}
                  onBlur={e => e.currentTarget.style.borderColor = B}>
                    <textarea
                      value={followupText}
                      onChange={e => setFollowupText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendFollowup(); } }}
                      placeholder="Send a follow-up…"
                      rows={1}
                      style={{
                        flex: 1, background: 'transparent', border: 'none', outline: 'none',
                        fontSize: 13, color: 'var(--vscode-input-foreground)',
                        fontFamily: 'var(--vscode-font-family)', resize: 'none', lineHeight: '20px', maxHeight: 120
                      }}
                    />
                    <button onClick={handleSendFollowup} disabled={!followupText.trim()}
                      style={{
                        width: 26, height: 26, borderRadius: 4, border: 'none',
                        background: followupText.trim() ? 'var(--vscode-button-background)' : 'transparent',
                        color: followupText.trim() ? 'var(--vscode-button-foreground)' : 'var(--vscode-disabledForeground)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0
                      }}>
                      <span className="codicon codicon-send" style={{ fontSize: 13 }} />
                    </button>
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
              <SidebarBtn icon="codicon-search" label="Search" />
              <SidebarBtn icon="codicon-layout-sidebar-right" label="Collapse" />
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