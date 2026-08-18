'use client';

import { useStoreEditor } from '@/lib/store';
import type {
  SectionType,
  Section,
  SectionStyle,
} from '@/lib/store-schema';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  GripVertical,
  Layout,
  Star,
  Grid3X3,
  MousePointerClick,
  PanelBottom,
  X,
  Settings2,
  ChevronDown,
  FilePlus2,
  Pencil,
  MoreHorizontal,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { type LucideIcon, useState, useCallback, useMemo } from 'react';

// ── Section type metadata (shared with StoreRenderer) ──────────────
import {
  SECTION_TYPE_ICONS,
  SECTION_TYPE_LABELS,
  ADDABLE_SECTION_TYPES,
  getDefaultContent,
  createDefaultSection,
} from '@/lib/section-meta';

// ── createDefaultSection is imported from section-meta ────────

// ── Sortable section item ───────────────────────────────────────────

interface SortableSectionItemProps {
  section: Section;
  isSelected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
}

function SortableSectionItem({
  section,
  isSelected,
  onSelect,
  onToggleVisibility,
  onDelete,
}: SortableSectionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = SECTION_TYPE_ICONS[section.type] || FileText;
  const label = SECTION_TYPE_LABELS[section.type] || section.type.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'group flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors',
        isDragging
          ? 'z-50 bg-zinc-700/80 shadow-xl ring-1 ring-white/10'
          : isSelected
            ? 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/40'
            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
      ].join(' ')}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <button
        className="flex-shrink-0 cursor-grab text-zinc-600 hover:text-zinc-400 active:cursor-grabbing focus:outline-none"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Icon */}
      <Icon className="h-4 w-4 flex-shrink-0 opacity-60" />

      {/* Label */}
      <span className="flex-1 truncate font-medium">{label}</span>

      {/* Visibility toggle */}
      <button
        className="flex-shrink-0 rounded p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 focus:outline-none"
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisibility();
        }}
        aria-label={section.visible ? 'Hide section' : 'Show section'}
      >
        {section.visible ? (
          <Eye className="h-3.5 w-3.5" />
        ) : (
          <EyeOff className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Delete */}
      <button
        className="flex-shrink-0 rounded p-1 text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-400/10 transition-opacity focus:outline-none"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Delete section"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Add Section Popover ─────────────────────────────────────────────

function AddSectionPopover({
  onAdd,
}: {
  onAdd: (type: SectionType) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
        >
          <Plus className="h-4 w-4" />
          Add Section
          <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 rounded-xl border-zinc-800 bg-zinc-900 p-1.5"
        side="top"
        align="start"
        sideOffset={4}
      >
        <div className="grid gap-0.5">
          {ADDABLE_SECTION_TYPES.map((type) => {
            const Icon = SECTION_TYPE_ICONS[type];
            const label = SECTION_TYPE_LABELS[type];
            return (
              <button
                key={type}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors text-left w-full focus:outline-none"
                onClick={() => {
                  onAdd(type);
                  setOpen(false);
                }}
              >
                <Icon className="h-4 w-4 text-zinc-500" />
                {label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Content Field Renderer ───────────────────────────────────────────

function ContentFieldRenderer({
  keyName,
  value,
  onChange,
  depth = 0,
}: {
  keyName: string;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  depth?: number;
}) {
  const label = keyName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    if (keyName === 'html' && value.includes('<')) {
      return (
        <div key={keyName} className={depth > 0 ? 'ml-4' : ''}>
          <Label className="text-xs text-zinc-400 mb-1.5 block">{label}</Label>
          <Textarea
            value={value}
            onChange={(e) => onChange(keyName, e.target.value)}
            rows={4}
            className="bg-zinc-800 border-zinc-700 text-zinc-100 text-xs font-mono resize-none"
          />
        </div>
      );
    }
    return (
      <div key={keyName} className={depth > 0 ? 'ml-4' : ''}>
        <Label className="text-xs text-zinc-400 mb-1.5 block">{label}</Label>
        <Input
          value={value}
          onChange={(e) => onChange(keyName, e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm"
        />
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div key={keyName} className={depth > 0 ? 'ml-4' : ''}>
        <Label className="text-xs text-zinc-400 mb-1.5 block">{label}</Label>
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(keyName, Number(e.target.value))}
          className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm"
        />
      </div>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <div
        key={keyName}
        className={`flex items-center justify-between ${depth > 0 ? 'ml-4' : ''}`}
      >
        <Label className="text-xs text-zinc-400">{label}</Label>
        <Switch
          checked={value}
          onCheckedChange={(checked) => onChange(keyName, checked)}
        />
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div key={keyName} className={depth > 0 ? 'ml-4' : ''}>
        <Label className="text-xs text-zinc-400 mb-1.5 block">{label}</Label>
        <div className="rounded-lg bg-zinc-800/60 border border-zinc-700/50 px-3 py-2 text-xs text-zinc-500">
          {value.length} item{value.length !== 1 ? 's' : ''}
        </div>
      </div>
    );
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);

    const allPrimitive = keys.every(
      (k) =>
        typeof obj[k] === 'string' ||
        typeof obj[k] === 'number' ||
        typeof obj[k] === 'boolean' ||
        obj[k] === null ||
        obj[k] === undefined
    );

    if (allPrimitive && keys.length > 0) {
      return (
        <div key={keyName} className={depth > 0 ? 'ml-4' : ''}>
          <p className="text-xs font-medium text-zinc-300 mb-2 mt-1">{label}</p>
          <div className="space-y-3 border-l border-zinc-700/50 pl-3 ml-1">
            {keys.map((k) => (
              <ContentFieldRenderer
                key={k}
                keyName={k}
                value={obj[k]}
                onChange={(subKey, subVal) => {
                  onChange(keyName, { ...obj, [subKey]: subVal });
                }}
                depth={depth + 1}
              />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div key={keyName} className={depth > 0 ? 'ml-4' : ''}>
        <Label className="text-xs text-zinc-400 mb-1.5 block">{label}</Label>
        <Textarea
          value={JSON.stringify(value, null, 2)}
          readOnly
          rows={3}
          className="bg-zinc-800/60 border-zinc-700/50 text-zinc-500 text-xs font-mono resize-none"
        />
      </div>
    );
  }

  return null;
}

// ── Hero Section Properties Panel ─────────────────────────────────
// Dedicated editor for hero/banner sections with proper select controls

function HeroPropertiesPanel({
  section,
  pageId,
}: {
  section: Section;
  pageId: string;
}) {
  const { updateSectionContent, updateSectionStyle } = useStoreEditor();
  const content = section.content as Record<string, unknown>;
  const [localStyle, setLocalStyle] = useState<SectionStyle>(section.style);

  if (section.style !== localStyle) {
    setLocalStyle(section.style);
  }

  const handleContentChange = useCallback(
    (key: string, value: unknown) => {
      updateSectionContent(pageId, section.id, { [key]: value });
    },
    [pageId, section.id, updateSectionContent]
  );

  const handleStyleChange = useCallback(
    (patch: Partial<SectionStyle>) => {
      const updated = { ...localStyle, ...patch };
      setLocalStyle(updated);
      updateSectionStyle(pageId, section.id, patch);
    },
    [pageId, section.id, localStyle, updateSectionStyle]
  );

  const renderSelect = (
    lbl: string,
    value: string | undefined,
    options: { label: string; value: string }[],
    onChange: (val: string) => void
  ) => (
    <div>
      <Label className="text-xs text-zinc-400 mb-1.5 block">{lbl}</Label>
      <Select value={value ?? ''} onValueChange={onChange}>
        <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-zinc-900 border-zinc-700">
          {options.map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const renderTextInput = (
    lbl: string,
    key: string,
    value: string,
    placeholder = ''
  ) => (
    <div>
      <Label className="text-xs text-zinc-400 mb-1.5 block">{lbl}</Label>
      <Input
        value={value}
        onChange={(e) => handleContentChange(key, e.target.value)}
        placeholder={placeholder}
        className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm"
      />
    </div>
  );

  const renderColorPicker = (
    lbl: string,
    value: string | undefined,
    onChange: (val: string) => void,
    placeholder = 'auto'
  ) => (
    <div>
      <Label className="text-xs text-zinc-400 mb-1.5 block">{lbl}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value ?? '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent p-0.5"
        />
        <Input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder={placeholder}
          className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm font-mono"
        />
      </div>
    </div>
  );

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="space-y-5 p-4">
        {/* Section badge */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 border-zinc-700 bg-zinc-800/60 text-zinc-300">
            <Layout className="h-3.5 w-3.5" />
            Hero Banner
          </Badge>
        </div>

        <Separator className="bg-zinc-800" />

        {/* ── Text Content ── */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Text Content</h4>
          <div className="space-y-3">
            {renderTextInput('Badge (Eyebrow)', 'badge', (content.badge as string) || '', 'e.g. NEW COLLECTION')}
            {renderTextInput('Headline', 'headline', (content.headline as string) || '')}
            {renderTextInput('Subheadline', 'subheadline', (content.subheadline as string) || '', 'Optional description')}
            {renderTextInput('CTA Button Text', 'ctaText', (content.ctaText as string) || '', 'Shop Now')}
            {renderTextInput('Secondary CTA', 'secondaryCtaText', (content.secondaryCtaText as string) || '', 'Optional')}
          </div>
        </div>

        <Separator className="bg-zinc-800" />

        {/* ── Layout & Composition ── */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Layout & Composition</h4>
          <div className="space-y-3">
            {renderSelect('Layout Mode', content.layout as string, [
              { label: 'Split Left (Text | Product)', value: 'split-left' },
              { label: 'Split Right (Product | Text)', value: 'split-right' },
              { label: 'Product First (60/40)', value: 'product-first' },
              { label: 'Text First (60/40)', value: 'text-first' },
              { label: 'Minimal (Centered, No Product)', value: 'minimal' },
              { label: 'Centered (Basic)', value: 'centered' },
            ], (val) => handleContentChange('layout', val))}

            {renderSelect('Alignment', content.alignment as string, [
              { label: 'Left', value: 'left' },
              { label: 'Center', value: 'center' },
              { label: 'Right', value: 'right' },
            ], (val) => handleContentChange('alignment', val))}

            {renderSelect('Height', content.height as string, [
              { label: 'Small', value: 'sm' },
              { label: 'Medium', value: 'md' },
              { label: 'Large', value: 'lg' },
              { label: 'Extra Large', value: 'xl' },
            ], (val) => handleContentChange('height', val))}

            {renderSelect('Visual Priority', content.visualPriority as string, [
              { label: 'Balanced', value: 'balanced' },
              { label: 'Product Focus', value: 'product' },
              { label: 'Headline Focus', value: 'headline' },
            ], (val) => handleContentChange('visualPriority', val))}
          </div>
        </div>

        <Separator className="bg-zinc-800" />

        {/* ── Background & Effects ── */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Background & Effects</h4>
          <div className="space-y-3">
            {renderSelect('Background Treatment', content.backgroundTreatment as string, [
              { label: 'None', value: 'none' },
              { label: 'Soft (Gentle Darken)', value: 'soft' },
              { label: 'Editorial (Magazine)', value: 'editorial' },
              { label: 'Dramatic (Cinematic)', value: 'dramatic' },
            ], (val) => handleContentChange('backgroundTreatment', val))}

            <div className="flex items-center justify-between">
              <Label className="text-xs text-zinc-400">Vignette Effect</Label>
              <Switch
                checked={!!content.vignette}
                onCheckedChange={(checked) => handleContentChange('vignette', checked)}
              />
            </div>
          </div>
        </div>

        <Separator className="bg-zinc-800" />

        {/* ── Visual Styles ── */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Visual Styles</h4>
          <div className="space-y-3">
            {renderSelect('CTA Button Style', content.ctaStyle as string, [
              { label: 'Filled (Brand Color)', value: 'filled' },
              { label: 'Outline (Ghost)', value: 'outline' },
              { label: 'Gradient (Primary to Accent)', value: 'gradient' },
            ], (val) => handleContentChange('ctaStyle', val))}

            {renderSelect('Product Image Treatment', content.productTreatment as string, [
              { label: 'Floating (Dual Shadow)', value: 'floating' },
              { label: 'Framed (Glass Border)', value: 'framed' },
              { label: 'Cutout (Heavy Shadow)', value: 'cutout' },
              { label: 'Shadow (Single Layer)', value: 'shadow' },
            ], (val) => handleContentChange('productTreatment', val))}

            {renderSelect('Badge Style', content.badgeStyle as string, [
              { label: 'Outlined (Subtle Border)', value: 'outlined' },
              { label: 'Filled (Brand Tint)', value: 'filled' },
              { label: 'Gradient (Brand Blend)', value: 'gradient' },
            ], (val) => handleContentChange('badgeStyle', val))}
          </div>
        </div>

        <Separator className="bg-zinc-800" />

        {/* ── Color Overrides ── */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Color Overrides</h4>
          <div className="space-y-3">
            {renderColorPicker('Text Color', localStyle.textColor,
              (val) => handleStyleChange({ textColor: val }), 'white')}
            {renderColorPicker('Headline Color', localStyle.headlineColor,
              (val) => handleStyleChange({ headlineColor: val }), 'inherit')}
            {renderColorPicker('Button Background', localStyle.buttonBackgroundColor,
              (val) => handleStyleChange({ buttonBackgroundColor: val }), 'use brand primary')}
            {renderColorPicker('Button Text Color', localStyle.buttonTextColor,
              (val) => handleStyleChange({ buttonTextColor: val }), 'auto-contrast')}
          </div>
        </div>

        <Separator className="bg-zinc-800" />

        {/* ── Spacing ── */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Spacing</h4>
          <div className="space-y-3">
            {renderSelect('Padding Vertical', localStyle.paddingY, [
              { label: 'Small', value: 'sm' },
              { label: 'Medium', value: 'md' },
              { label: 'Large', value: 'lg' },
              { label: 'Extra Large', value: 'xl' },
            ], (val) => handleStyleChange({ paddingY: val as SectionStyle['paddingY'] }))}

            {renderSelect('Padding Horizontal', localStyle.paddingX, [
              { label: 'Small', value: 'sm' },
              { label: 'Medium', value: 'md' },
              { label: 'Large', value: 'lg' },
            ], (val) => handleStyleChange({ paddingX: val as SectionStyle['paddingX'] }))}

            {renderSelect('Max Width', localStyle.maxWidth, [
              { label: 'Small', value: 'sm' },
              { label: 'Medium', value: 'md' },
              { label: 'Large', value: 'lg' },
              { label: 'Extra Large', value: 'xl' },
              { label: 'Full', value: 'full' },
            ], (val) => handleStyleChange({ maxWidth: val as SectionStyle['maxWidth'] }))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

// ── Properties Panel ────────────────────────────────────────────────

interface PropertiesPanelProps {
  section: Section;
  pageId: string;
}

function PropertiesPanel({ section, pageId }: PropertiesPanelProps) {
  const {
    updateSectionContent,
    updateSectionStyle,
    removeSection,
    setSelectedSectionId,
    store,
    setStore,
  } = useStoreEditor();

  const [localStyle, setLocalStyle] = useState<SectionStyle>(section.style);

  // Sync style from store when section changes
  if (section.style !== localStyle) {
    setLocalStyle(section.style);
  }

  const handleContentChange = useCallback(
    (key: string, value: unknown) => {
      updateSectionContent(pageId, section.id, { [key]: value });
    },
    [pageId, section.id, updateSectionContent]
  );

  const handleStyleChange = useCallback(
    (patch: Partial<SectionStyle>) => {
      const updated = { ...localStyle, ...patch };
      setLocalStyle(updated);
      updateSectionStyle(pageId, section.id, patch);
    },
    [pageId, section.id, localStyle, updateSectionStyle]
  );

  const handleDelete = useCallback(() => {
    removeSection(pageId, section.id);
    setSelectedSectionId(null);
    toast.success('Section deleted');
  }, [pageId, section.id, removeSection, setSelectedSectionId]);

  const handleVisibilityToggle = useCallback(() => {
    if (!store) return;
    const updatedStore = {
      ...store,
      updatedAt: new Date().toISOString(),
      pages: store.pages.map((page) => ({
        ...page,
        sections: page.sections.map((s) =>
          s.id === section.id ? { ...s, visible: !s.visible } : s
        ),
      })),
    };
    setStore(updatedStore);
  }, [store, section.id, setStore]);

  const Icon = SECTION_TYPE_ICONS[section.type] || FileText;
  const typeLabel = SECTION_TYPE_LABELS[section.type] || section.type.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());

  const renderSelect = (
    lbl: string,
    value: string | undefined,
    options: { label: string; value: string }[],
    onChange: (val: string) => void
  ) => (
    <div>
      <Label className="text-xs text-zinc-400 mb-1.5 block">{lbl}</Label>
      <Select value={value ?? ''} onValueChange={onChange}>
        <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-zinc-900 border-zinc-700">
          {options.map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-zinc-500" />
          <span className="text-sm font-semibold text-zinc-200">Properties</span>
        </div>
        <button
          className="rounded-md p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 focus:outline-none"
          onClick={() => setSelectedSectionId(null)}
          aria-label="Close properties"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-5 p-4">
          {/* Section type badge */}
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1.5 border-zinc-700 bg-zinc-800/60 text-zinc-300"
            >
              <Icon className="h-3.5 w-3.5" />
              {typeLabel}
            </Badge>
            <span className="text-xs text-zinc-600 font-mono">{section.id.slice(0, 8)}</span>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Content fields */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
              Content
            </h4>
            <div className="space-y-3">
              {Object.entries(section.content).map(([key, val]) => (
                <ContentFieldRenderer
                  key={key}
                  keyName={key}
                  value={val}
                  onChange={handleContentChange}
                />
              ))}
              {Object.keys(section.content).length === 0 && (
                <p className="text-xs text-zinc-600 italic">No content fields</p>
              )}
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Style fields */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
              Style
            </h4>
            <div className="space-y-3">
              {/* Background Color */}
              <div>
                <Label className="text-xs text-zinc-400 mb-1.5 block">
                  Background Color
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={localStyle.backgroundColor ?? '#000000'}
                    onChange={(e) =>
                      handleStyleChange({ backgroundColor: e.target.value })
                    }
                    className="h-8 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent p-0.5"
                  />
                  <Input
                    value={localStyle.backgroundColor ?? ''}
                    onChange={(e) =>
                      handleStyleChange({ backgroundColor: e.target.value || undefined })
                    }
                    placeholder="transparent"
                    className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm font-mono"
                  />
                </div>
              </div>

              {/* Text Color */}
              <div>
                <Label className="text-xs text-zinc-400 mb-1.5 block">
                  Text Color
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={localStyle.textColor ?? '#ffffff'}
                    onChange={(e) =>
                      handleStyleChange({ textColor: e.target.value })
                    }
                    className="h-8 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent p-0.5"
                  />
                  <Input
                    value={localStyle.textColor ?? ''}
                    onChange={(e) =>
                      handleStyleChange({ textColor: e.target.value || undefined })
                    }
                    placeholder="inherit"
                    className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm font-mono"
                  />
                </div>
              </div>

              <Separator className="bg-zinc-800" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                Element Overrides
              </h4>

              {/* Headline Color */}
              <div>
                <Label className="text-xs text-zinc-400 mb-1.5 block">
                  Headline Color
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={localStyle.headlineColor ?? '#000000'}
                    onChange={(e) =>
                      handleStyleChange({ headlineColor: e.target.value })
                    }
                    className="h-8 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent p-0.5"
                  />
                  <Input
                    value={localStyle.headlineColor ?? ''}
                    onChange={(e) =>
                      handleStyleChange({ headlineColor: e.target.value || undefined })
                    }
                    placeholder="inherit"
                    className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm font-mono"
                  />
                </div>
              </div>

              {/* Button Background Color */}
              <div>
                <Label className="text-xs text-zinc-400 mb-1.5 block">
                  Button Background
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={localStyle.buttonBackgroundColor ?? '#000000'}
                    onChange={(e) =>
                      handleStyleChange({ buttonBackgroundColor: e.target.value })
                    }
                    className="h-8 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent p-0.5"
                  />
                  <Input
                    value={localStyle.buttonBackgroundColor ?? ''}
                    onChange={(e) =>
                      handleStyleChange({ buttonBackgroundColor: e.target.value || undefined })
                    }
                    placeholder="use primary"
                    className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm font-mono"
                  />
                </div>
              </div>

              {/* Button Text Color */}
              <div>
                <Label className="text-xs text-zinc-400 mb-1.5 block">
                  Button Text Color
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={localStyle.buttonTextColor ?? '#ffffff'}
                    onChange={(e) =>
                      handleStyleChange({ buttonTextColor: e.target.value })
                    }
                    className="h-8 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent p-0.5"
                  />
                  <Input
                    value={localStyle.buttonTextColor ?? ''}
                    onChange={(e) =>
                      handleStyleChange({ buttonTextColor: e.target.value || undefined })
                    }
                    placeholder="auto-contrast"
                    className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm font-mono"
                  />
                </div>
              </div>

              {/* Padding Y */}
              {renderSelect(
                'Padding Vertical',
                localStyle.paddingY,
                [
                  { label: 'Small', value: 'sm' },
                  { label: 'Medium', value: 'md' },
                  { label: 'Large', value: 'lg' },
                  { label: 'Extra Large', value: 'xl' },
                ],
                (val) =>
                  handleStyleChange({
                    paddingY: val as SectionStyle['paddingY'],
                  })
              )}

              {/* Padding X */}
              {renderSelect(
                'Padding Horizontal',
                localStyle.paddingX,
                [
                  { label: 'Small', value: 'sm' },
                  { label: 'Medium', value: 'md' },
                  { label: 'Large', value: 'lg' },
                ],
                (val) =>
                  handleStyleChange({
                    paddingX: val as SectionStyle['paddingX'],
                  })
              )}

              {/* Max Width */}
              {renderSelect(
                'Max Width',
                localStyle.maxWidth,
                [
                  { label: 'Small', value: 'sm' },
                  { label: 'Medium', value: 'md' },
                  { label: 'Large', value: 'lg' },
                  { label: 'Extra Large', value: 'xl' },
                  { label: 'Full', value: 'full' },
                ],
                (val) =>
                  handleStyleChange({
                    maxWidth: val as SectionStyle['maxWidth'],
                  })
              )}

              {/* Border Radius */}
              {renderSelect(
                'Border Radius',
                localStyle.borderRadius,
                [
                  { label: 'None', value: 'none' },
                  { label: 'Small', value: 'sm' },
                  { label: 'Medium', value: 'md' },
                  { label: 'Large', value: 'lg' },
                ],
                (val) =>
                  handleStyleChange({
                    borderRadius: val as SectionStyle['borderRadius'],
                  })
              )}
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Visibility */}
          <div className="flex items-center justify-between">
            <Label className="text-xs text-zinc-400">Visible</Label>
            <Switch
              checked={section.visible}
              onCheckedChange={handleVisibilityToggle}
            />
          </div>

          <Separator className="bg-zinc-800" />

          {/* Delete */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-red-400/80 hover:text-red-300 hover:bg-red-400/10"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
            Delete Section
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Main VisualEditor Component ─────────────────────────────────────

// ── Page type labels & icons for editor tabs ────────────────────────

const PAGE_TYPE_ICONS: Record<string, LucideIcon> = {
  home: Layout,
  collection: Grid3X3,
  product: Star,
  cart: PanelBottom,
  checkout: MousePointerClick,
  custom: FileText,
};

const PAGE_TYPE_LABELS: Record<string, string> = {
  home: 'Home',
  collection: 'Shop',
  product: 'Product',
  cart: 'Cart',
  checkout: 'Checkout',
  custom: 'Custom',
};

export function VisualEditor() {
  const {
    store,
    setStore,
    selectedSectionId,
    setSelectedSectionId,
    moveSection,
    addSection,
    removeSection,
    editorCurrentPageId,
    setEditorCurrentPageId,
    addCustomPage,
    removeCustomPage,
    renameCustomPage,
  } = useStoreEditor();

  // Pages available for tab switching (real pages only, no dynamic product pages)
  // Includes custom pages (section-editable like Home)
  const editorPages = useMemo(
    () => (store?.pages.filter((p) => !p.type || p.type === 'home' || p.type === 'custom' || p.type === 'collection' || p.type === 'cart' || p.type === 'checkout') ?? []),
    [store?.pages]
  );

  // Custom pages only (for delete/rename)
  const customPages = useMemo(
    () => (store?.pages.filter((p) => p.type === 'custom') ?? []),
    [store?.pages]
  );

  // State for inline rename input
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // State for add-page dialog
  const [showAddPageDialog, setShowAddPageDialog] = useState(false);
  const [newPageName, setNewPageName] = useState('');

  // Handle adding a new custom page
  const handleAddPage = useCallback(() => {
    const name = newPageName.trim();
    if (!name) return;
    const newId = addCustomPage(name);
    if (newId) {
      toast.success(`Added "${name}" page`);
      setNewPageName('');
      setShowAddPageDialog(false);
    }
  }, [newPageName, addCustomPage]);

  // Handle deleting a custom page
  const handleDeletePage = useCallback((pageId: string, pageName: string) => {
    removeCustomPage(pageId);
    toast.success(`Deleted "${pageName}" page`);
  }, [removeCustomPage]);

  // Handle starting rename
  const handleStartRename = useCallback((pageId: string, currentName: string) => {
    setRenamingPageId(pageId);
    setRenameValue(currentName);
  }, []);

  // Handle committing rename
  const handleCommitRename = useCallback(() => {
    if (!renamingPageId || !renameValue.trim()) {
      setRenamingPageId(null);
      return;
    }
    renameCustomPage(renamingPageId, renameValue.trim());
    toast.success(`Renamed to "${renameValue.trim()}"`);
    setRenamingPageId(null);
  }, [renamingPageId, renameValue, renameCustomPage]);

  // Current page for section editing (only home-type pages have editable sections)
  const currentPage = useMemo(
    () => store?.pages.find((p) => p.id === editorCurrentPageId) ?? store?.pages.find((p) => p.isHomepage) ?? store?.pages[0],
    [store?.pages, editorCurrentPageId]
  );

  // Whether the currently selected page is a template (non-editable via visual editor)
  // Custom pages are section-editable (like home), only collection/cart/checkout/product are templates
  const isTemplatePage = currentPage && currentPage.type && currentPage.type !== 'home' && currentPage.type !== 'custom';

  const sections = currentPage?.sections ?? [];
  const pageId = currentPage?.id ?? '';

  const selectedSection = useMemo(
    () => sections.find((s) => s.id === selectedSectionId) ?? null,
    [sections, selectedSectionId]
  );

  // Drag end handler
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !pageId) return;

      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        moveSection(pageId, oldIndex, newIndex);
      }
    },
    [sections, pageId, moveSection]
  );

  // Add section handler
  const handleAddSection = useCallback(
    (type: SectionType) => {
      if (!pageId) return;
      const newSection = createDefaultSection(type);
      addSection(pageId, newSection);
      setSelectedSectionId(newSection.id);
      toast.success(`Added ${SECTION_TYPE_LABELS[type] || type} section`);
    },
    [pageId, addSection, setSelectedSectionId]
  );

  // Toggle visibility for section list items
  const handleToggleVisibility = useCallback(
    (sectionId: string) => {
      if (!store) return;
      const updatedStore = {
        ...store,
        updatedAt: new Date().toISOString(),
        pages: store.pages.map((page) => ({
          ...page,
          sections: page.sections.map((s) =>
            s.id === sectionId ? { ...s, visible: !s.visible } : s
          ),
        })),
      };
      setStore(updatedStore);
    },
    [store, setStore]
  );

  const handleDeleteSection = useCallback(
    (sectionId: string) => {
      if (!pageId) return;
      const section = sections.find((s) => s.id === sectionId);
      removeSection(pageId, sectionId);
      if (selectedSectionId === sectionId) {
        setSelectedSectionId(null);
      }
      if (section) {
        toast.success(`Deleted ${SECTION_TYPE_LABELS[section.type] || section.type} section`);
      }
    },
    [pageId, sections, selectedSectionId, removeSection, setSelectedSectionId]
  );

  // Handle page tab click (before early return to satisfy rules-of-hooks)
  const handlePageTabClick = useCallback(
    (pageId: string) => {
      if (renamingPageId && renamingPageId !== pageId) {
        setRenamingPageId(null); // Cancel rename if clicking another tab
      }
      setEditorCurrentPageId(pageId);
    },
    [setEditorCurrentPageId, renamingPageId]
  );

  if (!store || !currentPage) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950">
        <p className="text-sm text-zinc-600">No store loaded</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-zinc-950">
      {/* Section List Panel */}
      <div
        className={[
          'flex flex-col h-full overflow-hidden border-r border-zinc-800',
          selectedSection && !isTemplatePage ? 'w-64 lg:w-72' : 'w-full',
        ].join(' ')}
      >
        {/* Page Tabs + Add Page button */}
        <div className="flex items-center gap-0.5 overflow-x-auto border-b border-zinc-800 px-2 py-2" style={{scrollbarWidth: 'none'}}>
          {editorPages.map((page) => {
            const isActive = page.id === editorCurrentPageId;
            const isCustom = page.type === 'custom';
            const Icon = PAGE_TYPE_ICONS[page.type || 'home'] || Layout;
            const isRenaming = renamingPageId === page.id;

            return (
              <div key={page.id} className="flex shrink-0 items-center gap-0.5">
                <button
                  onClick={() => handlePageTabClick(page.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCommitRename();
                        if (e.key === 'Escape') setRenamingPageId(null);
                      }}
                      onBlur={handleCommitRename}
                      className="w-16 bg-zinc-700 border border-zinc-600 rounded px-1 py-0 text-xs text-zinc-100 outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="whitespace-nowrap">{page.name}</span>
                  )}
                </button>
                {/* Context menu for custom pages: rename + delete */}
                {isCustom && !isRenaming && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className="flex items-center justify-center w-5 h-5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Page actions"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-36 p-1 bg-zinc-900 border-zinc-800" align="start">
                      <button
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                        onClick={() => handleStartRename(page.id, page.name)}
                      >
                        <Pencil className="h-3 w-3" />
                        Rename
                      </button>
                      <button
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-red-400 hover:bg-red-400/10 hover:text-red-300"
                        onClick={() => handleDeletePage(page.id, page.name)}
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete Page
                      </button>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            );
          })}

          {/* Add Page button */}
          <Popover open={showAddPageDialog} onOpenChange={setShowAddPageDialog}>
            <PopoverTrigger asChild>
              <button className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-zinc-600 hover:bg-zinc-800/50 hover:text-zinc-400 transition-colors">
                <Plus className="h-3 w-3" />
                <span className="whitespace-nowrap">Page</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3 bg-zinc-900 border-zinc-800" align="start">
              <h4 className="text-xs font-semibold text-zinc-300 mb-2">Add Custom Page</h4>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newPageName}
                  onChange={(e) => setNewPageName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddPage();
                    if (e.key === 'Escape') setShowAddPageDialog(false);
                  }}
                  placeholder="Page name"
                  className="flex-1 h-8 bg-zinc-800 border-zinc-700 text-zinc-100 text-sm"
                />
                <Button size="sm" onClick={handleAddPage} disabled={!newPageName.trim()} className="h-8 px-3">
                  Add
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Panel header — only for section-editable pages */}
        {!isTemplatePage && (
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <h3 className="text-sm font-semibold text-zinc-200">Sections</h3>
            <span className="text-xs text-zinc-600 tabular-nums">
              {sections.length}
            </span>
          </div>
        )}

        {/* Section list with DnD — only for section-editable pages */}
        {!isTemplatePage ? (
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2">
              {sections.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800/60">
                    <FileText className="h-4 w-4 text-zinc-500" />
                  </div>
                  <p className="text-xs text-zinc-500">No sections yet</p>
                  <p className="mt-1 text-[10px] text-zinc-600">Click "Add Section" below to add content</p>
                </div>
              ) : (
              <DndContext
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sections.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-0.5">
                    {sections.map((section) => (
                      <SortableSectionItem
                        key={section.id}
                        section={section}
                        isSelected={section.id === selectedSectionId}
                        onSelect={() =>
                          setSelectedSectionId(
                            section.id === selectedSectionId ? null : section.id
                          )
                        }
                        onToggleVisibility={() =>
                          handleToggleVisibility(section.id)
                        }
                        onDelete={() => handleDeleteSection(section.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-1 min-h-0 flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800/60">
              {(() => {
                const TIcon = PAGE_TYPE_ICONS[currentPage.type || 'home'] || Layout;
                return <TIcon className="h-6 w-6 text-zinc-500" />;
              })()}
            </div>
            <p className="text-sm font-medium text-zinc-300">{PAGE_TYPE_LABELS[currentPage.type || 'home'] || 'Template'} Page</p>
            <p className="mt-1.5 max-w-[200px] text-xs leading-relaxed text-zinc-600">
              Switch to Home to edit sections.
            </p>
          </div>
        )}

        {/* Add section button — only for section-editable pages */}
        {!isTemplatePage && (
          <div className="border-t border-zinc-800 p-2">
            <AddSectionPopover onAdd={handleAddSection} />
          </div>
        )}
      </div>

      {/* Properties Panel — only for section-editable pages */}
      {selectedSection && !isTemplatePage && (
        <div className="hidden md:flex w-72 lg:w-80 flex-shrink-0 min-h-0 border-r border-zinc-800">
          {selectedSection.type === 'hero' ? (
            <HeroPropertiesPanel section={selectedSection} pageId={pageId} />
          ) : (
            <PropertiesPanel section={selectedSection} pageId={pageId} />
          )}
        </div>
      )}
    </div>
  );
}

export default VisualEditor;
