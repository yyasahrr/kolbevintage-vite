import { useEffect, useState } from "react";
import { ChevronLeft, type Gauge } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/utils/cn";

/** Open the active ancestor on direct loads and cross-group route changes. */
export function useExpandedNavigationGroup(activeGroup: string | null) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(activeGroup);
  useEffect(() => setExpandedGroup(activeGroup), [activeGroup]);
  return [expandedGroup, setExpandedGroup] as const;
}

export interface AdminNavigationChild {
  id: string;
  label: string;
}

export interface AdminNavigationItem {
  id: string;
  label: string;
  icon: typeof Gauge;
  children?: AdminNavigationChild[];
}

interface AdminNavMenuProps {
  items: AdminNavigationItem[];
  activeRoute: string;
  expandedGroup: string | null;
  getPath: (id: string) => string;
  badges?: Record<string, number | undefined>;
  onToggleGroup: (id: string) => void;
  onNavigate: () => void;
}

/**
 * The single admin accordion. Route selection and accordion expansion are
 * deliberately independent: a parent is a button, never a disguised link.
 */
export function AdminNavMenu({
  items,
  activeRoute,
  expandedGroup,
  getPath,
  badges = {},
  onToggleGroup,
  onNavigate,
}: AdminNavMenuProps) {
  return (
    <ul className="ad-nav-list">
      {items.map((item) => {
        const children = item.children ?? [];
        const isGroup = children.length > 0;
        const isExpanded = isGroup && expandedGroup === item.id;
        const isActiveAncestor = isGroup && children.some((child) => child.id === activeRoute);
        const submenuId = `admin-nav-group-${item.id}`;
        const badge = isGroup
          ? children.reduce((total, child) => total + (badges[child.id] ?? 0), 0)
          : (badges[item.id] ?? 0);

        return (
          <li key={item.id} className="ad-nav-entry">
            {isGroup ? (
              <button
                type="button"
                className={cn("ad-nav-item ad-nav-group", isExpanded && "is-expanded", isActiveAncestor && "is-ancestor")}
                aria-expanded={isExpanded}
                aria-controls={submenuId}
                aria-label={item.label}
                title={item.label}
                onClick={() => onToggleGroup(item.id)}
              >
                <item.icon width={16} height={16} aria-hidden="true" />
                <span>{item.label}</span>
                {badge > 0 && <em>{badge.toLocaleString("fa-IR")}</em>}
                <ChevronLeft className="ad-nav-chevron" width={16} height={16} aria-hidden="true" />
              </button>
            ) : (
              <Link
                to={getPath(item.id)}
                className={cn("ad-nav-item", activeRoute === item.id && "is-on")}
                aria-current={activeRoute === item.id ? "page" : undefined}
                aria-label={item.label}
                title={item.label}
                onClick={onNavigate}
              >
                <item.icon width={16} height={16} aria-hidden="true" />
                <span>{item.label}</span>
                {badge > 0 && <em>{badge.toLocaleString("fa-IR")}</em>}
              </Link>
            )}

            {isGroup && (
              <div
                id={submenuId}
                className={cn("ad-nav-submenu", isExpanded && "is-expanded")}
                aria-hidden={!isExpanded}
              >
                <div className="ad-nav-submenu-clip">
                  <ul className="ad-nav-submenu-list" inert={!isExpanded}>
                    {children.map((child) => {
                      const isActive = activeRoute === child.id;
                      return (
                        <li key={child.id}>
                          <Link
                            to={getPath(child.id)}
                            className={cn("ad-nav-child", isActive && "is-on")}
                            aria-current={isActive ? "page" : undefined}
                            tabIndex={isExpanded ? undefined : -1}
                            onClick={onNavigate}
                          >
                            <span>{child.label}</span>
                            {badges[child.id] ? <em>{badges[child.id]!.toLocaleString("fa-IR")}</em> : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
