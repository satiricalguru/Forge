/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../styles.css';
import { URI } from '../../../../../../../base/common/uri.js';
import { useAccessor, useChatThreadsState, useFullChatThreadsStreamState, useSettingsState, useMCPServiceState, useCommandBarState } from '../util/services.js';
import { ModelSelection } from '../../../../common/voidSettingsTypes.js';
import { IAgentSession, PermissionLevel, AgentType } from '../../../../common/sessionRegistryTypes.js';


// ── Types & helpers ───────────────────────────────────────────────────────────

type SessionStatus = 'running' | 'done' | 'error' | 'awaiting-input' | 'archived';

const B = 'var(--vscode-panel-border, var(--vscode-sideBar-border, var(--vscode-contrastBorder, transparent)))';

const Badge = ({ count }: {count: number;}) =>
<span style={{
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 16, height: 16, padding: '0 4px', fontSize: 10, fontWeight: 600,
  borderRadius: 8,
  background: 'var(--vscode-badge-background)',
  color: 'var(--vscode-badge-foreground)',
  fontFamily: 'var(--vscode-font-family)'
}}>{count}</span>;


const StatusDot = ({ status }: {status: SessionStatus;}) => {
  const color = status === 'running' ? 'var(--vscode-charts-blue, #2196f3)' :
  status === 'error' ? 'var(--vscode-charts-red, #f44336)' :
  'var(--vscode-charts-gray, #808080)';
  return <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />;
};

const Btn = ({ children, primary, onClick, style


}: {children: React.ReactNode;primary?: boolean;onClick?: () => void;style?: React.CSSProperties;}) =>
<button onClick={onClick} style={{
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 8px', fontSize: 12, cursor: 'pointer', borderRadius: 2,
  border: 'none',
  background: primary ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)',
  color: primary ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)',
  outline: 'none',
  fontFamily: 'var(--vscode-font-family)',
  ...style
}}
onMouseEnter={(e) => {
  e.currentTarget.style.background = primary ? 'var(--vscode-button-hoverBackground)' : 'var(--vscode-button-secondaryHoverBackground)';
}}
onMouseLeave={(e) => {
  e.currentTarget.style.background = primary ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)';
}}>
  {children}</button>;


const SegmentedToggle = <T extends any,>({ options, value, onChange



}: {options: {label: string;value: T;}[];value: T;onChange: (val: T) => void;}) =>
<div style={{
  display: 'flex',
  border: `1px solid var(--vscode-button-border, var(--vscode-contrastBorder, var(--vscode-panel-border)))`,
  borderRadius: 2,
  overflow: 'hidden',
  background: 'transparent'
}}>
		{options.map((opt) => {
    const isActive = opt.value === value;
    return (
      <button
        key={String(opt.value)}
        onClick={() => onChange(opt.value)}
        style={{
          padding: '2px 8px',
          border: 'none',
          cursor: 'pointer',
          fontSize: 11,
          fontFamily: 'var(--vscode-font-family)',
          background: isActive ? 'var(--vscode-button-background)' : 'transparent',
          color: isActive ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)',
          outline: 'none',
          fontWeight: isActive ? 600 : 400
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = 'transparent';
        }}>

					{opt.label}
				</button>);

  })}
	</div>;


const TitleBarBtn = ({ icon, title, onClick }: {icon: string;title?: string;onClick?: () => void;}) =>
<button
  onClick={onClick}
  title={title}
  style={{
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 6px',
    color: 'var(--vscode-titleBar-activeForeground)',
    opacity: 0.85,
    borderRadius: 3,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    outline: 'none'
  }}
  onMouseEnter={(e) => {e.currentTarget.style.background = 'rgba(255,255,255,0.08)';e.currentTarget.style.opacity = '1';}}
  onMouseLeave={(e) => {e.currentTarget.style.background = 'none';e.currentTarget.style.opacity = '0.85';}}>

		<span className={`codicon ${icon}`} style={{ fontSize: 14 }} />
	</button>;


// ── Dropdowns ─────────────────────────────────────────────────────────────────

const ModelPickerDropdown = ({
  modelOptions,
  selectedModel,
  onSelectModel




}: {modelOptions: any[];selectedModel: ModelSelection | null;onSelectModel: (m: ModelSelection) => void;}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const clickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', clickOutside);
    return () => document.removeEventListener('click', clickOutside);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
			<div
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px',
          background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
          color: 'var(--vscode-dropdown-foreground, var(--vscode-foreground))',
          border: '1px solid var(--vscode-dropdown-border, var(--vscode-input-border, var(--vscode-panel-border)))',
          borderRadius: 2, cursor: 'pointer', fontSize: 12
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--vscode-dropdown-border, var(--vscode-input-border, var(--vscode-panel-border)))'}>

				<span className="codicon codicon-chip" style={{ fontSize: 13, color: 'var(--vscode-button-background)' }} />
				<strong style={{ fontWeight: 500 }}>
					{selectedModel ? `${selectedModel.providerName} · ${selectedModel.modelName}` : 'No Model Selected'}
				</strong>
				<span className="codicon codicon-chevron-down" style={{ fontSize: 10, opacity: 0.6 }} />
			</div>
			{open &&
      <div style={{
        position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 1000,
        minWidth: 220, background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
        border: '1px solid var(--vscode-dropdown-border, var(--vscode-panel-border))',
        borderRadius: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', overflowY: 'auto', maxHeight: 200
      }}>
					{modelOptions.length === 0 ?
        <div style={{ padding: '6px 12px', fontSize: 12, opacity: 0.6 }}>No models discovered</div> :

        modelOptions.map((opt, i) =>
        <div
          key={i}
          onClick={() => {
            onSelectModel(opt.selection);
            setOpen(false);
          }}
          style={{
            padding: '6px 12px', cursor: 'pointer', fontSize: 12,
            background: selectedModel?.modelName === opt.selection.modelName && selectedModel?.providerName === opt.selection.providerName ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
            color: selectedModel?.modelName === opt.selection.modelName && selectedModel?.providerName === opt.selection.providerName ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-foreground)'
          }}
          onMouseEnter={(e) => {
            if (!(selectedModel?.modelName === opt.selection.modelName && selectedModel?.providerName === opt.selection.providerName)) {
              e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
            }
          }}
          onMouseLeave={(e) => {
            if (!(selectedModel?.modelName === opt.selection.modelName && selectedModel?.providerName === opt.selection.providerName)) {
              e.currentTarget.style.background = 'transparent';
            }
          }}>

								{opt.selection.providerName} · {opt.selection.modelName}
							</div>
        )
        }
				</div>
      }
		</div>);

};

const WorkspacePickerDropdown = ({
  folders,
  selectedFolder,
  onSelectFolder




}: {folders: any[];selectedFolder: URI | null;onSelectFolder: (f: URI) => void;}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const clickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', clickOutside);
    return () => document.removeEventListener('click', clickOutside);
  }, [open]);

  const selectedName = selectedFolder ? selectedFolder.fsPath.split('/').pop() || 'Forge IDE' : 'Forge IDE';

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
			<div
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px',
          background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
          color: 'var(--vscode-dropdown-foreground, var(--vscode-foreground))',
          border: '1px solid var(--vscode-dropdown-border, var(--vscode-input-border, var(--vscode-panel-border)))',
          borderRadius: 2, cursor: 'pointer', fontSize: 12
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--vscode-dropdown-border, var(--vscode-input-border, var(--vscode-panel-border)))'}>

				<span className="codicon codicon-folder" style={{ fontSize: 13, opacity: 0.8 }} />
				<strong style={{ fontWeight: 500 }}>{selectedName}</strong>
				<span className="codicon codicon-chevron-down" style={{ fontSize: 10, opacity: 0.6 }} />
			</div>
			{open &&
      <div style={{
        position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 1000,
        minWidth: 180, background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
        border: '1px solid var(--vscode-dropdown-border, var(--vscode-panel-border))',
        borderRadius: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
					{folders.length === 0 ?
        <div style={{ padding: '6px 12px', fontSize: 12, opacity: 0.6 }}>No open folders</div> :

        folders.map((folder, i) => {
          const name = folder.name || folder.uri.fsPath.split('/').pop() || 'Folder';
          const isSel = selectedFolder?.fsPath === folder.uri.fsPath;
          return (
            <div
              key={i}
              onClick={() => {
                onSelectFolder(folder.uri);
                setOpen(false);
              }}
              style={{
                padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                background: isSel ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                color: isSel ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-foreground)'
              }}
              onMouseEnter={(e) => {
                if (!isSel) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
              }}
              onMouseLeave={(e) => {
                if (!isSel) e.currentTarget.style.background = 'transparent';
              }}>

									{name}
								</div>);

        })
        }
				</div>
      }
		</div>);

};

// ── File Tree & Changes ───────────────────────────────────────────────────────

const FileTree = ({ folderURI }: {folderURI: URI;}) => {
  const accessor = useAccessor();
  const fileService = accessor.get('IFileService');
  const commandService = accessor.get('ICommandService');
  const [files, setFiles] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    const loadFiles = async () => {
      try {
        const stat = await fileService.resolve(folderURI);
        if (stat.children && isMounted) {
          const filtered = stat.children.filter((c) => !c.name.startsWith('.') && c.name !== 'node_modules');
          filtered.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          });
          setFiles(filtered);
        }
      } catch (e) {
        console.error('Failed to load files:', e);
      }
    };
    loadFiles();
    return () => {isMounted = false;};
  }, [folderURI, fileService]);

  const handleOpenFile = (uri: URI) => {
    commandService.executeCommand('vscode.open', uri);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 12px', overflowY: 'auto', height: '100%' }}>
			{files.map((f) =>
      <div
        key={f.resource.fsPath}
        onClick={() => f.isDirectory ? null : handleOpenFile(f.resource)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: f.isDirectory ? 'default' : 'pointer',
          fontSize: 12,
          opacity: 0.85,
          padding: '2px 4px',
          borderRadius: 2
        }}
        onMouseEnter={(e) => {e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';e.currentTarget.style.opacity = '1';}}
        onMouseLeave={(e) => {e.currentTarget.style.background = 'transparent';e.currentTarget.style.opacity = '0.85';}}>

					<span className={`codicon ${f.isDirectory ? "codicon-folder" : "codicon-file"}`} style={{ fontSize: 13, color: f.isDirectory ? '#e2c08d' : '#81b88b' }} />
					<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
				</div>
      )}
		</div>);

};

const ChangesList = ({ activeSession, allThreads }: {activeSession: string | null;allThreads: any;}) => {
  const thread = activeSession ? allThreads[activeSession] : null;
  const commandBarState = useCommandBarState();
  const accessor = useAccessor();
  const commandService = accessor.get('ICommandService');

  if (!thread) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.4, gap: 6, padding: 16, textAlign: 'center' }}>
				<span className="codicon codicon-history" style={{ fontSize: 32 }} />
				<div style={{ fontWeight: 600 }}>No Active Session</div>
				<div style={{ fontSize: 11 }}>Select or start a session to review file changes.</div>
			</div>);
  }

  const sortedURIs = commandBarState.sortedURIs || [];

  if (sortedURIs.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.4, gap: 6, padding: 16, textAlign: 'center' }}>
        <span className="codicon codicon-source-control" style={{ fontSize: 32 }} />
        <div style={{ fontWeight: 600 }}>No File Changes Captured</div>
        <div style={{ fontSize: 11 }}>Edits proposed by this session will appear here once applied.</div>
      </div>
    );
  }

  const handleOpenFile = (uri: URI) => {
    commandService.executeCommand('vscode.open', uri);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 8px', overflowY: 'auto', height: '100%' }}>
      {sortedURIs.map((uri: any) => {
        const name = uri.fsPath.split('/').pop() || 'file';
        const state = commandBarState.stateOfURI[uri.fsPath];
        const isStreaming = state?.isStreaming;
        return (
          <div
            key={uri.fsPath}
            onClick={() => handleOpenFile(uri)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              fontSize: 12,
              opacity: 0.85,
              padding: '4px 6px',
              borderRadius: 3
            }}
            onMouseEnter={(e) => {e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';e.currentTarget.style.opacity = '1';}}
            onMouseLeave={(e) => {e.currentTarget.style.background = 'transparent';e.currentTarget.style.opacity = '0.85';}}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span className="codicon codicon-file" style={{ fontSize: 13, color: '#81b88b' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            </div>
            {isStreaming && <span className="codicon codicon-sync codicon-modifier-spin" style={{ fontSize: 12, opacity: 0.6 }} />}
          </div>
        );
      })}
    </div>
  );
};

// ── Customization Detail Panels ────────────────────────────────────────────────

const CustomizationDetailView = ({
  type,
  onClose,
  accessor




}: {type: string;onClose: () => void;accessor: any;}) => {
  const commandService = accessor.get('ICommandService');

  // Skills
  const skillsService = accessor.get('ISkillsService');
  const [skills, setSkills] = useState<any[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<any | null>(null);

  // MCP
  const mcpService = accessor.get('IMCPService');
  const mcpState = useMCPServiceState();

  useEffect(() => {
    if (type === 'Skills') {
      skillsService.getSkills([]).then(setSkills).catch(() => {});
    }
  }, [type, skillsService]);

  const handleOpenSkill = (path: string) => {
    commandService.executeCommand('vscode.open', URI.file(path));
  };

  const handleOpenMCPConfig = () => {
    mcpService.revealMCPConfigFile();
  };

  const handleToggleMCPServer = (serverName: string, currentOn: boolean) => {
    mcpService.toggleServerIsOn(serverName, !currentOn);
  };

  const containerStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: 20,
    background: 'var(--vscode-editor-background)',
    color: 'var(--vscode-editor-foreground)'
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid var(--vscode-panel-border)',
    paddingBottom: 12,
    marginBottom: 16
  };

  if (type === 'Skills') {
    return (
      <div style={containerStyle}>
				<div style={headerStyle}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						<span className="codicon codicon-extensions" style={{ fontSize: 18, color: 'var(--vscode-button-background)' }} />
						<span style={{ fontSize: 16, fontWeight: 600 }}>Skills Manager</span>
					</div>
					<button onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.8 }}>
						<span className="codicon codicon-close" style={{ fontSize: 16 }} />
					</button>
				</div>
				<div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 16 }}>
					<div style={{ width: 220, borderRight: '1px solid var(--vscode-panel-border)', overflowY: 'auto', paddingRight: 8 }}>
						{skills.length === 0 ?
            <div style={{ opacity: 0.5, fontSize: 12, padding: 8 }}>No skills found in .forge/skills/</div> :

            skills.map((skill) =>
            <div
              key={skill.name}
              onClick={() => setSelectedSkill(skill)}
              style={{
                padding: '6px 10px',
                cursor: 'pointer',
                borderRadius: 3,
                marginBottom: 4,
                fontSize: 12,
                background: selectedSkill?.name === skill.name ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                color: selectedSkill?.name === skill.name ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit'
              }}>

									{skill.name}
								</div>
            )
            }
					</div>
					<div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
						{selectedSkill ?
            <>
								<div style={{ fontSize: 15, fontWeight: 600 }}>{selectedSkill.name}</div>
								<div style={{ fontSize: 13, opacity: 0.8 }}>{selectedSkill.description}</div>
								{selectedSkill.triggerKeywords && selectedSkill.triggerKeywords.length > 0 &&
              <div>
										<div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Trigger Keywords</div>
										<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
											{selectedSkill.triggerKeywords.map((k: string) =>
                  <span key={k} style={{ padding: '2px 6px', background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)', borderRadius: 3, fontSize: 11 }}>{k}</span>
                  )}
										</div>
									</div>
              }
								{selectedSkill.allowedTools && selectedSkill.allowedTools.length > 0 &&
              <div>
										<div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Allowed Tools</div>
										<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
											{selectedSkill.allowedTools.map((t: string) =>
                  <span key={t} style={{ padding: '2px 6px', background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)', borderRadius: 3, fontSize: 11 }}>{t}</span>
                  )}
										</div>
									</div>
              }
								<div>
									<div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>File Path</div>
									<div
                  onClick={() => handleOpenSkill(selectedSkill.path)}
                  style={{ fontSize: 12, textDecoration: 'underline', cursor: 'pointer', color: 'var(--vscode-textLink-foreground)' }}>

										{selectedSkill.path}
									</div>
								</div>
								<div style={{ flex: 1, border: '1px solid var(--vscode-panel-border)', borderRadius: 4, padding: 12, background: 'var(--vscode-input-background)', fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: 12, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
									{selectedSkill.body}
								</div>
							</> :

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5, fontSize: 13 }}>
								Select a skill from the list to view its details.
							</div>
            }
					</div>
				</div>
			</div>);

  }

  if (type === 'MCP Servers') {
    const servers = mcpState?.mcpServerOfName || {};
    return (
      <div style={containerStyle}>
				<div style={headerStyle}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						<span className="codicon codicon-server-process" style={{ fontSize: 18, color: 'var(--vscode-button-background)' }} />
						<span style={{ fontSize: 16, fontWeight: 600 }}>MCP Servers</span>
					</div>
					<button onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.8 }}>
						<span className="codicon codicon-close" style={{ fontSize: 16 }} />
					</button>
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto' }}>
					<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
						<Btn primary onClick={handleOpenMCPConfig}>
							<span className="codicon codicon-edit" style={{ fontSize: 12 }} />
							Edit Config JSON
						</Btn>
					</div>
					{Object.keys(servers).length === 0 ?
          <div style={{ opacity: 0.5, fontSize: 13, textAlign: 'center', marginTop: 40 }}>No MCP servers configured. Click Edit Config JSON to add one.</div> :

          Object.entries(servers).map(([name, s]: [string, any]) => {
            const isOn = s.isOn;
            return (
              <div key={name} style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: 4, padding: 12, background: 'var(--vscode-sideBar-background)', display: 'flex', flexDirection: 'column', gap: 6 }}>
									<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
										<span style={{ fontWeight: 600, fontSize: 13 }}>{name}</span>
										<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
											<span style={{ fontSize: 11, opacity: 0.7 }}>{isOn ? 'Enabled' : 'Disabled'}</span>
											<button
                      onClick={() => handleToggleMCPServer(name, isOn)}
                      style={{
                        padding: '2px 8px', fontSize: 11, cursor: 'pointer', borderRadius: 3, border: 'none',
                        background: isOn ? 'var(--vscode-charts-red, #f44336)' : 'var(--vscode-button-background)',
                        color: '#ffffff', outline: 'none'
                      }}>

												{isOn ? 'Disable' : 'Enable'}
											</button>
										</div>
									</div>
									<div style={{ fontSize: 12, opacity: 0.8, fontFamily: 'monospace' }}>
										<strong>Command:</strong> {s.command || 'none'}
									</div>
									{s.args && s.args.length > 0 &&
                <div style={{ fontSize: 12, opacity: 0.8, fontFamily: 'monospace' }}>
											<strong>Args:</strong> {s.args.join(' ')}
										</div>
                }
								</div>);

          })
          }
				</div>
			</div>);

  }

  return (
    <div style={containerStyle}>
			<div style={headerStyle}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					<span className="codicon codicon-settings" style={{ fontSize: 18, color: 'var(--vscode-button-background)' }} />
					<span style={{ fontSize: 16, fontWeight: 600 }}>{type}</span>
				</div>
				<button onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.8 }}>
					<span className="codicon codicon-close" style={{ fontSize: 16 }} />
				</button>
			</div>
			<div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.6, gap: 12 }}>
				<span className="codicon codicon-info" style={{ fontSize: 32 }} />
				<div style={{ fontSize: 13, fontWeight: 500 }}>{type} details are handled by the main editor.</div>
				<Btn primary onClick={onClose}>Back to Sessions</Btn>
			</div>
		</div>);

};

// ── Main Component ────────────────────────────────────────────────────────────

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

	// ── Session Registry State ──────────────────────────────────────────────
	const [registrySessions, setRegistrySessions] = useState<IAgentSession[]>([]);
	const [contextMenuSession, setContextMenuSession] = useState<{ id: string; x: number; y: number } | null>(null);

	const loadSessions = useCallback(async () => {
		if (!sessionRegistry) return;
		try {
			const sessions = await sessionRegistry.list();
			setRegistrySessions(sessions.filter(s => s.status !== 'archived'));
		} catch { /* service may not be available in all contexts */ }
	}, [sessionRegistry]);

	useEffect(() => {
		loadSessions();
		if (!sessionRegistry) return;
		const sub = sessionRegistry.onDidChangeSessions(() => { loadSessions(); });
		return () => sub.dispose();
	}, [sessionRegistry, loadSessions]);

	useEffect(() => {
		if (!contextMenuSession) return;
		const closeMenu = () => setContextMenuSession(null);
		document.addEventListener('click', closeMenu);
		return () => document.removeEventListener('click', closeMenu);
	}, [contextMenuSession]);

	// Real Skills count for the Customizations badge (other categories have no
	// data source in this window yet, so they render with no badge).
	const [skillsCount, setSkillsCount] = useState(0);
	useEffect(() => {
		const skillsService = accessor.get('ISkillsService');
		skillsService.getSkills([]).then((skills: any[]) => setSkillsCount(skills.length)).catch(() => {});
	}, [accessor]);

  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [activeCustomization, setActiveCustomization] = useState<string | null>(null);

  const [isAuto, setIsAuto] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentType>('interactive');
  const [approvalLevel, setApprovalLevel] = useState<PermissionLevel>('default');
  const [autopilotWarningShown, setAutopilotWarningShown] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [followupText, setFollowupText] = useState('');
  const [activeTab, setActiveTab] = useState<'Changes' | 'Files'>('Changes');

  const [selectedFolder, setSelectedFolder] = useState<URI | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(null);

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const folders = workspaceContextService.getWorkspace().folders || [];
  const modelOptions = settingsState._modelOptions || [];

  // Live query: fetch live models from configured local providers
  const [liveModels, setLiveModels] = useState<{ name: string; selection: ModelSelection }[]>([]);
  useEffect(() => {
    let registry: any;
    try {
      registry = accessor.get('ILocalProviderRegistryService');
    } catch {
      return;
    }
    if (!registry?.listModelsFor) return;

    let cancelled = false;
    const fetchLiveModels = async () => {
      try {
        const providers: ('ollama' | 'vLLM' | 'lmStudio' | 'openAICompatible')[] = ['ollama', 'vLLM', 'lmStudio', 'openAICompatible'];
        const allLive: { name: string; selection: ModelSelection }[] = [];
        
        for (const provider of providers) {
          const providerSettings = settingsState.settingsOfProvider[provider];
          if (providerSettings && !providerSettings._didFillInProviderSettings) {
            continue;
          }
          
          try {
            const res = await registry.listModelsFor(provider);
            if (res && res.models && res.models.length > 0) {
              res.models.forEach((m: any) => {
                allLive.push({
                  name: `${provider} · ${m.id}`,
                  selection: { providerName: provider, modelName: m.id }
                });
              });
            }
          } catch (e) {
            console.error(`Failed to list live models for ${provider}:`, e);
          }
        }

        if (!cancelled) {
          setLiveModels(allLive);
        }
      } catch (err) {
        console.error('Error fetching live models:', err);
      }
    };

    fetchLiveModels();
    const interval = setInterval(fetchLiveModels, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [settingsState.settingsOfProvider, accessor]);

  const mergedModelOptions = liveModels;


  // Sync active folder
  useEffect(() => {
    if (!selectedFolder && folders.length > 0) {
      setSelectedFolder(folders[0].uri);
    }
  }, [folders]);

  // Sync active model
  useEffect(() => {
    if (!selectedModel && mergedModelOptions.length > 0) {
      const chatSelection = settingsState.modelSelectionOfFeature['Chat'];
      if (chatSelection) {
        setSelectedModel(chatSelection);
      } else {
        setSelectedModel(mergedModelOptions[0].selection);
      }
    }
  }, [mergedModelOptions, settingsState]);

  const handleSelectModel = (model: ModelSelection) => {
    setSelectedModel(model);
    voidSettingsService.setModelSelectionOfFeature('Chat', model);
  };

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  // Group sessions dynamically
  const sessionsByWorkspace: Record<string, any[]> = {};
  const currentWorkspaceName = folders[0]?.name || 'Forge IDE';

  const allThreads = threadsState.allThreads || {};
  
  const sortedSessions = [...registrySessions].sort((a, b) => b.updatedAt - a.updatedAt);

  for (const session of sortedSessions) {
    const name = session.workspacePath ? session.workspacePath.split('/').pop() || currentWorkspaceName : currentWorkspaceName;
    if (!sessionsByWorkspace[name]) {
      sessionsByWorkspace[name] = [];
    }
    const stream = streamStateMap[session.chatThreadId];
    const status: SessionStatus = stream?.error ? 'error' : stream?.isRunning ? 'running' : session.status;

    const title = session.title || 'New Session';

    let timeStr = '';
    if (session.updatedAt) {
      try {
        const d = new Date(session.updatedAt);
        if (!isNaN(d.getTime())) {
          timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      } catch {}
    }
    if (!timeStr) {
      timeStr = new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    sessionsByWorkspace[name].push({
      id: session.chatThreadId,
      registryId: session.id,
      title,
      time: timeStr,
      status,
      agentType: session.agentType,
      pinned: session.pinned
    });
  }

  const activeObj = allThreads[activeSession || ''];

  // Find the registry session for the active chat thread
  const activeRegistrySession = registrySessions.find(s => s.chatThreadId === activeSession);

  const handleCreateSession = async () => {
    if (!prompt.trim()) return;

    // Create new thread, carrying the agent type/auto mode so it persists correctly
    chatThreadsService.openNewThread({ agentType: agentMode, isAuto });
    const currentThread = chatThreadsService.getCurrentThread();
    if (!currentThread) {
      console.error('[AgentsWindow] No current thread after openNewThread');
      return;
    }

    // Persist session in registry
    if (sessionRegistry) {
      try {
        await sessionRegistry.create({
          workspacePath: selectedFolder?.fsPath ?? folders[0]?.uri.fsPath ?? '',
          agentType: agentMode,
          title: prompt.slice(0, 60),
          providerId: selectedModel?.providerName ?? '',
          modelId: selectedModel?.modelName ?? '',
          permissionLevel: approvalLevel,
          chatThreadId: currentThread.id,
        });
      } catch (e) {
        console.error('[AgentsWindow] Failed to register session:', e);
      }
    }

    // Send message
    try {
      await chatThreadsService.addUserMessageAndStreamResponse({
        userMessage: prompt,
        threadId: currentThread.id
      });
      setActiveSession(currentThread.id);
      setPrompt('');
    } catch (e) {
      console.error('[AgentsWindow] Failed to start session:', e);
    }
  };

  // ── Context Menu Handlers ──────────────────────────────────────────────

  const handleRenameSession = async (sessionId: string) => {
    const session = registrySessions.find(s => s.id === sessionId);
    if (!session || !sessionRegistry) return;
    const newTitle = window.prompt('Rename session:', session.title);
    if (newTitle && newTitle.trim()) {
      await sessionRegistry.update(sessionId, { title: newTitle.trim() });
    }
    setContextMenuSession(null);
  };

  const handlePinSession = async (sessionId: string) => {
    const session = registrySessions.find(s => s.id === sessionId);
    if (!session || !sessionRegistry) return;
    await sessionRegistry.update(sessionId, { pinned: !session.pinned });
    setContextMenuSession(null);
  };

  const handleArchiveSession = async (sessionId: string) => {
    if (!sessionRegistry) return;
    await sessionRegistry.archive(sessionId);
    if (activeSession === registrySessions.find(s => s.id === sessionId)?.chatThreadId) {
      setActiveSession(null);
    }
    setContextMenuSession(null);
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!sessionRegistry) return;
    const confirmed = window.confirm('Delete this session permanently?');
    if (!confirmed) return;
    const session = registrySessions.find(s => s.id === sessionId);
    await sessionRegistry.remove(sessionId);
    if (session && activeSession === session.chatThreadId) {
      setActiveSession(null);
    }
    setContextMenuSession(null);
  };

  const handleMarkDone = async (sessionId: string) => {
    if (!sessionRegistry) return;
    await sessionRegistry.update(sessionId, { status: 'done' });
    setContextMenuSession(null);
  };

  // ── Approval Level Handler ─────────────────────────────────────────────

  const handleApprovalChange = (level: PermissionLevel) => {
    if (level === 'autopilot' && !autopilotWarningShown) {
      const confirmed = window.confirm(
        '⚠️ AUTOPILOT MODE\n\n' +
        'This mode auto-approves ALL tool calls and resolves all clarifying questions automatically. ' +
        'The agent will have unrestricted access to read/write files and execute terminal commands in your workspace.\n\n' +
        'Only use this if you trust the model and have reviewed your workspace contents.\n\n' +
        'Are you sure you want to enable Autopilot?'
      );
      if (!confirmed) return;
      setAutopilotWarningShown(true);
    }
    setApprovalLevel(level);
    // Persist to active registry session if one exists
    if (activeRegistrySession && sessionRegistry) {
      sessionRegistry.update(activeRegistrySession.id, { permissionLevel: level });
    }
  };

  const handleSendFollowup = async () => {
    if (!followupText.trim() || !activeSession) return;

    await chatThreadsService.addUserMessageAndStreamResponse({
      userMessage: followupText,
      threadId: activeSession
    });

    setFollowupText('');
  };

  const handleNewSessionBtn = () => {
    setActiveSession(null);
    setActiveCustomization(null);
  };

  const sb: React.CSSProperties = { background: 'var(--vscode-sideBar-background)', color: 'var(--vscode-sideBar-foreground, var(--vscode-foreground))' };
  const eb: React.CSSProperties = { background: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground, var(--vscode-foreground))' };

  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

  // Count customizations
  const mcpCount = Object.keys(mcpState?.mcpServerOfName || {}).length;

  return (
    <div className="@@void-scope" style={{
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%',
      fontFamily: 'var(--vscode-font-family)',
      fontSize: 13, userSelect: 'none', overflow: 'hidden',
      ...eb
    }}>

			{/* ── Title Bar ─────────────────────────────────────────────────── */}
			<div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 35, flexShrink: 0,
        paddingLeft: isMac ? 78 : 12,
        paddingRight: 12,
        background: 'var(--vscode-titleBar-activeBackground)',
        color: 'var(--vscode-titleBar-activeForeground)',
        borderBottom: `1px solid ${B}`,
        WebkitAppRegion: 'drag' as any
      }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 4, WebkitAppRegion: 'no-drag' as any }}>
					<TitleBarBtn icon="codicon-layout-sidebar-left" title="Toggle Sidebar" />
					<div style={{ width: 4 }} />
					<TitleBarBtn icon="codicon-arrow-left" title="Back" />
					<TitleBarBtn icon="codicon-arrow-right" title="Forward" />
					<div style={{ width: 8 }} />
					<div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, opacity: 0.9 }}>
						<span className="codicon codicon-robot" style={{ fontSize: 15 }} />
						<span style={{ fontWeight: 400 }}>Forge Agents</span>
						<span style={{
              fontSize: 10, padding: '1px 5px', borderRadius: 2, fontWeight: 500,
              background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)',
              border: '1px solid var(--vscode-contrastBorder, transparent)'
            }}>local-first</span>
					</div>
				</div>

				<div style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
          padding: '3px 12px',
          background: 'var(--vscode-breadcrumb-background, var(--vscode-titleBar-activeBackground))',
          border: `1px solid var(--vscode-breadcrumb-border, ${B})`,
          borderRadius: 12,
          opacity: 0.95,
          WebkitAppRegion: 'no-drag' as any
        }}>
					<span className="codicon codicon-folder" style={{ fontSize: 13, opacity: 0.8 }} />
					<span>{activeSession ? activeObj?.workspacePath?.split('/').pop() || currentWorkspaceName : currentWorkspaceName}</span>
					<span style={{ opacity: 0.5 }}>·</span>
					<span style={{ fontWeight: 500 }}>
						{activeSession ? (
							(() => {
								const firstMsg = activeObj?.messages?.[0];
								const rawContent = firstMsg && (firstMsg.role === 'user' || firstMsg.role === 'tool') ? firstMsg.content : '';
								return rawContent ? rawContent.slice(0, 30) : 'New Session';
							})()
						) : 'New Session'}
					</span>
				</div>

				<div style={{ display: 'flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' as any }}>
					<div style={{ display: 'inline-flex', alignItems: 'stretch', borderRadius: 2, overflow: 'hidden' }}>
						<button style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: 12, cursor: 'pointer', border: 'none',
              background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', outline: 'none',
              fontFamily: 'var(--vscode-font-family)', borderRight: '1px solid var(--vscode-button-border, rgba(255,255,255,0.15))'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--vscode-button-hoverBackground)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--vscode-button-background)'}>

							<span className="codicon codicon-play" style={{ fontSize: 11 }} />
							<span>Tasks</span>
						</button>
						<button style={{
              display: 'inline-flex', alignItems: 'center', padding: '3px 5px', fontSize: 10, cursor: 'pointer', border: 'none',
              background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', outline: 'none'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--vscode-button-hoverBackground)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--vscode-button-background)'}>

							<span className="codicon codicon-chevron-down" />
						</button>
					</div>
					<TitleBarBtn icon="codicon-terminal" title="Terminal" />
					<TitleBarBtn icon="codicon-layout-panel" title="Panel" />
					<TitleBarBtn icon="codicon-broadcast" title="Broadcast" />
					<TitleBarBtn icon="codicon-account" title="Account" />
				</div>
			</div>

			{/* ── Main Body ─────────────────────────────────────────────────── */}
			<div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

				{/* Left Sidebar */}
				<div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${B}`, ...sb }}>
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 35, padding: '0 8px 0 12px', borderBottom: `1px solid ${B}` }}>
						<span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.75 }}>Sessions</span>
						<button onClick={handleNewSessionBtn} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', color: 'inherit', opacity: 0.7 }}>
							<span className="codicon codicon-add" style={{ fontSize: 16 }} />
						</button>
					</div>

					{/* Grouped workspace lists */}
					<div style={{ flex: 1, overflowY: 'auto' }}>
						{Object.keys(sessionsByWorkspace).length === 0 ?
            <div style={{ padding: '12px 16px', opacity: 0.5, fontSize: 12 }}>No active sessions</div> :

            Object.entries(sessionsByWorkspace).map(([workspace, list]) => {
              const isCollapsed = collapsedGroups[workspace];
              return (
                <div key={workspace} style={{ display: 'flex', flexDirection: 'column' }}>
										<div
                    onClick={() => toggleGroup(workspace)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      height: 24, padding: '0 8px 0 6px', cursor: 'pointer',
                      background: 'var(--vscode-sideBarSectionHeader-background, transparent)',
                      borderBottom: `1px solid ${B}`
                    }}
                    onMouseEnter={(e) => {
                      const actions = e.currentTarget.querySelector('.group-actions') as HTMLElement;
                      if (actions) actions.style.opacity = '0.8';
                    }}
                    onMouseLeave={(e) => {
                      const actions = e.currentTarget.querySelector('.group-actions') as HTMLElement;
                      if (actions) actions.style.opacity = '0';
                    }}>

											<div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
												<span className={`codicon ${isCollapsed ? "codicon-chevron-right" : "codicon-chevron-down"}`} style={{ fontSize: 12, opacity: 0.7 }} />
												<span style={{
                        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                        color: 'var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground))',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
													{workspace}
												</span>
											</div>
											<div className="@@group-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0, transition: 'opacity 0.1s' }}>
												<span className="codicon codicon-add" style={{ fontSize: 12 }} title="New Session" onClick={(e) => {e.stopPropagation();handleNewSessionBtn();}} />
												<span className="codicon codicon-check" style={{ fontSize: 12 }} title="All Resolved" />
											</div>
										</div>
										{!isCollapsed &&
											<div style={{ display: 'flex', flexDirection: 'column' }}>
												{list.map((s) => {
													const active = activeSession === s.id;
													return (
														<div key={s.id}
															onClick={() => {
																chatThreadsService.switchToThread(s.id);
																setActiveSession(s.id);
																setActiveCustomization(null);
															}}
															onContextMenu={(e) => {
																e.preventDefault();
																setContextMenuSession({ id: s.registryId, x: e.clientX, y: e.clientY });
															}}
															style={{
																display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 12px', cursor: 'pointer',
																background: active ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
																color: active ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit',
																width: '100%',
																boxSizing: 'border-box'
															}}
															onMouseEnter={(e) => {if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--vscode-list-hoverBackground)';}}
															onMouseLeave={(e) => {if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent';}}>

															<div style={{ marginTop: 4 }}><StatusDot status={s.status} /></div>
															<div style={{ flex: 1, minWidth: 0 }}>
																<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
																	<div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.title}</div>
																	{s.pinned && <span className="codicon codicon-pin" style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }} />}
																</div>
																<div style={{ fontSize: 11, opacity: 0.55, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
																	<span className="codicon codicon-folder" style={{ fontSize: 10 }} />
																	<span>·</span>
																	<span>{s.time}</span>
																</div>
															</div>
														</div>);
												})}
											</div>
										}
									</div>
								);
							})
						}
					</div>

					{/* Customizations */}
					<div style={{ borderTop: `1px solid ${B}` }}>
						<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 4px 12px', height: 32 }}>
							<span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.75 }}>Customizations</span>
							<button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', color: 'inherit', opacity: 0.6 }}>
								<span className="codicon codicon-settings-gear" style={{ fontSize: 14 }} />
							</button>
						</div>
						{([
            { icon: 'codicon-home', label: 'Overview', count: 0 },
            { icon: 'codicon-account', label: 'Agents', count: 0 },
            { icon: 'codicon-extensions', label: 'Skills', count: skillsCount },
            { icon: 'codicon-book', label: 'Instructions', count: 0 },
            { icon: 'codicon-bolt', label: 'Hooks', count: 0 },
            { icon: 'codicon-server-process', label: 'MCP Servers', count: mcpCount },
            { icon: 'codicon-plug', label: 'Plugins', count: 0 },
            { icon: 'codicon-tools', label: 'Tools', count: 0 }] as
            {icon: string;label: string;count: number;}[]).map((item) => {
              const isSel = activeCustomization === item.label;
              return (
                <div key={item.label}
                onClick={() => {setActiveCustomization(item.label);setActiveSession(null);}}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', cursor: 'pointer', fontSize: 13,
                  background: isSel ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                  color: isSel ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit'
                }}
                onMouseEnter={(e) => {if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'var(--vscode-list-hoverBackground)';}}
                onMouseLeave={(e) => {if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'transparent';}}>

									<div style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: 0.85 }}>
										<span className={`codicon ${item.icon}`} style={{ fontSize: 14 }} />
										<span>{item.label}</span>
									</div>
									{item.count > 0 && <Badge count={item.count} />}
								</div>);

            })}
						<div style={{ height: 8 }} />
					</div>
				</div>

				{/* Center panel */}
				<div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', ...eb }}>
					{activeCustomization ?
          <CustomizationDetailView
            type={activeCustomization}
            onClose={() => setActiveCustomization(null)}
            accessor={accessor} /> :

          !activeSession ?
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
							<div style={{ width: '100%', maxWidth: 560 }}>

								{/* Workspace & Model Selector */}
								<div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                marginBottom: 12,
                flexWrap: 'wrap',
                color: 'var(--vscode-foreground)'
              }}>
									<span>New session in</span>
									<WorkspacePickerDropdown
                  folders={folders}
                  selectedFolder={selectedFolder}
                  onSelectFolder={setSelectedFolder} />

									<span>with</span>
									<ModelPickerDropdown
                  modelOptions={mergedModelOptions}
                  selectedModel={selectedModel}
                  onSelectModel={handleSelectModel} />

								</div>

								{/* Prompt Textarea */}
								<div style={{ border: `1px solid var(--vscode-input-border, ${B})`, borderRadius: 2, background: 'var(--vscode-input-background)', marginBottom: 8, overflow: 'hidden' }}>
									<textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleCreateSession();
                    }
                  }}
                  placeholder="What will you launch? (e.g., 'Refactor the terminal manager to use an event-driven listener...')"
                  style={{
                    display: 'block', width: '100%', height: 90, padding: '10px 12px', resize: 'none',
                    fontFamily: 'var(--vscode-font-family)', fontSize: 13,
                    background: 'var(--vscode-input-background)', border: 'none', outline: 'none',
                    color: 'var(--vscode-input-foreground)', boxSizing: 'border-box'
                  }} />

									<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', borderTop: `1px solid ${B}`, background: 'var(--vscode-sideBar-background)' }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
											<SegmentedToggle
                      options={[
                      { label: 'Interactive', value: 'interactive' },
                      { label: 'Background', value: 'background' }]
                      }
                      value={agentMode}
                      onChange={setAgentMode} />

											<SegmentedToggle
                      options={[
                      { label: 'Manual', value: false },
                      { label: 'Auto', value: true }]
                      }
                      value={isAuto}
                      onChange={setIsAuto} />

										</div>
										<button
                    onClick={handleCreateSession}
                    style={{
                      width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'none', border: 'none', color: 'var(--vscode-foreground)', opacity: 0.7, cursor: 'pointer', outline: 'none'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}>

											<span className="codicon codicon-newline" style={{ fontSize: 16 }} />
										</button>
									</div>
								</div>

								{/* Footer */}
								<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.55, padding: '0 4px', color: 'var(--vscode-foreground)' }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
										<span className="codicon codicon-shield" style={{
											fontSize: 12,
											color: approvalLevel === 'autopilot' ? 'var(--vscode-charts-red, #f44336)' :
												approvalLevel === 'bypass' ? 'var(--vscode-charts-yellow, #ff9800)' :
												'var(--vscode-charts-green, #4caf50)'
										}} />
										<SegmentedToggle
											options={[
												{ label: 'Default', value: 'default' as PermissionLevel },
												{ label: 'Bypass', value: 'bypass' as PermissionLevel },
												{ label: 'Autopilot', value: 'autopilot' as PermissionLevel }
											]}
											value={approvalLevel}
											onChange={handleApprovalChange} />
									</div>
									<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
											<span className="codicon codicon-folder" style={{ fontSize: 12 }} />
											<span>{selectedFolder ? selectedFolder.fsPath.split('/').pop() || 'Forge IDE' : 'Forge IDE'}</span>
										</div>
										<span style={{ opacity: 0.3 }}>|</span>
										<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
											<span className="codicon codicon-git-branch" style={{ fontSize: 12 }} />
											<span>Branch: <strong>main</strong></span>
										</div>
									</div>
								</div>
							</div>
						</div> :

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16, gap: 12 }}>
							<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: `1px solid ${B}` }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
									<span className="codicon codicon-check-all" style={{ fontSize: 16, color: 'var(--vscode-charts-green, #4caf50)' }} />
									<div>
										<div style={{ fontWeight: 600, fontSize: 13 }}>{activeObj?.messages[0]?.content?.slice(0, 50) || 'Active Session'}</div>
										<div style={{ fontSize: 11, opacity: 0.55 }}>
											Local {activeObj?.agentType === 'background' ? 'Background' : 'Interactive'} · {activeObj?.workspacePath?.split('/').pop() || currentWorkspaceName}
										</div>
									</div>
								</div>
								<Badge count={activeObj?.messages?.length || 0} />
							</div>

							<div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
								{activeObj?.messages?.map((msg: any, i: number) => {
                const isUser = msg.role === 'user';
                const isAssistant = msg.role === 'assistant';
                if (isUser) {
                  return (
                    <div key={i} style={{ maxWidth: 520, padding: '8px 12px', borderRadius: 2, background: 'var(--vscode-sideBar-background)', border: `1px solid ${B}`, fontSize: 13 }}>
												<span style={{ fontWeight: 700, fontSize: 11, opacity: 0.55, display: 'block', marginBottom: 4 }}>User</span>
												{msg.content}
											</div>);

                } else if (isAssistant) {
                  return (
                    <div key={i} style={{ maxWidth: 520, marginLeft: 'auto', padding: '8px 12px', borderRadius: 2, background: 'var(--vscode-sideBar-background)', border: `1px solid var(--vscode-button-background)`, fontSize: 13 }}>
												<span style={{ fontWeight: 700, fontSize: 11, color: 'var(--vscode-button-background)', display: 'block', marginBottom: 4 }}>Agent ({selectedModel?.modelName || 'Local LLM'})</span>
												{msg.displayContent || msg.content}
											</div>);

                } else if (msg.role === 'tool' || msg.tool_calls) {
                  const toolName = msg.tool_calls?.[0]?.name || msg.tool_call_id || 'tool_call';
                  return (
                    <div key={i} style={{ maxWidth: 520, marginLeft: 'auto', padding: '8px 12px', borderRadius: 2, background: 'var(--vscode-input-background)', border: `1px solid ${B}`, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
												<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
													<span className="codicon codicon-tools" style={{ fontSize: 14, color: 'var(--vscode-charts-blue)' }} />
													<div>
														<span style={{ fontWeight: 700, fontSize: 11, color: 'var(--vscode-charts-blue)', display: 'block' }}>Tool: {toolName}</span>
														<span style={{ fontSize: 11, opacity: 0.55 }}>{msg.content?.slice(0, 100) || 'Executing tool...'}</span>
													</div>
												</div>
											</div>);

                }
                return null;
              })}
							</div>

							<div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'var(--vscode-input-background)', border: `1px solid ${B}`, borderRadius: 2 }}>
								<input
                type="text"
                value={followupText}
                onChange={(e) => setFollowupText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSendFollowup();
                  }
                }}
                placeholder="Ask follow-up or add feedback..."
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--vscode-input-foreground)', fontFamily: 'var(--vscode-font-family)' }} />

								<Btn primary onClick={handleSendFollowup}>Send</Btn>
							</div>
						</div>
          }
				</div>

				{/* Right Sidebar */}
				<div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${B}`, ...sb }}>
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 35, padding: '0 8px', borderBottom: `1px solid ${B}` }}>
						<div style={{ display: 'flex' }}>
							{['Changes', 'Files'].map((t) => {
                const isActive = activeTab === t;
                return (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t as any)}
                    style={{
                      padding: '4px 12px', border: 'none', cursor: 'pointer', fontSize: 12,
                      background: isActive ? 'var(--vscode-tab-activeBackground, var(--vscode-editor-background))' : 'transparent',
                      color: 'var(--vscode-foreground)',
                      borderBottom: isActive ? `2px solid var(--vscode-button-background)` : '2px solid transparent',
                      opacity: isActive ? 1 : 0.6
                    }}>

										{t}
									</button>);

              })}
						</div>
						<div style={{ display: 'flex', gap: 2 }}>
							<button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', color: 'inherit', opacity: 0.6 }} title="Search">
								<span className="codicon codicon-search" style={{ fontSize: 14 }} />
							</button>
							<button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', color: 'inherit', opacity: 0.6 }} title="Collapse panel">
								<span className="codicon codicon-layout-sidebar-right" style={{ fontSize: 14 }} />
							</button>
						</div>
					</div>
					<div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
						{activeTab === 'Files' && selectedFolder ?
            <FileTree folderURI={selectedFolder} /> :

            <ChangesList activeSession={activeSession} allThreads={allThreads} />
            }
					</div>
				</div>

			</div>
			{/* Context Menu */}
			{contextMenuSession && (
				<div style={{
					position: 'absolute',
					top: contextMenuSession.y,
					left: contextMenuSession.x,
					zIndex: 5000,
					background: 'var(--vscode-menu-background, var(--vscode-sideBar-background))',
					color: 'var(--vscode-menu-foreground, var(--vscode-foreground))',
					border: '1px solid var(--vscode-menu-border, var(--vscode-panel-border))',
					borderRadius: 3,
					boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
					padding: '4px 0',
					minWidth: 140
				}}>
					{[
						{ label: 'Rename', icon: 'codicon-edit', action: handleRenameSession },
						{ label: 'Pin / Unpin', icon: 'codicon-pin', action: handlePinSession },
						{ label: 'Mark as Done', icon: 'codicon-check', action: handleMarkDone },
						{ label: 'Archive', icon: 'codicon-archive', action: handleArchiveSession },
						{ label: 'Delete', icon: 'codicon-trash', action: handleDeleteSession }
					].map(item => (
						<div key={item.label}
							onClick={() => item.action(contextMenuSession.id)}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								padding: '6px 12px',
								fontSize: 12,
								cursor: 'pointer'
							}}
							onMouseEnter={(e) => e.currentTarget.style.background = 'var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground))'}
							onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
						>
							<span className={`codicon ${item.icon}`} style={{ fontSize: 13 }} />
							<span>{item.label}</span>
						</div>
					))}
				</div>
			)}
		</div>);

};