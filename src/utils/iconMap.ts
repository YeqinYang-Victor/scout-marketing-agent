/**
 * 图标名 → lucide-react 组件的映射表。
 * 用于 Agent 配置里按名称动态渲染图标。
 */
import {
  Bot,
  Code,
  Globe,
  Sparkles,
  FileText,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react';

// Icon 映射
export const ICON_MAP: Record<string, LucideIcon> = {
  Bot,
  Sparkles,
  Code,
  FileText,
  Globe,
  Lightbulb,
};
