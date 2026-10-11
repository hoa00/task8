import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useRef } from 'react';
import type { RefObject } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Alert, AvatarBase, Icon, KeyHint, Menu, MenuGroup, MenuItem, MenuSeparator, SegmentedControl } from '@studio/ui';
import { useWorkspaceBootstrap, useWorkspaceId } from './workspace-context';
import { usePeopleIntents } from '../../features/people/people-intents';
import { useSearchIntents } from '../../features/search/search-intents';
import { useSettingsCommands } from '../../features/settings/useSettingsCommands';
import { useTheme } from '../../theme/theme-context';
import { links } from '../navigation';
export interface ProfileMenuProps { open: boolean; onOpenChange: (value: boolean) => void; anchor: RefObject<HTMLElement | null> }
export function ProfileMenu({ open, onOpenChange, anchor }: ProfileMenuProps) { useTranslation();
 const initialFocus = useRef<HTMLButtonElement>(null);
 const data = useWorkspaceBootstrap().data!.data, workspaceId = useWorkspaceId(), people = usePeopleIntents(), search = useSearchIntents(), settings = useSettingsCommands(), theme = useTheme(), navigate = useNavigate();
 return <Menu initialFocus={initialFocus} open={open} onOpenChange={onOpenChange} anchor={anchor} label={t("Profile")} style={{ width: 260 }}><div className="flex items-center gap-[10px] px-2 pt-2 pb-[10px]"><AvatarBase label={data.currentMember.name} initials={data.currentMember.name.split(" ").map(word => word[0]).join("").slice(0, 2)} color={data.currentMember.avatarColor} size="lg"/><div className="min-w-0"><b className="font-semibold">{data.currentMember.name}</b><div className="truncate text-xs text-muted">{data.currentMember.email}</div></div></div><MenuSeparator/><MenuItem ref={initialFocus} icon={<Icon name="user" size={15}/>} onSelect={() => { onOpenChange(false); people.openProfile(data.currentMember.id); }}>{t("View profile")}</MenuItem><MenuItem icon={<Icon name="settings" size={15}/>} onSelect={() => { onOpenChange(false); void navigate({ to: links.settings(workspaceId, "profile") }); }}>{t("Account settings")}</MenuItem><MenuSeparator/><MenuGroup label={t("Theme")}/><div className="px-[6px] pt-[2px] pb-[6px]"><SegmentedControl className="w-full [&>button]:flex-1 [&>button]:justify-center" label={t("Theme")} value={theme.preferences.theme} onValueChange={value => { if (settings.isPending()) return; void settings.run("updatePreferences", { workspaceId, body: { theme: value as "light" | "dark" | "system" } }); }} items={[{ value: "light", disabled: settings.pending, label: <><Icon name="sun" size={13}/>{t("Light")}</> }, { value: "dark", disabled: settings.pending, label: <><Icon name="moon" size={13}/>{t("Dark")}</> }, { value: "system", disabled: settings.pending, label: <><Icon name="monitor" size={13}/>{t("System")}</> }]}/></div>{settings.error && <Alert className="m-[6px] whitespace-normal" tone="danger">{settings.error}</Alert>}<MenuSeparator/><MenuItem icon={<Icon name="keyboard" size={15}/>} shortcut={<KeyHint>?</KeyHint>} onSelect={() => { onOpenChange(false); search.openShortcuts(); }}>{t("Keyboard shortcuts")}</MenuItem><MenuItem icon={<Icon name="log-out" size={15}/>} onSelect={() => { onOpenChange(false); search.signOut(); }}>{t("Sign out")}</MenuItem></Menu>;
}
